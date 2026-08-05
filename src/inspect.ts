import { readDocumentFromFile } from "./glb.js";
import {
  extractVrm,
  geometryStats,
  materialCount,
  nodeStats,
  textureStats,
  VRM0_REQUIRED_BONES,
  VRM1_REQUIRED_BONES,
} from "./vrm-document.js";

export function vrmInspect(path: string) {
  const doc = readDocumentFromFile(path);
  const vrm = extractVrm(doc);
  const required = vrm.specFamily === "vrm1" ? VRM1_REQUIRED_BONES : VRM0_REQUIRED_BONES;
  const mapped = new Set(vrm.humanoid.filter((b) => b.nodeExists).map((b) => b.bone));
  const geometry = geometryStats(doc);
  const textures = textureStats(doc);
  return {
    file: {
      path,
      bytes: doc.byteLength,
      container: doc.container,
      jsonBytes: doc.jsonByteLength,
      binBytes: doc.binByteLength,
    },
    vrm: {
      specFamily: vrm.specFamily,
      specVersion: vrm.specVersion,
      exporterVersion: vrm.exporterVersion,
    },
    meta: vrm.meta,
    humanoid: {
      mappedBoneCount: vrm.humanoid.length,
      bones: vrm.humanoid.map((b) => ({ bone: b.bone, node: b.node, nodeName: b.nodeName })),
      missingRequiredBones: required.filter((bone) => !mapped.has(bone)),
    },
    expressions: {
      presetCount: vrm.expressionPresets.length,
      presets: vrm.expressionPresets,
      customCount: vrm.expressionCustoms.length,
      customs: vrm.expressionCustoms,
    },
    geometry,
    textures: {
      imageCount: textures.imageCount,
      totalImageBytes: textures.totalImageBytes,
      maxDimension: textures.maxDimension,
      images: textures.images,
    },
    materials: { materialCount: materialCount(doc) },
    nodes: nodeStats(doc),
    hasThumbnail: vrm.hasThumbnail,
    extensionsUsed: Object.keys(doc.json.extensions ?? {}),
  };
}
