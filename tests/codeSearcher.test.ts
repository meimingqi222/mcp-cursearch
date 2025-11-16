import os from "os";
import path from "path";
import fs from "fs-extra";
import { readFileWindow, readCodeFromFile, extractSignaturesFromFile } from "../src/services/codeSearcher.js";

describe("codeSearcher helper functions", () => {
  const workspaceRoot = path.join(os.tmpdir(), `code-searcher-test-${Date.now()}`);
  const longRel = "long.ts";
  const signatureRel = "signature.ts";

  beforeAll(async () => {
    await fs.ensureDir(workspaceRoot);

    const longContent = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    await fs.writeFile(path.join(workspaceRoot, longRel), longContent, "utf8");

    const signatureContent = `// demo file\n` +
      `export function foo() {\n` +
      `  return 1;\n` +
      `}\n` +
      `\n` +
      `class Example {\n` +
      `  public bar() {\n` +
      `    return 2;\n` +
      `  }\n` +
      `}\n`;
    await fs.writeFile(path.join(workspaceRoot, signatureRel), signatureContent, "utf8");
  });

  afterAll(async () => {
    await fs.remove(workspaceRoot);
  });

  it("readFileWindow returns the requested line range", async () => {
    const result = await readFileWindow(workspaceRoot, longRel, 3, 5);
    expect(result.lines).toEqual(["line 3", "line 4", "line 5"]);
  });

  it("readCodeFromFile collapses long sections into preview", async () => {
    const preview = await readCodeFromFile(workspaceRoot, longRel, 1, 10);
    expect(preview).toBe([
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "<Omitted>...</Omitted>",
      "line 9",
      "line 10",
    ].join("\n"));
  });

  it("extractSignaturesFromFile detects exported functions and classes", async () => {
    const signatures = await extractSignaturesFromFile(workspaceRoot, signatureRel, 1, 20);
    const texts = signatures.map((s) => s.text);
    expect(texts).toEqual(expect.arrayContaining([
      "export function foo() {",
      "class Example {",
      "public bar() {",
    ]));
  });
});
