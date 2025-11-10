# PathKey 验证实现文档

## 概述

本文档描述了方案 2（本地存储 PathKeyHash 映射）的实现，用于解决路径乱码问题。

## 问题背景

当服务器基于 `rootHash` + `simhash` 返回一个已存在的 `codebaseId` 时，如果该 codebaseId 是用不同的 `pathKey` 索引的，客户端使用当前的 `pathKey` 解密搜索结果会产生乱码路径。

## 解决方案

通过在本地存储 `pathKeyHash`，在每次索引时验证 `pathKey` 是否与之前使用的一致。

## 实现细节

### 1. 数据结构修改

#### `src/services/stateManager.ts`

在 `WorkspaceState` 类型中添加了 `pathKeyHash` 字段：

```typescript
export type WorkspaceState = {
  workspacePath: string;
  codebaseId?: string;
  pathKey?: string;
  pathKeyHash?: string;  // 新增字段
  orthogonalTransformSeed?: number;
  repoName?: string;
  repoOwner?: string;
  pendingChanges?: boolean;
};
```

更新了 `saveWorkspaceState` 函数以持久化 `pathKeyHash`：

```typescript
const toPersist: WorkspaceState = {
  workspacePath: st.workspacePath,
  codebaseId: st.codebaseId,
  pathKey: st.pathKey,
  pathKeyHash: st.pathKeyHash,  // 保存 pathKeyHash
  orthogonalTransformSeed: st.orthogonalTransformSeed,
  repoName: st.repoName,
  repoOwner: st.repoOwner,
};
```

### 2. 验证逻辑

#### `src/services/repositoryIndexer.ts`

添加了 `validateCodebasePathKey` 函数：

```typescript
function validateCodebasePathKey(
  codebaseId: string,
  pathKey: string,
  st: WorkspaceState
): { isValid: boolean; warning?: string; action?: string } {
  const currentPathKeyHash = sha256Hex(pathKey);
  
  // 如果是新的 codebaseId，接受
  if (!st.codebaseId || st.codebaseId !== codebaseId) {
    return { isValid: true };
  }
  
  // 如果有存储的 pathKeyHash，验证是否匹配
  if (st.pathKeyHash && st.pathKeyHash !== currentPathKeyHash) {
    const warning = [
      "⚠️  PathKey Mismatch Detected!",
      `   CodebaseId: ${codebaseId}`,
      `   Stored pathKeyHash:  ${st.pathKeyHash}`,
      `   Current pathKeyHash: ${currentPathKeyHash}`,
      "",
      "   This means the server returned a codebaseId that was indexed with a different pathKey.",
      "   Search results will show garbled/corrupted paths because decryption will fail.",
      "",
      "   Recommended actions:",
      "   1. Use the stored pathKey to maintain consistency",
      "   2. Or delete the state file and re-index to create a fresh codebase",
      "   3. Or use --force-new flag (if available) to force a new codebaseId",
    ].join("\n");
    
    return {
      isValid: false,
      warning,
      action: "pathkey_mismatch"
    };
  }
  
  return { isValid: true };
}
```

在 `indexProject` 函数中调用验证：

```typescript
const { codebaseId, repositoryPb, simhash, pathKeyHash } = await initialHandshake(...);

// 验证 pathKey 匹配（仅在第一个批次检查）
if (i === 0) {
  const validation = validateCodebasePathKey(codebaseId, pathKey!, st);
  if (!validation.isValid) {
    progressBar.stop();
    console.error(validation.warning);
    throw new Error("PathKey mismatch detected. Cannot proceed with indexing.");
  }
}
```

保存状态时包含 `pathKeyHash`：

```typescript
const finalPathKeyHash = sha256Hex(pathKey!);

st = {
  ...st,
  workspacePath,
  pathKey,
  pathKeyHash: finalPathKeyHash,  // 保存计算的 hash
  codebaseId: lastCodebaseId,
  repoName,
  repoOwner: st.repoOwner || "local-user",
  pendingChanges: false,
};
await saveWorkspaceState(st);
```

## 测试

### 测试脚本

创建了 `src/test-pathkey-validation.ts` 测试脚本，包含三个测试场景：

1. **场景 1：首次索引**
   - 生成新的 pathKey 和 pathKeyHash
   - 保存到状态文件
   - 验证 pathKeyHash 正确保存和加载

2. **场景 2：使用相同 pathKey 重新索引**
   - 加载现有状态
   - 验证当前 pathKey 的 hash 与存储的匹配

3. **场景 3：PathKey 不匹配检测**
   - 生成不同的 pathKey
   - 验证能够检测到 pathKeyHash 不匹配
   - 显示预期的警告消息

### 运行测试

#### Windows:
```bash
scripts\run-pathkey-test.bat
```

#### Linux/Mac:
```bash
bash scripts/run-pathkey-test.sh
```

#### 直接运行:
```bash
# 编译
npx tsc -p .

# 运行测试
node dist/test-pathkey-validation.js
```

### 测试结果

所有三个测试场景都应该通过：

```
============================================================
📊 Test Summary
============================================================
Scenario 1 (First-time indexing):     ✅ PASS
Scenario 2 (Same pathKey re-index):   ✅ PASS
Scenario 3 (PathKey mismatch):        ✅ PASS
============================================================

🎉 All tests passed!
```

## 使用场景

### 正常流程

1. **首次索引**：
   - 生成新的 pathKey
   - 服务器返回新的 codebaseId
   - 保存 pathKey 和 pathKeyHash 到状态文件

2. **后续索引**：
   - 加载存储的 pathKey
   - 服务器可能返回相同的 codebaseId
   - 验证通过，继续索引

### 错误检测

当检测到 pathKey 不匹配时：

```
⚠️  PathKey Mismatch Detected!
   CodebaseId: 7f1c17f4-08cf-4bba-9505-65506c39d351
   Stored pathKeyHash:  ac538b23dc80e43011f9654a7432bfcaacd55a100ab27851e49c988e9c54171e
   Current pathKeyHash: a3ce8bc4ce4160bdc0b33edefb17b8d4f8f6573295acc62c2f038a2a413e9472

   This means the server returned a codebaseId that was indexed with a different pathKey.
   Search results will show garbled/corrupted paths because decryption will fail.

   Recommended actions:
   1. Use the stored pathKey to maintain consistency
   2. Or delete the state file and re-index to create a fresh codebase
   3. Or use --force-new flag (if available) to force a new codebaseId
```

索引过程会停止，防止创建无法正确解密的索引。

## 优点

✅ **快速检测**：无需额外 API 调用  
✅ **提前警告**：在索引开始时就能发现问题  
✅ **简单实现**：只需要本地状态管理  
✅ **清晰提示**：提供详细的错误信息和解决方案  

## 限制

❌ 只能检测本地已知的 codebaseId  
❌ 无法检测服务器端的 pathKey 不匹配（如果状态文件被删除）  

## 后续改进

可以考虑添加：
1. `--force-new` 标志来强制创建新的 codebaseId
2. 自动恢复机制（使用存储的 pathKey）
3. 远程验证（通过测试搜索和解密）

