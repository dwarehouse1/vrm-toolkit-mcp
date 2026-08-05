import { readDocumentFromFile } from "./glb.js";
import {
  extractVrm,
  geometryStats,
  textureStats,
  materialCount,
  VRM0_REQUIRED_BONES,
  VRM1_REQUIRED_BONES,
} from "./vrm-document.js";
import { ToolError } from "./errors.js";

export interface ValidationLimits {
  max_triangles: number;
  max_total_bytes: number;
  max_texture_size: number;
  max_materials: number;
}

export const DEFAULT_LIMITS: ValidationLimits = {
  max_triangles: 70000,
  max_total_bytes: 50 * 1024 * 1024,
  max_texture_size: 4096,
  max_materials: 16,
};

export interface Finding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

const KNOWN_EXTENSIONS = new Set([
  "VRM",
  "VRMC_vrm",
  "VRMC_springBone",
  "VRMC_node_constraint",
  "VRMC_materials_mtoon",
  "VRMC_materials_hdr_emissiveMultiplier",
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_materials_emissive_strength",
]);

export function vrmValidate(path: string, partialLimits?: Partial<ValidationLimits>) {
  const limits: ValidationLimits = { ...DEFAULT_LIMITS, ...(partialLimits ?? {}) };
  const findings: Finding[] = [];

  let doc;
  let vrm;
  try {
    doc = readDocumentFromFile(path);
    vrm = extractVrm(doc);
  } catch (error) {
    if (error instanceof ToolError && (error.code === "NOT_A_GLB" || error.code === "NOT_A_VRM")) {
      return {
        file: { path },
        ok: false,
        findings: [{ severity: "error", code: error.code, message: error.message }],
        limits,
      };
    }
    throw error;
  }

  const isVrm1 = vrm.specFamily === "vrm1";
  const required = isVrm1 ? VRM1_REQUIRED_BONES : VRM0_REQUIRED_BONES;

  if (isVrm1 && vrm.specVersion !== "1.0" && vrm.specVersion !== "1.0-beta") {
    findings.push({
      severity: "warning",
      code: "UNRECOGNIZED_SPEC_VERSION",
      message: `VRMC_vrm specVersion is ${JSON.stringify(vrm.specVersion)}; this tool recognizes 1.0 and 1.0-beta`,
    });
  }

  const mapped = new Map<string, number[]>();
  for (const entry of vrm.humanoid) {
    if (!entry.nodeExists) {
      findings.push({
        severity: "error",
        code: "HUMANOID_NODE_MISSING",
        message: `humanoid bone ${entry.bone} maps to node ${entry.node}, which does not exist`,
      });
      continue;
    }
    mapped.set(entry.bone, [...(mapped.get(entry.bone) ?? []), entry.node]);
  }
  for (const bone of required) {
    if (!mapped.has(bone)) {
      findings.push({
        severity: "error",
        code: "HUMANOID_REQUIRED_BONE_MISSING",
        message: `required humanoid bone is not mapped: ${bone} (${vrm.specFamily} required set)`,
      });
    }
  }
  for (const [bone, nodes] of mapped) {
    if (nodes.length > 1) {
      findings.push({
        severity: "warning",
        code: "HUMANOID_DUPLICATE_BONE",
        message: `humanoid bone ${bone} is mapped ${nodes.length} times (nodes ${nodes.join(", ")})`,
      });
    }
  }
  const nodeToBones = new Map<number, string[]>();
  for (const [bone, nodes] of mapped) {
    for (const node of nodes) {
      nodeToBones.set(node, [...(nodeToBones.get(node) ?? []), bone]);
    }
  }
  for (const [node, bones] of nodeToBones) {
    if (bones.length > 1) {
      findings.push({
        severity: "warning",
        code: "HUMANOID_SHARED_NODE",
        message: `node ${node} is assigned to multiple humanoid bones: ${bones.join(", ")}`,
      });
    }
  }

  const meta: any = vrm.meta;
  const displayName = isVrm1 ? meta.name : meta.title;
  const author = isVrm1 ? (meta.authors ?? [])[0] : meta.author;
  if (!displayName) {
    findings.push({ severity: "warning", code: "META_NAME_MISSING", message: "meta has no model name/title" });
  }
  if (!author) {
    findings.push({ severity: "warning", code: "META_AUTHOR_MISSING", message: "meta has no author" });
  }
  if (isVrm1) {
    if (!meta.licenseUrl) {
      findings.push({ severity: "warning", code: "META_LICENSE_MISSING", message: "VRM 1.0 meta.licenseUrl is missing" });
    }
  } else {
    if (!meta.licenseName) {
      findings.push({ severity: "warning", code: "META_LICENSE_MISSING", message: "VRM 0.x meta.licenseName is missing" });
    } else if (meta.licenseName === "Other" && !meta.otherLicenseUrl) {
      findings.push({
        severity: "warning",
        code: "META_LICENSE_OTHER_URL_MISSING",
        message: "licenseName is Other but otherLicenseUrl is empty",
      });
    }
  }
  if (!vrm.hasThumbnail) {
    findings.push({ severity: "info", code: "META_THUMBNAIL_MISSING", message: "no thumbnail image is embedded" });
  }

  const geometry = geometryStats(doc);
  const textures = textureStats(doc);
  if (geometry.totalVertices === 0) {
    findings.push({ severity: "info", code: "NO_RENDERABLE_MESH", message: "model has no renderable mesh (0 vertices)" });
  }
  if (geometry.totalTriangles > limits.max_triangles) {
    findings.push({
      severity: "warning",
      code: "TRIANGLE_BUDGET_EXCEEDED",
      message: `total triangles ${geometry.totalTriangles} exceed the configured limit ${limits.max_triangles}`,
    });
  }
  if (doc.byteLength > limits.max_total_bytes) {
    findings.push({
      severity: "warning",
      code: "FILE_SIZE_LIMIT_EXCEEDED",
      message: `file is ${doc.byteLength} bytes and exceeds the configured limit ${limits.max_total_bytes}`,
    });
  }
  if ((textures.maxDimension ?? 0) > limits.max_texture_size) {
    findings.push({
      severity: "warning",
      code: "TEXTURE_SIZE_LIMIT_EXCEEDED",
      message: `largest texture dimension ${textures.maxDimension} exceeds the configured limit ${limits.max_texture_size}`,
    });
  }
  const materials = materialCount(doc);
  if (materials > limits.max_materials) {
    findings.push({
      severity: "warning",
      code: "MATERIAL_BUDGET_EXCEEDED",
      message: `material count ${materials} exceeds the configured limit ${limits.max_materials}`,
    });
  }

  for (const ext of doc.json.extensionsRequired ?? []) {
    if (!KNOWN_EXTENSIONS.has(ext)) {
      findings.push({
        severity: "warning",
        code: "UNKNOWN_REQUIRED_EXTENSION",
        message: `extensionsRequired contains an extension this tool does not recognize: ${ext}`,
      });
    }
  }

  return {
    file: { path, bytes: doc.byteLength },
    vrm: { specFamily: vrm.specFamily, specVersion: vrm.specVersion },
    ok: findings.every((f) => f.severity !== "error"),
    errorCount: findings.filter((f) => f.severity === "error").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
    findings,
    limits,
  };
}
