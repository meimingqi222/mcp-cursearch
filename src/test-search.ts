#!/usr/bin/env node
/**
 * Test script for codebase search functionality
 * Tests the encrypted path decryption fix
 */

import { createCodeSearcher } from "./services/codeSearcher.js";
import { createRepositoryIndexer } from "./services/repositoryIndexer.js";

async function main() {
  const authToken = process.env.CURSOR_AUTH_TOKEN || "";
  const baseUrl = process.env.CURSOR_BASE_URL || "https://api2.cursor.sh";
  
  if (!authToken) {
    console.error("Error: CURSOR_AUTH_TOKEN environment variable is required");
    console.error("Usage: CURSOR_AUTH_TOKEN=your_token npm run test:search");
    process.exit(1);
  }
  
  const ctx = { authToken, baseUrl };
  const indexer = createRepositoryIndexer(ctx);
  const searcher = createCodeSearcher(ctx, indexer);
  
  console.log("Testing codebase search...\n");
  
  try {
    const result = await searcher.search({
      query: "encryption path",
      maxResults: 10
    });
    
    console.log(`Total results: ${result.total}`);
    console.log(`\nSearch hits (${result.hits.length}):\n`);
    
    for (const hit of result.hits) {
      console.log(`Path: ${hit.path}`);
      console.log(`Score: ${hit.score.toFixed(4)}`);
      console.log(`Lines: ${hit.startLine}-${hit.endLine}`);
      
      // Check if path contains garbled characters
      const hasGarbledChars = /[\uFFFD\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(hit.path);
      if (hasGarbledChars) {
        console.log("⚠️  WARNING: Path contains garbled characters!");
      } else if (hit.path === "<decryption-failed>") {
        console.log("⚠️  WARNING: Path decryption failed!");
      } else {
        console.log("✓ Path looks good");
      }
      
      if (hit.signatures.length > 0) {
        console.log(`Signatures: ${hit.signatures.length} found`);
      }
      
      console.log("---");
    }
    
    // Summary
    const failedPaths = result.hits.filter(h => 
      h.path === "<decryption-failed>" || /[\uFFFD\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(h.path)
    );
    
    console.log(`\n=== Summary ===`);
    console.log(`Total hits: ${result.hits.length}`);
    console.log(`Failed/garbled paths: ${failedPaths.length}`);
    
    if (failedPaths.length === 0) {
      console.log("\n✅ All paths decrypted successfully!");
    } else {
      console.log("\n❌ Some paths failed to decrypt or contain garbled characters:");
      failedPaths.forEach(h => console.log(`  - ${h.path}`));
    }
    
  } catch (error) {
    console.error("Error during search:", error);
    process.exit(1);
  }
}

main().catch(console.error);

