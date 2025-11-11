import path from "path";
import fs from "fs-extra";

// Copy the functions from codeSearcher.ts for testing

// Get file extension for pattern matching
function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

// File extension-specific signature patterns
function getSignaturePatterns(fileExt: string): RegExp[] {
  switch (fileExt) {
    case '.py':
      return [
        /^\s*(?:async\s+)?def\s+\w+\s*\(/,  // function/method definitions
        /^\s*class\s+\w+/,  // class definitions
        /^\s*@\w+/,  // decorators
      ];
    
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return [
        /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/,  // function declarations
        /^\s*(?:export\s+)?(?:abstract\s+)?class\s+\w+/,  // class declarations
        /^\s*(?:export\s+)?interface\s+\w+/,  // interface declarations
        /^\s*(?:export\s+)?type\s+\w+\s*=/,  // type declarations
        /^\s*(?:export\s+)?enum\s+\w+/,  // enum declarations
        /^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,  // arrow functions
        /^\s*(?:public|private|protected|static|async)\s+\w+\s*\(/,  // method declarations
        /^\s*(?:get|set)\s+\w+\s*\(/,  // getter/setter
      ];
    
    case '.cpp':
    case '.cc':
    case '.cxx':
    case '.c':
    case '.h':
    case '.hpp':
    case '.hxx':
    case '.hh':
      return [
        // Unreal Engine macros - only the declaration macros, not GENERATED_BODY
        /^\s*UCLASS\s*\(/,  // Unreal class macro
        /^\s*USTRUCT\s*\(/,  // Unreal struct macro
        /^\s*UENUM\s*\(/,  // Unreal enum macro
        /^\s*UINTERFACE\s*\(/,  // Unreal interface macro
        /^\s*UPROPERTY\s*\(/,  // Unreal property macro
        /^\s*DECLARE_DYNAMIC_(?:MULTICAST_)?DELEGATE/,  // Unreal delegate macro

        // Standard C++ patterns
        /^\s*class\s+(?:\w+_API\s+)?\w+/,  // class (with optional API macro)
        /^\s*struct\s+(?:\w+_API\s+)?\w+/,  // struct (with optional API macro)
        /^\s*namespace\s+\w+/,  // namespace
        /^\s*template\s*<.*?>/,  // template
        /^\s*enum\s+(?:class\s+)?\w+/,  // enum

        // Function/method signatures - more restrictive pattern
        // Must have return type or be a constructor/destructor
        // Excludes control flow and function calls by requiring specific patterns
        /^\s*(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:FORCEINLINE\s+)?(?:explicit\s+)?(?:const\s+)?(?:unsigned\s+)?(?:signed\s+)?(?:void|bool|int|float|double|char|long|short|auto|[\w:]+\*?)\s+(?:\*+\s*)?[\w:]+\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?(?:\{|;|$)/,  // function/method with return type
        /^\s*(?:virtual\s+)?(?:explicit\s+)?~?[\w:]+\s*\([^)]*\)\s*(?:\{|;|:|$)/,  // constructor/destructor (no return type)
      ];
    
    case '.lua':
      return [
        /^\s*function\s+[\w.:]+\s*\(/,  // global function: function name(...)
        /^\s*local\s+function\s+\w+\s*\(/,  // local function: local function name(...)
        /^\s*function\s+\w+:\w+\s*\(/,  // method with colon: function Class:method(...)
        /^\s*function\s+\w+\.\w+\s*\(/,  // method with dot: function Class.method(...)
        /^\s*local\s+\w+\s*=\s*\{/,  // local table: local tableName = {}
        /^\s*\w+\s*=\s*\{/,  // global table: TableName = {}
      ];
    
    default:
      // Fallback to JavaScript/TypeScript patterns for unknown file types
      return [
        /^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/,
        /^\s*(?:export\s+)?class\s+\w+/,
        /^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,
      ];
  }
}

// Check if a line is a comment
function isCommentLine(line: string, fileExt: string): boolean {
  const trimmed = line.trim();

  switch (fileExt) {
    case '.py':
      return trimmed.startsWith('#');

    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');

    case '.cpp':
    case '.cc':
    case '.cxx':
    case '.c':
    case '.h':
    case '.hpp':
    case '.hxx':
    case '.hh':
      return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');

    case '.lua':
      return trimmed.startsWith('--');

    default:
      return false;
  }
}

// Check if a line should be excluded from signature extraction
function shouldExcludeLine(line: string, fileExt: string): boolean {
  const trimmed = line.trim();

  // Exclude empty lines and comments
  if (!trimmed || isCommentLine(line, fileExt)) {
    return true;
  }

  // Exclude uninformative standalone macros (C++/Unreal Engine)
  // These are macros that appear alone without actual code definitions
  const uninformativeMacroPatterns = [
    /^\s*UFUNCTION\s*\([^)]*\)\s*$/,  // UFUNCTION(...) alone on a line
    /^\s*UPROPERTY\s*\([^)]*\)\s*$/,  // UPROPERTY(...) alone on a line
    /^\s*GENERATED_BODY\s*\(\s*\)\s*$/,  // GENERATED_BODY() alone
    /^\s*GENERATED_UCLASS_BODY\s*\(\s*\)\s*$/,  // GENERATED_UCLASS_BODY() alone
    /^\s*GENERATED_USTRUCT_BODY\s*\(\s*\)\s*$/,  // GENERATED_USTRUCT_BODY() alone
  ];

  if (uninformativeMacroPatterns.some(pattern => pattern.test(line))) {
    return true;
  }

  // Exclude control flow statements (if, for, while, switch, etc.)
  const controlFlowPatterns = [
    /^\s*if\s*\(/,
    /^\s*else\s*if\s*\(/,
    /^\s*else\s*\{/,
    /^\s*for\s*\(/,
    /^\s*while\s*\(/,
    /^\s*switch\s*\(/,
    /^\s*catch\s*\(/,
    /^\s*do\s*\{/,
  ];

  if (controlFlowPatterns.some(pattern => pattern.test(line))) {
    return true;
  }

  // Exclude function calls (lines ending with semicolon after parentheses)
  // This catches patterns like: functionCall(); or object.method();
  if (/\)\s*;[\s]*$/.test(trimmed)) {
    return true;
  }

  // Exclude assignment statements with function calls
  // This catches patterns like: variable = value; or Bool("MediaEnd") = true;
  if (/=\s*[^=].*;\s*$/.test(trimmed) && !/^\s*(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/.test(trimmed)) {
    return true;
  }

  // Exclude return statements
  if (/^\s*return\s+/.test(trimmed)) {
    return true;
  }

  return false;
}

// Extract signatures from a file
async function extractSignaturesFromFile(filePath: string, startLine: number = 1, endLine: number = -1): Promise<Array<{ line: number; text: string }>> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const signatures: Array<{ line: number; text: string }> = [];
    const start = Math.max(0, startLine - 1);
    const end = endLine === -1 ? lines.length : Math.min(lines.length, endLine);

    // Get file extension and appropriate patterns
    const fileExt = getFileExtension(filePath);
    const signaturePatterns = getSignaturePatterns(fileExt);

    console.log(`\n📄 File: ${filePath}`);
    console.log(`   Extension: ${fileExt}`);
    console.log(`   Lines: ${start + 1} to ${end}`);
    console.log(`   Patterns: ${signaturePatterns.length} signature patterns loaded`);

    // Extract signatures from the specified line range
    const seenLines = new Set<number>();  // Avoid duplicates

    for (let i = start; i < end; i++) {
      const line = lines[i];

      // Use the new shouldExcludeLine function to filter out non-signatures
      if (shouldExcludeLine(line, fileExt)) {
        continue;
      }

      // Check if line matches any signature pattern
      if (signaturePatterns.some(pattern => pattern.test(line))) {
        const lineNum = i + 1;
        if (!seenLines.has(lineNum)) {
          signatures.push({ line: lineNum, text: line.trim() });
          seenLines.add(lineNum);
        }
      }
    }

    return signatures;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return [];
  }
}

// Main test function
async function main() {
  console.log("🧪 Testing Signature Extraction\n");
  console.log("=" .repeat(80));

  // Test directory
  const testDir = "D:\\nzxclient_trunk\\ZhuxianClient\\Source\\";

  // Check if test directory exists
  if (!await fs.pathExists(testDir)) {
    console.error(`❌ Test directory not found: ${testDir}`);
    console.log("\n💡 Please update the testDir variable to point to a valid directory.");
    process.exit(1);
  }

  console.log(`📁 Test directory: ${testDir}\n`);

  // Find test files
  const testFiles: string[] = [];

  try {
    // Recursively find files with specific extensions
    async function findFiles(dir: string, depth: number = 0) {
      if (depth > 3) return; // Limit recursion depth

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await findFiles(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.cpp', '.h', '.lua'].includes(ext)) {
            testFiles.push(fullPath);
            if (testFiles.length >= 10) return; // Limit to 10 files for testing
          }
        }
      }
    }

    await findFiles(testDir);
  } catch (error) {
    console.error(`❌ Error scanning directory: ${error}`);
    process.exit(1);
  }

  if (testFiles.length === 0) {
    console.log("❌ No test files found (.cpp, .h, .lua)");
    process.exit(1);
  }

  console.log(`✅ Found ${testFiles.length} test files\n`);
  console.log("=" .repeat(80));

  // Test each file
  for (const filePath of testFiles) {
    const signatures = await extractSignaturesFromFile(filePath, 1, 100); // Test first 100 lines

    console.log(`\n✨ Extracted ${signatures.length} signatures:`);

    if (signatures.length > 0) {
      signatures.forEach(sig => {
        console.log(`   Line ${sig.line}: ${sig.text}`);
      });
    } else {
      console.log(`   (No signatures found in first 100 lines)`);
    }

    console.log("\n" + "-".repeat(80));
  }

  console.log("\n✅ Test completed!");
}

main().catch(console.error);

