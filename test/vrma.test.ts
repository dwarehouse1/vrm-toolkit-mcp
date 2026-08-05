import { strict as assert } from "node:assert";
import { test } from "node:test";
import { vrmaInspect } from "../src/vrma.js";
import { ToolError } from "../src/errors.js";
import { requireFixture, syntheticAvatars, syntheticVrma } from "./fixtures.js";

test("vrma_inspect reads a generated VRMA", (t) => {
  if (!requireFixture(syntheticVrma.walkForward, t)) return;
  const result = vrmaInspect(syntheticVrma.walkForward);
  assert.ok(result.vrma.specVersion, "specVersion should be present");
  assert.ok(result.humanoid.mappedBoneCount > 0);
  assert.equal(result.animation.animationCount, 1);
  assert.ok(result.animation.channelCount > 0);
  assert.ok(result.animation.durationSec > 0);
  assert.ok((result.animation.fpsEstimate ?? 0) > 0, "fps estimate expected from sampler deltas");
  assert.ok(result.animation.humanoidBoneTracks.length > 0);
  assert.ok(result.animation.humanoidBoneTracks.some((trk) => trk.bone === "hips"));
});

test("vrma_inspect agrees across two generated motions", (t) => {
  if (!requireFixture(syntheticVrma.idleBreathe, t)) return;
  const result = vrmaInspect(syntheticVrma.idleBreathe);
  assert.ok(result.animation.durationSec > 0);
  assert.ok(result.animation.totalKeyframes > 0);
});

test("vrma_inspect rejects a VRM avatar file", (t) => {
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  assert.throws(
    () => vrmaInspect(syntheticAvatars.vrm1Compact),
    (error: unknown) => error instanceof ToolError && error.code === "NOT_A_VRMA",
  );
});
