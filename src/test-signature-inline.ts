import path from "path";
import fs from "fs-extra";

// Get file extension for pattern matching
function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

// File extension-specific signature patterns
function getSignaturePatterns(fileExt: string): RegExp[] {
  switch (fileExt) {
    case '.cpp':
    case '.h':
      return [
        // Standard C++ patterns - only extract actual definitions, not macros
        /^\s*class\s+(?:\w+_API\s+)?\w+/,
        /^\s*struct\s+(?:\w+_API\s+)?\w+/,
        /^\s*namespace\s+\w+/,
        /^\s*template\s*<.*?>/,
        /^\s*enum\s+(?:class\s+)?\w+/,

        // Function/method signatures
        /^\s*(?:virtual\s+)?(?:static\s+)?(?:inline\s+)?(?:FORCEINLINE\s+)?(?:explicit\s+)?(?:const\s+)?(?:unsigned\s+)?(?:signed\s+)?(?:void|bool|int|float|double|char|long|short|auto|[\w:]+\*?)\s+(?:\*+\s*)?[\w:]+\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?(?:\{|;|$)/,
        /^\s*(?:virtual\s+)?(?:explicit\s+)?~?[a-z_][\w:]*\s*\([^)]*\)\s*(?:\{|;|:|$)/,  // constructor/destructor - must start with lowercase or underscore
      ];
    
    case '.lua':
      return [
        /^\s*function\s+[\w.:]+\s*\(/,  // global function
        /^\s*local\s+function\s+\w+\s*\(/,  // local function
        /^\s*function\s+\w+:\w+\s*\(/,  // method with colon
        /^\s*function\s+\w+\.\w+\s*\(/,  // method with dot
        /^\s*local\s+\w+\s*=\s*\{/,  // local table
        /^\s*\w+\s*=\s*\{/,  // global table
      ];
    
    default:
      return [];
  }
}

// Check if a line is a comment
function isCommentLine(line: string, fileExt: string): boolean {
  const trimmed = line.trim();
  if (fileExt === '.cpp' || fileExt === '.h') {
    return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
  } else if (fileExt === '.lua') {
    return trimmed.startsWith('--');
  }
  return false;
}

// Check if a line should be excluded
function shouldExcludeLine(line: string, fileExt: string): boolean {
  const trimmed = line.trim();

  if (!trimmed || isCommentLine(line, fileExt)) {
    return true;
  }

  // Exclude uninformative standalone macros
  const uninformativeMacroPatterns = [
    /^\s*UFUNCTION\s*\([^)]*\)\s*$/,
    /^\s*UPROPERTY\s*\([^)]*\)\s*$/,
    /^\s*GENERATED_BODY\s*\(\s*\)\s*$/,
    /^\s*GENERATED_UCLASS_BODY\s*\(\s*\)\s*$/,
    /^\s*GENERATED_USTRUCT_BODY\s*\(\s*\)\s*$/,
  ];

  if (uninformativeMacroPatterns.some(pattern => pattern.test(line))) {
    return true;
  }

  // Exclude control flow
  const controlFlowPatterns = [
    /^\s*if\s*\(/,
    /^\s*for\s*\(/,
    /^\s*while\s*\(/,
    /^\s*switch\s*\(/,
  ];

  if (controlFlowPatterns.some(pattern => pattern.test(line))) {
    return true;
  }

  // Exclude function calls (lines ending with semicolon after parentheses)
  // But NOT function declarations which have return types
  if (/\)\s*;[\s]*$/.test(trimmed)) {
    // Check if it looks like a function declaration (has return type keywords or modifiers)
    const isFunctionDeclaration = /^\s*(?:virtual\s+|static\s+|inline\s+|FORCEINLINE\s+|explicit\s+|const\s+|unsigned\s+|signed\s+|extern\s+)?(?:void|bool|int|float|double|char|long|short|auto|[\w:]+\*?)\s+(?:\*+\s*)?[\w:~]+\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?;/.test(trimmed);

    if (!isFunctionDeclaration) {
      return true;  // It's a function call, exclude it
    }
  }

  return false;
}

// Test function
function testSignatureExtraction(fileExt: string, sampleCode: string, description: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`📝 Testing: ${description}`);
  console.log(`   File Extension: ${fileExt}`);
  console.log(`${"=".repeat(80)}\n`);

  const lines = sampleCode.split("\n");
  const patterns = getSignaturePatterns(fileExt);
  const signatures: Array<{ line: number; text: string }> = [];

  console.log(`Patterns loaded: ${patterns.length}`);
  console.log(`\nProcessing ${lines.length} lines...\n`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (shouldExcludeLine(line, fileExt)) {
      continue;
    }

    if (patterns.some(pattern => pattern.test(line))) {
      signatures.push({ line: i + 1, text: line.trim() });
    }
  }

  console.log(`✨ Extracted ${signatures.length} signatures:\n`);
  signatures.forEach(sig => {
    console.log(`   Line ${sig.line}: ${sig.text}`);
  });

  if (signatures.length === 0) {
    console.log(`   (No signatures found)`);
  }
}

// Main test
console.log("🧪 Testing Signature Extraction with Inline Samples\n");

// Test 1: C++ Header File
const cppHeaderSample = `
// Comment line - should be excluded
UCLASS(BlueprintType)
class MYGAME_API AMyActor : public AActor
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable)
    void MyFunction();

    UPROPERTY(BlueprintReadWrite)
    int32 MyProperty;

    virtual void BeginPlay() override;

    if (condition) {
        DoSomething();
    }
};

namespace MyNamespace {
    class MyClass {
    public:
        void DoSomething();
    };
}
`;

testSignatureExtraction('.h', cppHeaderSample, 'C++ Header File with Unreal Engine Macros');

// Test 2: Lua Script
const luaSample = `
-- This is a comment
function GlobalFunction(param1, param2)
    return param1 + param2
end

local function LocalFunction()
    print("Hello")
end

MyClass = {}

function MyClass:MethodWithColon(self, value)
    self.value = value
end

function MyClass.MethodWithDot(value)
    return value * 2
end

local MyTable = {
    key1 = "value1",
    key2 = "value2"
}

-- Control flow should be excluded
if condition then
    DoSomething()
end

for i = 1, 10 do
    print(i)
end
`;

testSignatureExtraction('.lua', luaSample, 'Lua Script with Functions and Tables');

// Test 3: C++ with uninformative macros
const cppWithMacrosSample = `
UCLASS(BlueprintType, Category="MyCategory")
class MYGAME_API UMyComponent : public UActorComponent
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable)

    UPROPERTY(BlueprintReadWrite)

    UFUNCTION(BlueprintCallable, Category="Actions")
    void PerformAction();

    virtual void TickComponent(float DeltaTime) override;
};
`;

testSignatureExtraction('.h', cppWithMacrosSample, 'C++ with Standalone Uninformative Macros');

console.log(`\n${"=".repeat(80)}`);
console.log("✅ All tests completed!");
console.log(`${"=".repeat(80)}\n`);

