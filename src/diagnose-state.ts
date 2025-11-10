import { loadWorkspaceState } from "./services/stateManager.js";
import crypto from "crypto";

async function diagnose() {
  const workspacePath = "i:\\agentic-coding-proj\\cursor-codebase-search";
  
  console.log("🔍 Diagnostic Report");
  console.log("=".repeat(80));
  console.log();
  
  // Load current state
  const state = await loadWorkspaceState(workspacePath);
  
  console.log("📁 Workspace Path:", workspacePath);
  console.log();
  
  // Calculate expected repoName
  const expectedRepoName = `local-${crypto.createHash("sha256").update(workspacePath).digest("hex").slice(0, 12)}`;
  console.log("🏷️  Expected RepoName:", expectedRepoName);
  console.log("🏷️  Stored RepoName:  ", state.repoName || "(not set)");
  console.log();
  
  console.log("🔑 Current State:");
  console.log("   CodebaseId:  ", state.codebaseId || "(not set)");
  console.log("   PathKey:     ", state.pathKey ? `${state.pathKey.substring(0, 20)}...` : "(not set)");
  console.log("   PathKeyHash: ", state.pathKeyHash || "(not set)");
  console.log("   OrthogonalTransformSeed:", state.orthogonalTransformSeed || "(not set)");
  console.log();
  
  // Calculate current pathKeyHash
  if (state.pathKey) {
    const currentHash = crypto.createHash("sha256").update(state.pathKey).digest("hex");
    console.log("🔐 PathKey Verification:");
    console.log("   Stored Hash:  ", state.pathKeyHash || "(not stored)");
    console.log("   Calculated Hash:", currentHash);
    console.log("   Match:", state.pathKeyHash === currentHash ? "✅ YES" : "❌ NO");
    console.log();
  }
  
  console.log("📊 Full State Object:");
  console.log(JSON.stringify(state, null, 2));
}

diagnose().catch(console.error);

