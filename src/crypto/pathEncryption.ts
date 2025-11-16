import crypto from "crypto";

const AES_ALGO = "aes-256-ctr";
const SEG_SPLIT_RE = /([./\\])/;

export class V1MasterKeyedEncryptionScheme {
  private masterKeyRaw: string;
  private macKey: Buffer;
  private encKey: Buffer;
  constructor(masterKeyBase64Url: string) {
    this.masterKeyRaw = masterKeyBase64Url;
    const t = Buffer.from(masterKeyBase64Url, "base64url");
    const macKey = crypto.createHash("sha256").update(t).update(Buffer.from([0])).digest();
    const encKey = crypto.createHash("sha256").update(t).update(Buffer.from([1])).digest();
    this.macKey = macKey;
    this.encKey = encKey;
  }
  exportKey() { return this.masterKeyRaw; }
  encrypt(segment: string): string {
    const mac = crypto.createHmac("sha256", this.macKey);
    mac.update(segment);
    const prefix = mac.digest().subarray(0, 6);
    const iv = Buffer.concat([prefix, Buffer.alloc(10)]);
    const cipher = crypto.createCipheriv(AES_ALGO, this.encKey, iv);
    const pad4 = (s: string) => {
      const t = (4 - (s.length % 4)) % 4;
      return s + "\0".repeat(t);
    };
    let enc = cipher.update(pad4(segment), "utf8", "base64url");
    enc += cipher.final("base64url");
    return Buffer.concat([prefix, Buffer.from(enc, "base64url")]).toString("base64url");
  }
  decrypt(encSegment: string): string {
    const buf = Buffer.from(encSegment, "base64url");
    const prefix = buf.subarray(0, 6);
    const iv = Buffer.concat([prefix, Buffer.alloc(10)]);
    const payload = buf.subarray(6).toString("base64url");
    const decipher = crypto.createDecipheriv(AES_ALGO, this.encKey, iv);
    let dec = decipher.update(payload, "base64url", "utf8");
    dec += decipher.final("utf8");
    return dec.replace(new RegExp("\\0+$"), "");
  }
}

export function toWindowsRelative(pathStr: string): string {
  if (!pathStr || pathStr === ".") return ".";
  const noLeading = pathStr.replace(/^\.\/?/, "");
  const withBack = noLeading.replace(/\//g, "\\");
  return ".\\" + withBack;
}

export function toPosixRelative(pathStr: string): string {
  if (!pathStr || pathStr === ".") return ".";
  let s = pathStr.replace(/^\.\\?/, "");
  s = s.replace(/\\/g, "/");
  return s === "" ? "." : s;
}

export function encryptPathSegments(plainPath: string, scheme: V1MasterKeyedEncryptionScheme): string {
  if (!plainPath || plainPath === ".") return ".";
  const parts = String(plainPath).split(SEG_SPLIT_RE).filter((x) => x !== "");
  const encParts = parts.map((seg) => {
    if (seg === "/" || seg === "\\" || seg === ".") return seg;
    return scheme.encrypt(seg);
  });
  return encParts.join("");
}

export function decryptPathSegments(encPath: string, scheme: V1MasterKeyedEncryptionScheme): string {
  if (!encPath || encPath === ".") return ".";
  const parts = String(encPath).split(SEG_SPLIT_RE).filter((x) => x !== "");
  const decParts = parts.map((seg) => {
    if (seg === "/" || seg === "\\" || seg === ".") return seg;
    return scheme.decrypt(seg);
  });
  return decParts.join("");
}

export function encryptPathWindows(scheme: V1MasterKeyedEncryptionScheme, relPosix: string): string {
  const winRel = toWindowsRelative(relPosix);
  return encryptPathSegments(winRel, scheme);
}

export function decryptPathToRelPosix(scheme: V1MasterKeyedEncryptionScheme, encPath: string): string {
  const dec = decryptPathSegments(encPath, scheme);
  return toPosixRelative(dec);
}

export function genPathKey(): string {
  return Buffer.from(crypto.randomBytes(32)).toString("base64url");
}

export function sha256Hex(str: string): string {
  return crypto.createHash("sha256").update(str).digest("hex");
}


