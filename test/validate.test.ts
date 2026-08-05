import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vrmValidate } from "../src/validate.js";
import { buildGlb, requireFixture, syntheticAvatars } from "./fixtures.js";

function tempGlb(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "vrm-toolkit-"));
  const path = join(dir, "case.vrm");
  writeFileSync(path, buildGlb(json));
  return path;
}

test("vrm_validate passes the synthetic VRM 1.0 fixture without errors", (t) => {
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  const result = vrmValidate(syntheticAvatars.vrm1Compact);
  assert.equal(result.ok, true);
  assert.equal(result.errorCount, 0);
  const codes = result.findings.map((f) => f.code);
  assert.ok(codes.includes("NO_RENDERABLE_MESH"), "meshless synthetic fixture should be noted");
});

test("vrm_validate flags the VRM 0.x Other-license fixture", (t) => {
  if (!requireFixture(syntheticAvatars.vrm0Wide, t)) return;
  const result = vrmValidate(syntheticAvatars.vrm0Wide);
  const codes = result.findings.map((f) => f.code);
  assert.ok(codes.includes("META_LICENSE_OTHER_URL_MISSING"));
});

test("vrm_validate reports a missing required humanoid bone as an error", () => {
  const path = tempGlb({
    asset: { version: "2.0" },
    nodes: [{ name: "hips" }],
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: { name: "broken", authors: ["t"], licenseUrl: "https://vrm.dev/licenses/1.0/" },
        humanoid: { humanBones: { hips: { node: 0 } } },
      },
    },
  });
  const result = vrmValidate(path);
  assert.equal(result.ok, false);
  const missing = result.findings.filter((f) => f.code === "HUMANOID_REQUIRED_BONE_MISSING");
  assert.ok(missing.length >= 10, `expected many missing required bones, got ${missing.length}`);
});

test("vrm_validate reports a humanoid bone pointing at a nonexistent node", () => {
  const path = tempGlb({
    asset: { version: "2.0" },
    nodes: [{ name: "hips" }],
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: { name: "broken", authors: ["t"], licenseUrl: "https://vrm.dev/licenses/1.0/" },
        humanoid: { humanBones: { hips: { node: 42 } } },
      },
    },
  });
  const result = vrmValidate(path);
  assert.ok(result.findings.some((f) => f.code === "HUMANOID_NODE_MISSING" && f.severity === "error"));
});

test("vrm_validate returns a structured error finding for a non-VRM file", () => {
  const path = tempGlb({ asset: { version: "2.0" } });
  const result = vrmValidate(path);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === "NOT_A_VRM"));
});

test("vrm_validate applies caller-supplied limits", (t) => {
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  const result = vrmValidate(syntheticAvatars.vrm1Compact, { max_total_bytes: 100 });
  assert.ok(result.findings.some((f) => f.code === "FILE_SIZE_LIMIT_EXCEEDED"));
});
