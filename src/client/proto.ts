import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import protobuf from "protobufjs";
import { DEFAULTS, defaultHeaders } from "../utils/env.js";
import { logger } from "../utils/logger.js";

let protoRootPromise: Promise<protobuf.Root> | undefined;

/**
 * Fix binary data in string fields by converting to base64url.
 * The Cursor API sends encrypted paths as binary data in string fields.
 * When protobuf decodes these, it tries to interpret them as UTF-8, which corrupts the data.
 * This function detects such fields and converts the raw bytes to base64url encoding.
 */
function fixBinaryStringFields(msg: protobuf.Message, type: protobuf.Type): void {
  // Fields that are known to contain binary data despite being defined as strings
  const binaryStringFields = new Set(['relative_workspace_path', 'relativeWorkspacePath']);

  // Recursively process all fields in the message
  for (const field of type.fieldsArray) {
    const value = (msg as any)[field.name];

    if (value === null || value === undefined) {
      continue;
    }

    // Handle repeated fields (arrays)
    if (field.repeated && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (field.resolvedType instanceof protobuf.Type) {
          // Nested message type
          fixBinaryStringFields(item, field.resolvedType);
        } else if (field.type === 'string' && binaryStringFields.has(field.name)) {
          // Binary string field in array
          value[i] = convertBinaryStringToBase64url(item);
        }
      }
    }
    // Handle map fields
    else if (field.map) {
      for (const key in value) {
        const item = value[key];
        if (field.resolvedType instanceof protobuf.Type) {
          // Nested message type in map
          fixBinaryStringFields(item, field.resolvedType);
        } else if (field.type === 'string' && binaryStringFields.has(field.name)) {
          // Binary string field in map
          value[key] = convertBinaryStringToBase64url(item);
        }
      }
    }
    // Handle singular fields
    else {
      if (field.resolvedType instanceof protobuf.Type) {
        // Nested message type
        fixBinaryStringFields(value, field.resolvedType);
      } else if (field.type === 'string' && binaryStringFields.has(field.name)) {
        // Binary string field
        (msg as any)[field.name] = convertBinaryStringToBase64url(value);
      }
    }
  }
}

/**
 * Convert a binary string (raw bytes) to base64url encoding.
 * Handles both Buffer objects and strings containing binary data.
 */
function convertBinaryStringToBase64url(value: any): string {
  if (!value || value === '.' || value === 'unknown') {
    return value;
  }

  try {
    // If it's already a Buffer or Uint8Array, convert directly
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      return Buffer.from(value).toString('base64url');
    }

    // If it's a string, check if it contains binary data
    if (typeof value === 'string') {
      // Check for non-printable characters or high-byte characters
      // These indicate binary data that was incorrectly interpreted as UTF-8
      const hasBinaryData = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\xFF\uFFFD]/.test(value);

      if (hasBinaryData) {
        // Convert the corrupted UTF-8 string back to binary
        // Use 'latin1' encoding which preserves byte values 0-255
        return Buffer.from(value, 'latin1').toString('base64url');
      }

      // If it looks like it's already base64url encoded, return as-is
      if (/^[A-Za-z0-9_-]+$/.test(value)) {
        return value;
      }
    }

    return value;
  } catch (error) {
    // If conversion fails, return the original value
    return value;
  }
}

export function loadProtoRoot(): Promise<protobuf.Root> {
  if (!protoRootPromise) {
    // Use import.meta.url to get the current module's directory
    // This works when the package is installed globally or locally
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // proto file is at: <package-root>/proto/repository_service.proto
    // compiled file is at: <package-root>/dist/client/proto.js
    // so we need to go up 2 levels: ../../proto/
    const protoPath = path.resolve(__dirname, "../../proto/repository_service.proto");
    
    if (!fs.existsSync(protoPath)) {
      throw new Error(`repository_service.proto not found at ${protoPath}. Make sure the proto directory is included in the package.`);
    }
    protoRootPromise = protobuf.load(protoPath);
  }
  return protoRootPromise;
}

export async function postProto<TReq extends object, TRes = any>(
  url: string,
  authToken: string,
  typeFullNameReq: string,
  typeFullNameRes: string,
  payload: TReq,
  timeoutMs = DEFAULTS.PROTO_TIMEOUT_MS,
): Promise<TRes> {
  const root = await loadProtoRoot();
  const TypeReq = root.lookupType(typeFullNameReq);
  if (!TypeReq) throw new Error(`Missing proto type: ${typeFullNameReq}`);
  const message = TypeReq.create(payload);
  const buffer = TypeReq.encode(message).finish();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: defaultHeaders(authToken),
      body: Buffer.from(buffer),
      signal: controller.signal,
    } as RequestInit);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
    }

    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);

    try {
      const TypeRes = root.lookupType(typeFullNameRes);
      if (!TypeRes) throw new Error("Missing response type");
      const msg = TypeRes.decode(buf);

      // Fix: Handle binary data in string fields (e.g., encrypted paths)
      // The server may send binary data in string fields, which gets corrupted when
      // interpreted as UTF-8. We need to convert these to base64url before toObject.
      fixBinaryStringFields(msg, TypeRes);

      const obj = TypeRes.toObject(msg, { longs: String, enums: String, defaults: true });
      return obj as TRes;
    } catch (decodeError) {
      // Attempt JSON fallback without verbose logging
      try {
        const json = JSON.parse(buf.toString("utf8"));
        logger.warn(`Successfully parsed response as JSON after protobuf decode failure`);
        return json as TRes;
      } catch (jsonError) {
        return {} as TRes;
      }
    }
  } catch (networkError) {
    // Catch network-level errors (timeout, connection refused, etc.)
    // Re-throw without verbose logging - semantic logs are handled by retry logic
    throw networkError;
  } finally {
    clearTimeout(t);
  }
}


