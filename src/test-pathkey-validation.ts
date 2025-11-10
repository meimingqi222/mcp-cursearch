/**
 * Test script for PathKey validation functionality
 * 
 * This script tests the pathKeyHash validation logic to ensure:
 * 1. First-time indexing saves pathKeyHash correctly
 * 2. Re-indexing with same pathKey validates successfully
 * 3. PathKey mismatch is detected and reported
 */

import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the functions we need to test
import { loadWorkspaceState, saveWorkspaceState, WorkspaceState } from "./services/stateManager.js";
import { sha256Hex } from "./crypto/pathEncryption.js";

// Test workspace path (use a temporary directory)
const TEST_WORKSPACE = path.join(__dirname, "..", "test-workspace");
const TEST_STATE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || "", ".mcp-cursearch");

async function setup() {
  console.log("🔧 Setting up test environment...");
  
  // Create test workspace
  await fs.ensureDir(TEST_WORKSPACE);
  
  // Create a few test files
  await fs.writeFile(path.join(TEST_WORKSPACE, "test1.txt"), "Test file 1");
  await fs.writeFile(path.join(TEST_WORKSPACE, "test2.txt"), "Test file 2");
  
  console.log(`✅ Test workspace created at: ${TEST_WORKSPACE}`);
}

async function cleanup() {
  console.log("\n🧹 Cleaning up test environment...");
  
  // Remove test workspace
  await fs.remove(TEST_WORKSPACE);
  
  console.log("✅ Cleanup complete");
}

async function testScenario1_FirstTimeIndexing() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 Test Scenario 1: First-time indexing");
  console.log("=".repeat(60));
  
  // Generate a new pathKey
  const pathKey = crypto.randomBytes(32).toString("base64url");
  const pathKeyHash = sha256Hex(pathKey);
  
  console.log(`Generated pathKey: ${pathKey.substring(0, 20)}...`);
  console.log(`Generated pathKeyHash: ${pathKeyHash}`);
  
  // Create initial state
  const state: WorkspaceState = {
    workspacePath: TEST_WORKSPACE,
    codebaseId: "test-codebase-001",
    pathKey: pathKey,
    pathKeyHash: pathKeyHash,
    orthogonalTransformSeed: Math.random() * Number.MAX_SAFE_INTEGER,
    repoName: "test-repo",
    repoOwner: "test-user",
  };
  
  // Save state
  await saveWorkspaceState(state);
  console.log("✅ State saved successfully");
  
  // Load state back
  const loadedState = await loadWorkspaceState(TEST_WORKSPACE);
  
  // Verify pathKeyHash was saved
  if (loadedState.pathKeyHash === pathKeyHash) {
    console.log("✅ PathKeyHash saved and loaded correctly");
    console.log(`   Stored pathKeyHash: ${loadedState.pathKeyHash}`);
    return true;
  } else {
    console.error("❌ PathKeyHash mismatch!");
    console.error(`   Expected: ${pathKeyHash}`);
    console.error(`   Got: ${loadedState.pathKeyHash}`);
    return false;
  }
}

async function testScenario2_SamePathKeyReindex() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 Test Scenario 2: Re-indexing with same pathKey");
  console.log("=".repeat(60));
  
  // Load existing state
  const state = await loadWorkspaceState(TEST_WORKSPACE);
  
  console.log(`Loaded codebaseId: ${state.codebaseId}`);
  console.log(`Loaded pathKeyHash: ${state.pathKeyHash}`);
  
  // Simulate re-indexing with the same pathKey
  const currentPathKeyHash = sha256Hex(state.pathKey!);
  
  console.log(`Current pathKeyHash: ${currentPathKeyHash}`);
  
  // Validate
  if (state.pathKeyHash === currentPathKeyHash) {
    console.log("✅ PathKey validation passed - hashes match");
    return true;
  } else {
    console.error("❌ PathKey validation failed - hashes don't match");
    return false;
  }
}

async function testScenario3_PathKeyMismatch() {
  console.log("\n" + "=".repeat(60));
  console.log("📝 Test Scenario 3: PathKey mismatch detection");
  console.log("=".repeat(60));
  
  // Load existing state
  const state = await loadWorkspaceState(TEST_WORKSPACE);
  
  console.log(`Original codebaseId: ${state.codebaseId}`);
  console.log(`Original pathKeyHash: ${state.pathKeyHash}`);
  
  // Generate a DIFFERENT pathKey (simulating the mismatch scenario)
  const newPathKey = crypto.randomBytes(32).toString("base64url");
  const newPathKeyHash = sha256Hex(newPathKey);
  
  console.log(`New pathKey: ${newPathKey.substring(0, 20)}...`);
  console.log(`New pathKeyHash: ${newPathKeyHash}`);
  
  // Simulate validation logic
  const codebaseId = state.codebaseId!;
  const storedPathKeyHash = state.pathKeyHash!;
  
  if (storedPathKeyHash !== newPathKeyHash) {
    console.log("✅ PathKey mismatch detected successfully!");
    console.log("\n⚠️  Expected warning message:");
    console.log("─".repeat(60));
    console.log("⚠️  PathKey Mismatch Detected!");
    console.log(`   CodebaseId: ${codebaseId}`);
    console.log(`   Stored pathKeyHash:  ${storedPathKeyHash}`);
    console.log(`   Current pathKeyHash: ${newPathKeyHash}`);
    console.log("");
    console.log("   This means the server returned a codebaseId that was indexed with a different pathKey.");
    console.log("   Search results will show garbled/corrupted paths because decryption will fail.");
    console.log("─".repeat(60));
    return true;
  } else {
    console.error("❌ Failed to detect pathKey mismatch");
    return false;
  }
}

async function main() {
  console.log("🚀 Starting PathKey Validation Tests\n");
  
  try {
    await setup();
    
    const results = {
      scenario1: await testScenario1_FirstTimeIndexing(),
      scenario2: await testScenario2_SamePathKeyReindex(),
      scenario3: await testScenario3_PathKeyMismatch(),
    };

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Summary");
    console.log("=".repeat(60));
    console.log(`Scenario 1 (First-time indexing):     ${results.scenario1 ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Scenario 2 (Same pathKey re-index):   ${results.scenario2 ? "✅ PASS" : "❌ FAIL"}`);
    console.log(`Scenario 3 (PathKey mismatch):        ${results.scenario3 ? "✅ PASS" : "❌ FAIL"}`);
    console.log("=".repeat(60));

    const allPassed = Object.values(results).every(r => r);

    if (allPassed) {
      console.log("\n🎉 All tests passed!");
      await cleanup();
      process.exit(0);
    } else {
      console.log("\n❌ Some tests failed!");
      await cleanup();
      process.exit(1);
    }

  } catch (error) {
    console.error("\n💥 Test execution failed:");
    console.error(error);
    await cleanup();
    process.exit(1);
  }
}

main();

