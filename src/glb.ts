import { readFileSync, statSync } from "node:fs";
import { ToolError, maxInputBytes } from "./errors.js";

export interface GltfDocument {
  json: any;
  bin: Buffer | null;
  container: "glb" | "gltf-json";
  byteLength: number;
  jsonByteLength: number;
  binByteLength: number;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

export function readDocumentFromFile(path: string): GltfDocument {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new ToolError("FILE_NOT_FOUND", `file not found or unreadable: ${path}`);
  }
  const budget = maxInputBytes();
  if (size > budget) {
    throw new ToolError(
      "SIZE_BUDGET_EXCEEDED",
      `file is ${size} bytes; budget is ${budget} bytes (override with VRM_TOOLKIT_MAX_BYTES)`,
    );
  }
  return readDocument(readFileSync(path));
}

export function readDocument(bytes: Buffer): GltfDocument {
  // Plain-JSON .gltf/.vrma support: the first non-whitespace byte is "{".
  for (let i = 0; i < Math.min(bytes.length, 64); i += 1) {
    const c = bytes[i];
    if (c === 0x7b) {
      try {
        const json = JSON.parse(bytes.toString("utf8"));
        return {
          json,
          bin: null,
          container: "gltf-json",
          byteLength: bytes.length,
          jsonByteLength: bytes.length,
          binByteLength: 0,
        };
      } catch {
        throw new ToolError("NOT_A_GLB", "input starts like JSON but is not valid JSON");
      }
    }
    if (c !== 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d && !(i === 0 && c === 0xef)) {
      break;
    }
  }

  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new ToolError("NOT_A_GLB", "input is not a GLB container (bad magic) and not glTF JSON");
  }
  const version = bytes.readUInt32LE(4);
  if (version !== 2) {
    throw new ToolError("NOT_A_GLB", `unsupported GLB container version ${version}; expected 2`);
  }
  const declared = bytes.readUInt32LE(8);
  const total = Math.min(declared, bytes.length);

  let offset = 12;
  let json: any = null;
  let jsonByteLength = 0;
  let bin: Buffer | null = null;
  while (offset + 8 <= total) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > bytes.length) {
      throw new ToolError("NOT_A_GLB", "GLB chunk exceeds file length");
    }
    if (chunkType === CHUNK_JSON) {
      try {
        json = JSON.parse(bytes.subarray(start, end).toString("utf8"));
      } catch {
        throw new ToolError("NOT_A_GLB", "GLB JSON chunk is not valid JSON");
      }
      jsonByteLength = chunkLength;
    } else if (chunkType === CHUNK_BIN && bin === null) {
      bin = bytes.subarray(start, end);
    }
    offset = end + (chunkLength % 4 === 0 ? 0 : 4 - (chunkLength % 4));
  }
  if (json === null) {
    throw new ToolError("NOT_A_GLB", "GLB container has no JSON chunk");
  }
  return {
    json,
    bin,
    container: "glb",
    byteLength: bytes.length,
    jsonByteLength,
    binByteLength: bin ? bin.length : 0,
  };
}

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/** Read a float accessor's values from the BIN chunk (dense, non-interleaved or strided). */
export function readAccessorFloats(doc: GltfDocument, accessorIndex: number): number[] | null {
  const accessor = doc.json.accessors?.[accessorIndex];
  if (!accessor || accessor.componentType !== 5126 || doc.bin === null) return null;
  const view = doc.json.bufferViews?.[accessor.bufferView ?? -1];
  if (!view) return null;
  const components = TYPE_COMPONENTS[accessor.type ?? "SCALAR"] ?? 1;
  const elementBytes = components * 4;
  const stride = view.byteStride ?? elementBytes;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count ?? 0;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      const at = base + i * stride + c * 4;
      if (at + 4 > doc.bin.length) return out;
      out.push(doc.bin.readFloatLE(at));
    }
  }
  return out;
}

export function accessorCount(doc: GltfDocument, accessorIndex: number | undefined): number {
  if (accessorIndex === undefined || accessorIndex === null) return 0;
  return doc.json.accessors?.[accessorIndex]?.count ?? 0;
}

export interface ImageInfo {
  index: number;
  name: string | null;
  mimeType: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  uri: string | null;
}

export function imageInfos(doc: GltfDocument): ImageInfo[] {
  const images: any[] = doc.json.images ?? [];
  return images.map((image, index) => {
    if (typeof image.uri === "string") {
      return {
        index,
        name: image.name ?? null,
        mimeType: image.mimeType ?? null,
        bytes: 0,
        width: null,
        height: null,
        uri: image.uri.startsWith("data:") ? "data:(embedded)" : image.uri,
      };
    }
    const view = doc.json.bufferViews?.[image.bufferView ?? -1];
    if (!view || doc.bin === null) {
      return { index, name: image.name ?? null, mimeType: image.mimeType ?? null, bytes: 0, width: null, height: null, uri: null };
    }
    const start = view.byteOffset ?? 0;
    const data = doc.bin.subarray(start, start + (view.byteLength ?? 0));
    const dims = imageDimensions(data);
    return {
      index,
      name: image.name ?? null,
      mimeType: image.mimeType ?? null,
      bytes: data.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      uri: null,
    };
  });
}

export function imageDimensions(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
      }
      offset += 2 + data.readUInt16BE(offset + 2);
    }
  }
  return null;
}
