import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vrmInspect } from "../src/inspect.js";
import { ToolError } from "../src/errors.js";
import { buildGlb, requireFixture, syntheticAvatars } from "./fixtures.js";

test("vrm_inspect reads the synthetic VRM 1.0 fixture", (t) => {
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  const result = vrmInspect(syntheticAvatars.vrm1Compact);
  assert.equal(result.vrm.specFamily, "vrm1");
  assert.equal((result.meta as any).name, "avatar-vrm1-compact");
  assert.deepEqual(result.humanoid.missingRequiredBones, []);
  assert.equal(result.file.container, "glb");
  assert.ok(result.humanoid.bones.every((b) => typeof b.node === "number"));
});

test("vrm_inspect reads the synthetic VRM 0.x fixture", (t) => {
  if (!requireFixture(syntheticAvatars.vrm0Wide, t)) return;
  const result = vrmInspect(syntheticAvatars.vrm0Wide);
  assert.equal(result.vrm.specFamily, "vrm0");
  assert.ok(result.humanoid.mappedBoneCount > 0);
});

test("vrm_inspect rejects a GLB without any VRM extension", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrm-toolkit-"));
  const path = join(dir, "plain.glb");
  writeFileSync(path, buildGlb({ asset: { version: "2.0" }, nodes: [] }));
  assert.throws(
    () => vrmInspect(path),
    (error: unknown) => error instanceof ToolError && error.code === "NOT_A_VRM",
  );
});

test("vrm_inspect rejects a missing file", () => {
  assert.throws(
    () => vrmInspect(join(tmpdir(), "does-not-exist-vrm-toolkit.vrm")),
    (error: unknown) => error instanceof ToolError && error.code === "FILE_NOT_FOUND",
  );
});
