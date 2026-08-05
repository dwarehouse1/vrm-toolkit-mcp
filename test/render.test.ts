import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBrowser } from "../src/render/browser.js";
import { vrmSnapshot, vrmaPreview } from "../src/render/tools.js";
import { requireFixture, syntheticAvatars, syntheticVrma } from "./fixtures.js";

function browserAvailable(t: { skip: (reason: string) => void }): boolean {
  try {
    findBrowser();
    return true;
  } catch {
    t.skip("no local Chrome/Edge found; rendering tests skipped (set VRM_TOOLKIT_CHROME)");
    return false;
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("vrm_snapshot renders a PNG for the synthetic VRM", { timeout: 120000 }, async (t) => {
  if (!browserAvailable(t)) return;
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  const out = join(mkdtempSync(join(tmpdir(), "vrm-toolkit-")), "snapshot.png");
  const result = await vrmSnapshot({
    path: syntheticAvatars.vrm1Compact,
    output_path: out,
    view: "front",
    width: 320,
    height: 400,
  });
  assert.equal(result.format, "png");
  assert.ok(result.bytes > 0);
  const bytes = readFileSync(out);
  assert.deepEqual(bytes.subarray(0, 4), PNG_SIGNATURE);
});

test("vrma_preview writes a mid-clip PNG", { timeout: 120000 }, async (t) => {
  if (!browserAvailable(t)) return;
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  if (!requireFixture(syntheticVrma.walkForward, t)) return;
  const out = join(mkdtempSync(join(tmpdir(), "vrm-toolkit-")), "preview.png");
  const result = await vrmaPreview({
    vrm_path: syntheticAvatars.vrm1Compact,
    vrma_path: syntheticVrma.walkForward,
    output_path: out,
    mode: "image",
    width: 320,
    height: 320,
  });
  assert.equal(result.format, "png");
  assert.ok((result as any).clip_duration_sec > 0);
  assert.deepEqual(readFileSync(out).subarray(0, 4), PNG_SIGNATURE);
});

test("vrma_preview records a short WebM clip", { timeout: 180000 }, async (t) => {
  if (!browserAvailable(t)) return;
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  if (!requireFixture(syntheticVrma.walkForward, t)) return;
  const out = join(mkdtempSync(join(tmpdir(), "vrm-toolkit-")), "preview.webm");
  const result = await vrmaPreview({
    vrm_path: syntheticAvatars.vrm1Compact,
    vrma_path: syntheticVrma.walkForward,
    output_path: out,
    mode: "video",
    duration_sec: 1,
    fps: 15,
    width: 320,
    height: 320,
  });
  assert.equal(result.format, "webm");
  assert.ok(result.bytes > 0, "webm should not be empty");
});
