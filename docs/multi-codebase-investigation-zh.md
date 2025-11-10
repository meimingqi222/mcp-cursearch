# 多代码库场景下路径损坏问题调查报告

**调查日期**: 2025-11-10  
**调查重点**: 路径乱码是否由多代码库配置或同时加载引起

---

## 核心结论

❌ **不是**由多个代码库同时操作引起  
⚠️ **但是**多代码库场景会加剧潜在问题  
✅ **根本原因**：服务器端 codebaseId 匹配机制与客户端 pathKey 管理不一致

---

## 系统架构分析

### 1. 单一活动工作区模型

系统采用**单一活动工作区**设计：

```
~/.mcp-cursearch/
├── active.json              # 当前活动的工作区路径
├── workspace1-hash/
│   ├── state.json          # 独立的 codebaseId1, pathKey1
│   └── embeddable_files.txt
└── workspace2-hash/
    ├── state.json          # 独立的 codebaseId2, pathKey2
    └── embeddable_files.txt
```

**关键特性**：
- 每次只有一个活动工作区
- 每个工作区有独立的状态文件
- 搜索时只查询当前活动工作区
- 运行时缓存按工作区路径隔离

**结论**：系统**不支持**同时搜索多个代码库。

---

## 根本原因：PathKey 不匹配

### 问题机制

**服务器行为**（`repositoryIndexer.ts:53-71`）：
1. 客户端发送：`rootHash`、`simhash`、`pathKey`、`pathKeyHash`
2. 服务器**仅基于** `rootHash` + `simhash` 匹配 codebaseId
3. 服务器**忽略** `pathKey` 进行匹配
4. 服务器返回已存在的 codebaseId（可能使用不同的 pathKey 加密）

**客户端行为**：
1. 每次索引生成**新的随机 pathKey**（如果本地没有）
2. 客户端**无条件接受**服务器返回的 codebaseId
3. 客户端使用本地 pathKey 解密搜索结果

**结果**：
```
服务器返回的路径用 pathKeyA 加密
客户端用 pathKeyB 解密
→ 产生乱码
```

### 代码证据

**无 PathKey 验证**（`repositoryIndexer.ts:67-70`）：
```typescript
const res = await fastRepoInitHandshakeV2(baseUrl, authToken, req);
const codebaseId = res?.codebases?.[0]?.codebase_id;
if (!codebaseId) throw new Error("No codebase_id in handshake response");
return { codebaseId, ... };  // ❌ 直接接受，无验证
```

---

## 多代码库场景的影响

### 场景 1：同一项目的不同副本

```
用户有：
- C:/Projects/myapp  (用 pathKey1 索引 → codebaseId-X)
- D:/Backup/myapp    (相同文件，不同位置)

索引 D:/Backup/myapp 时：
1. 客户端生成 pathKey2
2. 服务器检测到相同的 rootHash/simhash
3. 服务器返回 codebaseId-X（仍用 pathKey1 加密）
4. 客户端用 pathKey2 解密 → ❌ 乱码
```

### 场景 2：Git 分支切换

```
1. 在 'main' 分支索引（pathKey1 → codebaseId-X）
2. 删除本地状态
3. 切换到 'feature' 分支
4. 重新索引（生成 pathKey2）
5. 服务器匹配到 codebaseId-X（文件相似）
6. 用 pathKey2 解密 → ❌ 乱码
```

### 场景 3：状态丢失后重新索引

```
1. 索引工作区（pathKey1 → codebaseId-X）
2. 删除 ~/.mcp-cursearch/ 目录
3. 重新索引同一工作区（生成 pathKey2）
4. 服务器返回 codebaseId-X（仍用 pathKey1）
5. 用 pathKey2 解密 → ❌ 乱码
```

**这与调查文档的证据完全吻合**：
- "CodebaseId 在删除本地状态后仍然存在"
- "服务器返回当前工作区不存在的路径"

---

## 为什么多代码库场景会加剧问题

1. **碰撞概率增加**：更多工作区 = 更高的 rootHash/simhash 碰撞概率
2. **工作区切换频繁**：多项目用户更容易切换工作区
3. **状态管理复杂**：更多状态文件 = 更高的删除/损坏风险
4. **相似代码库**：用户常有相关项目（分支、副本、fork）

---

## 路径解析和编码分析

### 无编码问题

**路径加密/解密**（`src/crypto/pathEncryption.ts`）：
- ✅ 使用 AES-256-CTR + base64url 编码
- ✅ 正确处理 Windows/POSIX 路径分隔符
- ✅ 无编码损坏证据

**Protobuf 处理**（`src/client/proto.ts`）：
- ✅ 二进制字符串字段正确处理
- ✅ Base64url 编码正确应用

**结论**：乱码路径**不是**编码问题，而是用错误 pathKey 解密的**正确输出**。

---

## 解决方案

### 方案 1：强制创建新 CodebaseId（立即修复）

```typescript
// 添加 --force-new 标志
if (forceNew) {
  repoName = `${repoName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

**优点**：保证使用正确 pathKey 的全新索引  
**缺点**：在服务器上创建重复索引

### 方案 2：PathKey 验证（长期方案）

```typescript
// 握手后验证 pathKey 匹配
async function verifyPathKeyMatch(codebaseId, pathKey): Promise<boolean> {
  // 执行测试搜索并尝试解密已知路径
  // 如果解密产生有效路径 → pathKey 匹配
  // 如果解密产生乱码 → pathKey 不匹配
}
```

**优点**：自动检测和恢复  
**缺点**：需要额外 API 调用

### 方案 3：客户端过滤（临时方案）

```typescript
// 解密后验证路径有效性
const isValidPath = /^[a-zA-Z0-9_\-./\\]+$/.test(decPath);
if (!isValidPath) {
  console.warn(`跳过乱码路径: ${decPath}`);
  return null;
}
```

**优点**：简单，立即生效  
**缺点**：可能过滤掉有效的非 ASCII 文件名

---

## 总结

| 问题 | 答案 |
|------|------|
| 是否由多代码库同时加载引起？ | ❌ 否 - 系统一次只使用一个活动工作区 |
| 多代码库场景下是否有路径解析冲突？ | ❌ 否 - 每个工作区有隔离的状态 |
| 是否有编码冲突？ | ❌ 否 - 加密/解密工作正常 |
| 是否与多代码库配置相关？ | ⚠️ 间接相关 - 多代码库场景增加 pathKey 不匹配的可能性 |

**根本原因**：服务器端基于内容（rootHash/simhash）匹配 codebaseId，独立于 pathKey，导致服务器返回用不同 pathKey 加密的代码库。

**立即行动**：实施方案 1（强制新 codebaseId）+ 方案 3（过滤乱码结果）  
**长期修复**：实施方案 2（pathKey 验证）或请求服务器端修改以在匹配逻辑中包含 pathKeyHash

