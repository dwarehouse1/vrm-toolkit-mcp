import { GltfDocument, accessorCount, imageInfos, ImageInfo } from "./glb.js";
import { ToolError } from "./errors.js";

export type SpecFamily = "vrm0" | "vrm1";

export const VRM1_REQUIRED_BONES = [
  "hips",
  "spine",
  "head",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const;

export const VRM0_REQUIRED_BONES = [...VRM1_REQUIRED_BONES, "chest", "neck"] as const;

export interface HumanoidBoneEntry {
  bone: string;
  node: number;
  nodeName: string | null;
  nodeExists: boolean;
}

export interface VrmModel {
  doc: GltfDocument;
  specFamily: SpecFamily;
  specVersion: string | null;
  exporterVersion: string | null;
  meta: Record<string, unknown>;
  humanoid: HumanoidBoneEntry[];
  expressionPresets: string[];
  expressionCustoms: string[];
  hasThumbnail: boolean;
}

function nodeName(doc: GltfDocument, index: number): string | null {
  return doc.json.nodes?.[index]?.name ?? null;
}

function nodeExists(doc: GltfDocument, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < (doc.json.nodes?.length ?? 0);
}

export function extractVrm(doc: GltfDocument): VrmModel {
  const extensions = doc.json.extensions ?? {};
  const vrm1 = extensions.VRMC_vrm;
  const vrm0 = extensions.VRM;
  if (vrm1) {
    const humanBones = vrm1.humanoid?.humanBones ?? {};
    const humanoid: HumanoidBoneEntry[] = Object.entries(humanBones).map(([bone, value]: [string, any]) => ({
      bone,
      node: value?.node ?? -1,
      nodeName: nodeExists(doc, value?.node ?? -1) ? nodeName(doc, value.node) : null,
      nodeExists: nodeExists(doc, value?.node ?? -1),
    }));
    const expressions = vrm1.expressions ?? {};
    return {
      doc,
      specFamily: "vrm1",
      specVersion: vrm1.specVersion ?? null,
      exporterVersion: null,
      meta: vrm1.meta ?? {},
      humanoid,
      expressionPresets: Object.keys(expressions.preset ?? {}),
      expressionCustoms: Object.keys(expressions.custom ?? {}),
      hasThumbnail: Number.isInteger(vrm1.meta?.thumbnailImage),
    };
  }
  if (vrm0) {
    const bones: any[] = vrm0.humanoid?.humanBones ?? [];
    const humanoid: HumanoidBoneEntry[] = bones.map((entry) => ({
      bone: String(entry?.bone ?? ""),
      node: entry?.node ?? -1,
      nodeName: nodeExists(doc, entry?.node ?? -1) ? nodeName(doc, entry.node) : null,
      nodeExists: nodeExists(doc, entry?.node ?? -1),
    }));
    const groups: any[] = vrm0.blendShapeMaster?.blendShapeGroups ?? [];
    const presets = groups
      .map((g) => String(g?.presetName ?? ""))
      .filter((name) => name !== "" && name !== "unknown");
    const customs = groups
      .filter((g) => !g?.presetName || g.presetName === "unknown")
      .map((g) => String(g?.name ?? ""))
      .filter((name) => name !== "");
    return {
      doc,
      specFamily: "vrm0",
      specVersion: vrm0.specVersion ?? null,
      exporterVersion: vrm0.exporterVersion ?? null,
      meta: vrm0.meta ?? {},
      humanoid,
      expressionPresets: presets,
      expressionCustoms: customs,
      hasThumbnail: Number.isInteger(vrm0.meta?.texture),
    };
  }
  throw new ToolError("NOT_A_VRM", "no VRM extension found (neither VRMC_vrm nor VRM)");
}

export interface GeometryStats {
  meshCount: number;
  primitiveCount: number;
  totalVertices: number;
  totalTriangles: number;
  perMesh: { name: string | null; vertices: number; triangles: number }[];
}

export function geometryStats(doc: GltfDocument): GeometryStats {
  const meshes: any[] = doc.json.meshes ?? [];
  let primitiveCount = 0;
  let totalVertices = 0;
  let totalTriangles = 0;
  const perMesh = meshes.map((mesh) => {
    let vertices = 0;
    let triangles = 0;
    for (const prim of mesh.primitives ?? []) {
      primitiveCount += 1;
      const positions = accessorCount(doc, prim.attributes?.POSITION);
      vertices += positions;
      const mode = prim.mode ?? 4;
      if (mode === 4) {
        const indexCount = prim.indices !== undefined ? accessorCount(doc, prim.indices) : positions;
        triangles += Math.floor(indexCount / 3);
      }
    }
    totalVertices += vertices;
    totalTriangles += triangles;
    return { name: mesh.name ?? null, vertices, triangles };
  });
  return { meshCount: meshes.length, primitiveCount, totalVertices, totalTriangles, perMesh };
}

export interface TextureStats {
  imageCount: number;
  totalImageBytes: number;
  maxDimension: number | null;
  images: ImageInfo[];
}

export function textureStats(doc: GltfDocument): TextureStats {
  const images = imageInfos(doc);
  const dims = images.flatMap((i) => [i.width ?? 0, i.height ?? 0]);
  return {
    imageCount: images.length,
    totalImageBytes: images.reduce((sum, i) => sum + i.bytes, 0),
    maxDimension: images.length > 0 ? Math.max(...dims) : null,
    images,
  };
}

export function materialCount(doc: GltfDocument): number {
  return (doc.json.materials ?? []).length;
}

export function nodeStats(doc: GltfDocument): { nodeCount: number; skinCount: number; jointCount: number } {
  const skins: any[] = doc.json.skins ?? [];
  return {
    nodeCount: (doc.json.nodes ?? []).length,
    skinCount: skins.length,
    jointCount: skins.reduce((sum, s) => sum + (s.joints?.length ?? 0), 0),
  };
}
