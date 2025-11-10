import { V1MasterKeyedEncryptionScheme } from "./crypto/pathEncryption.js";

const pathKey = "r34tDAAx1WEM4U8aOD18L2ezuW5rIif-vJGoAVFRtyA";
const scheme = new V1MasterKeyedEncryptionScheme(pathKey);

// Test paths
const paths = [
  ".\\Ucy0ke_uLtxHdQ\\lRn8ZrnR4H7bKSmrgFQ\\3ncr083XUPif-wxgLUglM7NusZTw0A.JUekZXIQmT7U4w",
  ".\\eEOo65swkA4gew\\fkoBdAjb0osy8p0mWEA\\RMqBIXlj1Do0Y05yJ2zDTXtUiGLbVA.NK54Yq-kRhQNRw",
  ".\\F9gX1rsgBTIF0A\\8h-8IUkPgIU7fvon4CQ\\c8fNVr2yHA68QUhCBh5_QxV7AhFswQ.NMhg7S_IC51VLQ",
];

console.log("Testing individual segment decryption:\n");

for (const path of paths) {
  console.log(`\nPath: ${path}`);
  console.log("=".repeat(80));
  
  // Split by separators
  const segments = path.split(/([./\\])/);
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "" || seg === "." || seg === "/" || seg === "\\") {
      console.log(`Segment ${i}: "${seg}" (separator, not encrypted)`);
      continue;
    }
    
    try {
      const decrypted = scheme.decrypt(seg);
      console.log(`Segment ${i}: "${seg}" → "${decrypted}" ✓`);
    } catch (error) {
      console.log(`Segment ${i}: "${seg}" → ERROR: ${error instanceof Error ? error.message : 'Unknown error'} ✗`);
    }
  }
}

