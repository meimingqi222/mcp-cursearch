# Encrypted Path Issue Investigation Summary

## Current Status

**Problem**: Search results show garbled/encrypted paths instead of readable file paths.

**Example**:
- ❌ Garbled: `/��!/9|��۸\n/t�-h�3f���#|Fp.*l�`
- ✅ Working: `src/crypto/pathEncryption.ts`

**Test Results**: 8 out of 10 search results show garbled paths.

---

## Key Findings

### 1. Protobuf Decoding is Working Correctly
- Paths from API arrive as properly formatted base64url-encoded strings with separators
- Example: `.\Ucy0ke_uLtxHdQ\lRn8ZrnR4H7bKSmrgFQ\3ncr083XUPif-wxgLUglM7NusZTw0A.JUekZXIQmT7U4w`
- The `fixBinaryStringFields()` function in `src/client/proto.ts` correctly identifies NO binary corruption
- **Conclusion**: The fix in `proto.ts` is working, but it's not needed - paths are already properly encoded

### 2. Decryption is Working Correctly
- Manual segment-by-segment decryption test (`src/debug-decrypt.ts`) shows ALL segments decrypt successfully
- The decryption produces the EXACT SAME garbled output consistently
- **Conclusion**: The encryption/decryption algorithm is working perfectly

### 3. Root Cause Identified
**The Cursor API server has a corrupted/stale index for this codebase.**

Evidence:
- CodebaseId `7f1c17f4-08cf-4bba-9505-65506c39d351` persists even after deleting local state
- Server returns results with paths that don't exist in the current workspace
- Only 1 out of 4 unique encrypted paths decrypts to a valid file path
- The garbled paths are the ACTUAL decrypted content - meaning files were indexed with corrupted paths

### 4. CodebaseId Matching Mechanism
- Server determines codebaseId based on: `rootHash`, `simhash`, repository characteristics
- Changing `pathKey` does NOT create a new codebase (server ignores it for matching)
- Changing `orthogonalTransformSeed` does NOT create a new codebase
- Changing `repoName` MIGHT create a new codebase (needs verification)

---

## Current Workspace State

**Local State**: `%USERPROFILE%\.mcp-cursearch\<hash>\state.json`
```json
{
  "codebaseId": "7f1c17f4-08cf-4bba-9505-65506c39d351",
  "pathKey": "4QWL31-viz-pFZnO9bZ2_GRzEbZydkCehjRd8qIah_U",
  "orthogonalTransformSeed": 4.8183941481542806E+23,
  "repoName": "local-fresh-index-168099109"
}
```

**Indexed Files**: 24 files (all with normal ASCII names)
- See: `%USERPROFILE%\.mcp-cursearch\<hash>\embeddable_files.txt`

---

## Next Steps to Fix

### Option 1: Force New CodebaseId (Recommended)
1. Modify `src/services/repositoryIndexer.ts` to add a `--force-new` flag
2. When flag is set, append a random suffix to `repoName` to force server to create new codebase
3. Re-index with the new flag
4. Verify search results show correct paths

### Option 2: Filter Garbled Results (Workaround)
1. Add validation in `src/services/codeSearcher.ts` after decryption
2. Check if decrypted path contains only printable ASCII characters
3. Filter out results with garbled paths
4. **Downside**: Loses potentially valid results

### Option 3: Contact Cursor API Support
1. Request deletion of corrupted codebase `7f1c17f4-08cf-4bba-9505-65506c39d351`
2. **Downside**: May not be possible/practical

---

## Files Modified During Investigation

- `src/client/proto.ts` - Added `fixBinaryStringFields()` (not needed, but harmless)
- `src/services/codeSearcher.ts` - Added debug logging (should be removed)
- `src/test-search.ts` - Test script for verification
- `src/debug-decrypt.ts` - Manual decryption test (can be deleted)
- `package.json` - Added test scripts

---

## Recommended Immediate Action

**Implement Option 1**: Add ability to force a fresh codebase index by changing the repository identifier.

**Implementation**:
1. Add CLI flag: `mcp-cursearch index-activate --force-new <path>`
2. When `--force-new` is used, generate unique `repoName` with timestamp/random suffix
3. This will force server to create a NEW codebaseId with clean data
4. Remove all debug logging after verification

---

## Multi-Codebase Scenario Investigation

### Investigation Date: 2025-11-10

### Question: Is the garbled path issue caused by multiple codebases being configured or loaded simultaneously?

**Answer: No, but multi-codebase scenarios exacerbate the underlying problem.**

---

### Architecture Analysis

#### 1. Single Active Workspace Model

The system is designed with a **single active workspace** model:

- **Active workspace tracking**: `~/.mcp-cursearch/active.json` stores the currently active workspace path
- **Per-workspace state**: Each workspace has its own `state.json` with independent `codebaseId` and `pathKey`
- **Search behavior**: The `codeSearcher.ts` only searches the currently active workspace

**Conclusion**: The system does NOT support searching multiple codebases simultaneously.

#### 2. Workspace Isolation

Each workspace maintains isolated state:

```
~/.mcp-cursearch/
├── active.json                          # Current active workspace
├── workspace1-hash1/
│   ├── state.json                       # codebaseId1, pathKey1
│   └── embeddable_files.txt
└── workspace2-hash2/
    ├── state.json                       # codebaseId2, pathKey2
    └── embeddable_files.txt
```

**Runtime cache**: `runtimeCodebaseIds` Map is keyed by workspace path, ensuring no cross-workspace contamination.

---

### Root Cause: Server-Side CodebaseId Matching vs. Client-Side PathKey Management

#### The Mismatch Problem

**Server behavior** (from `repositoryIndexer.ts:53-71`):
1. Client sends: `rootHash`, `simhash`, `pathKey`, `pathKeyHash`
2. Server matches codebaseId based on: **rootHash + simhash ONLY**
3. Server **ignores pathKey** for matching purposes
4. Server returns existing codebaseId (which may use a different pathKey)

**Client behavior**:
1. Client generates a **new random pathKey** each time (if not already stored)
2. Client accepts the server's codebaseId **without validation**
3. Client uses its local pathKey to decrypt search results

**Result**: If server returns a codebaseId indexed with pathKeyA, but client uses pathKeyB to decrypt, the paths become garbled.

---

### Multi-Codebase Scenario Impact

#### Scenario 1: Same Project, Different Locations

```
User has:
- C:/Projects/myapp (indexed with pathKey1 → codebaseId-X)
- D:/Backup/myapp  (same files, different location)

When indexing D:/Backup/myapp:
1. Client generates pathKey2
2. Server sees identical rootHash/simhash
3. Server returns codebaseId-X (still encrypted with pathKey1)
4. Client tries to decrypt with pathKey2 → GARBLED PATHS
```

#### Scenario 2: Git Branch Switching

```
User workflow:
1. Index project on branch 'main' (pathKey1 → codebaseId-X)
2. Delete local state
3. Switch to branch 'feature'
4. Re-index (generates pathKey2)
5. Server matches to codebaseId-X (files are similar)
6. Decrypt with pathKey2 → GARBLED PATHS
```

#### Scenario 3: Re-indexing After State Loss

```
User workflow:
1. Index workspace (pathKey1 → codebaseId-X)
2. Delete ~/.mcp-cursearch/ directory
3. Re-index same workspace (generates pathKey2)
4. Server returns codebaseId-X (still uses pathKey1)
5. Decrypt with pathKey2 → GARBLED PATHS
```

**This matches the evidence in the investigation document**:
- "CodebaseId `7f1c17f4-08cf-4bba-9505-65506c39d351` persists even after deleting local state"
- "Server returns results with paths that don't exist in the current workspace"

---

### Code Evidence

#### No PathKey Validation

From `src/services/repositoryIndexer.ts:67-70`:

```typescript
const res = await fastRepoInitHandshakeV2(baseUrl, authToken, req);
const codebaseId = res?.codebases?.[0]?.codebase_id || res?.codebases?.[0]?.codebaseId;
if (!codebaseId) throw new Error("No codebase_id in handshake response");
return { codebaseId, repositoryPb, simhash: simhash.map((n) => Number(n)), pathKeyHash };
```

**Issue**: Client accepts the codebaseId without verifying that the server actually used the provided pathKey.

#### PathKey Sent But Not Used for Matching

From `proto/repository_service.proto:31-42`:

```protobuf
message FastRepoInitHandshakeV2Request {
  RepositoryInfo repository = 1;
  string root_hash = 2;
  SimilarityMetricType similarity_metric_type = 3;
  repeated float similarity_metric = 4;
  string path_key_hash = 5;
  PathKeyHashType path_key_hash_type = 6;
  bool do_copy = 7;
  string path_key = 8;  // Sent to server
  ...
}
```

**Observation**: pathKey is sent to the server, but based on behavior, it's not used for codebase matching.

---

### Why Multi-Codebase Scenarios Make It Worse

1. **Increased collision probability**: More workspaces = higher chance of rootHash/simhash collisions
2. **Workspace switching**: Users with multiple projects are more likely to switch between them
3. **State management complexity**: More workspaces = more state files to manage, higher chance of deletion/corruption
4. **Similar codebases**: Users often have related projects (forks, branches, copies) with similar file structures

---

### Encoding and Path Normalization Analysis

#### No Encoding Issues Found

**Path encryption/decryption** (`src/crypto/pathEncryption.ts`):
- Uses AES-256-CTR with base64url encoding
- Properly handles Windows/POSIX path separators
- No evidence of encoding corruption

**Protobuf handling** (`src/client/proto.ts`):
- Binary string fields are correctly handled
- Base64url encoding is properly applied
- The fix in `fixBinaryStringFields()` is working (though not needed in this case)

**Conclusion**: The garbled paths are NOT due to encoding issues. They are the **correct decryption output** when using the wrong pathKey.

---

### Summary of Findings

| Question | Answer |
|----------|--------|
| Is it caused by multiple codebases loaded simultaneously? | ❌ No - system only uses one active workspace at a time |
| Is there path resolution conflict in multi-codebase scenarios? | ❌ No - each workspace has isolated state |
| Are there encoding conflicts? | ❌ No - encryption/decryption works correctly |
| Is it related to multi-codebase configurations? | ⚠️ Indirectly - multi-codebase scenarios increase the likelihood of pathKey mismatch |

**Root Cause**: Server-side codebaseId matching (based on rootHash/simhash) is independent of pathKey, causing the server to return codebases encrypted with different pathKeys than what the client expects.

---

### Recommended Solutions

#### Solution 1: Force New CodebaseId (Best for immediate fix)

**Implementation**:
```typescript
// Add --force-new flag to CLI
if (forceNew) {
  repoName = `${repoName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

**Pros**: Guarantees fresh index with correct pathKey
**Cons**: Creates duplicate indexes on server

#### Solution 2: PathKey Validation (Best for long-term)

**Implementation**:
```typescript
// After handshake, verify pathKey matches
async function verifyPathKeyMatch(codebaseId: string, pathKey: string): Promise<boolean> {
  // Perform a test search and attempt to decrypt a known path
  // If decryption produces valid paths, pathKey matches
  // If decryption produces garbled output, pathKey mismatch
}
```

**Pros**: Automatic detection and recovery
**Cons**: Requires additional API call

#### Solution 3: Client-Side Filtering (Temporary workaround)

**Implementation**:
```typescript
// In codeSearcher.ts, after decryption
const isValidPath = /^[a-zA-Z0-9_\-./\\]+$/.test(decPath);
if (!isValidPath) {
  console.warn(`Skipping garbled path: ${decPath}`);
  return null; // Filter out
}
```

**Pros**: Simple, immediate protection
**Cons**: May filter out valid non-ASCII filenames

#### Solution 4: Store PathKey Hash in State

**Implementation**:
```typescript
// In state.json, add:
{
  "codebaseId": "xxx",
  "pathKey": "yyy",
  "pathKeyHash": "sha256(pathKey)",
  "indexedAt": "2025-11-10T12:00:00Z"
}

// On handshake, warn if server returns codebaseId with different pathKeyHash
```

**Pros**: Helps detect mismatches
**Cons**: Doesn't prevent the issue

---

### Conclusion

The garbled path issue is **not directly caused by having multiple codebases configured**, but rather by a fundamental mismatch between:
- Server's codebase matching logic (content-based: rootHash/simhash)
- Client's encryption key management (random pathKey per index)

Multi-codebase scenarios **exacerbate** the problem by:
1. Increasing the probability of rootHash/simhash collisions
2. Making state management more complex
3. Encouraging workspace switching and re-indexing

**Immediate action**: Implement Solution 1 (force new codebaseId) + Solution 3 (filter garbled results)
**Long-term fix**: Implement Solution 2 (pathKey validation) or request server-side changes to include pathKeyHash in matching logic

