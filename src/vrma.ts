import { GltfDocument, readAccessorFloats, readDocumentFromFile } from "./glb.js";
import { ToolError } from "./errors.js";

interface SamplerTiming {
  startSec: number;
  endSec: number;
  keyCount: number;
  medianDeltaSec: number | null;
}

function samplerTiming(doc: GltfDocument, inputAccessor: number): SamplerTiming | null {
  const accessor = doc.json.accessors?.[inputAccessor];
  if (!accessor) return null;
  const min = Array.isArray(accessor.min) ? accessor.min[0] : null;
  const max = Array.isArray(accessor.max) ? accessor.max[0] : null;
  const times = readAccessorFloats(doc, inputAccessor);
  let medianDeltaSec: number | null = null;
  if (times && times.length > 1) {
    const deltas = times
      .slice(1)
      .map((t, i) => t - times[i])
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (deltas.length > 0) medianDeltaSec = deltas[Math.floor(deltas.length / 2)];
  }
  return {
    startSec: min ?? (times ? Math.min(...times) : 0),
    endSec: max ?? (times ? Math.max(...times) : 0),
    keyCount: accessor.count ?? 0,
    medianDeltaSec,
  };
}

export function vrmaInspect(path: string) {
  const doc = readDocumentFromFile(path);
  const ext = doc.json.extensions?.VRMC_vrm_animation;
  if (!ext) {
    throw new ToolError("NOT_A_VRMA", "no VRMC_vrm_animation extension found");
  }

  const humanBones: Record<string, any> = ext.humanoid?.humanBones ?? {};
  const nodeToBone = new Map<number, string>();
  for (const [bone, value] of Object.entries(humanBones)) {
    if (Number.isInteger(value?.node)) nodeToBone.set(value.node, bone);
  }

  const expressionNode = new Map<number, string>();
  for (const kind of ["preset", "custom"] as const) {
    for (const [name, value] of Object.entries<any>(ext.expressions?.[kind] ?? {})) {
      if (Number.isInteger(value?.node)) expressionNode.set(value.node, name);
    }
  }

  const animations: any[] = doc.json.animations ?? [];
  let channelCount = 0;
  const byPath: Record<string, number> = { translation: 0, rotation: 0, scale: 0, weights: 0 };
  const boneTracks = new Map<string, Set<string>>();
  const expressionTracks = new Set<string>();
  let endSec = 0;
  let startSec = Number.POSITIVE_INFINITY;
  const deltas: number[] = [];
  let totalKeys = 0;

  for (const animation of animations) {
    for (const channel of animation.channels ?? []) {
      channelCount += 1;
      const targetPath: string = channel.target?.path ?? "";
      if (targetPath in byPath) byPath[targetPath] += 1;
      const node = channel.target?.node;
      const bone = nodeToBone.get(node);
      if (bone) {
        const set = boneTracks.get(bone) ?? new Set<string>();
        set.add(targetPath);
        boneTracks.set(bone, set);
      }
      const expression = expressionNode.get(node);
      if (expression) expressionTracks.add(expression);
      const sampler = animation.samplers?.[channel.sampler];
      if (sampler !== undefined) {
        const timing = samplerTiming(doc, sampler.input);
        if (timing) {
          endSec = Math.max(endSec, timing.endSec);
          startSec = Math.min(startSec, timing.startSec);
          totalKeys += timing.keyCount;
          if (timing.medianDeltaSec) deltas.push(timing.medianDeltaSec);
        }
      }
    }
  }

  deltas.sort((a, b) => a - b);
  const medianDelta = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)] : null;
  const durationSec = animations.length > 0 ? Math.max(0, endSec - Math.min(startSec, endSec)) : 0;
  const fpsEstimate = medianDelta ? Math.round((1 / medianDelta) * 100) / 100 : null;

  return {
    file: { path, bytes: doc.byteLength, container: doc.container },
    vrma: { specVersion: ext.specVersion ?? null },
    humanoid: {
      mappedBoneCount: Object.keys(humanBones).length,
      bones: Object.keys(humanBones),
    },
    expressions: {
      preset: Object.keys(ext.expressions?.preset ?? {}),
      custom: Object.keys(ext.expressions?.custom ?? {}),
    },
    lookAt: Boolean(ext.lookAt),
    animation: {
      animationCount: animations.length,
      channelCount,
      channelsByPath: byPath,
      totalKeyframes: totalKeys,
      durationSec: Math.round(durationSec * 1000) / 1000,
      fpsEstimate,
      frameCountEstimate: fpsEstimate ? Math.round(durationSec * fpsEstimate) + 1 : null,
      humanoidBoneTracks: [...boneTracks.entries()].map(([bone, paths]) => ({
        bone,
        paths: [...paths].sort(),
      })),
      expressionTracks: [...expressionTracks].sort(),
    },
  };
}
