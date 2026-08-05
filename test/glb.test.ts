import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { readDocument } from "../src/glb.js";
import { ToolError } from "../src/errors.js";
import { buildGlb, requireFixture, syntheticAvatars } from "./fixtures.js";

test("readDocument rejects an empty buffer", () => {
  assert.throws(
    () => readDocument(Buffer.alloc(0)),
    (error: unknown) => error instanceof ToolError && error.code === "NOT_A_GLB",
  );
});

test("readDocument rejects a wrong magic number", () => {
  const bytes = Buffer.alloc(32);
  bytes.write("NOPE", 0, "ascii");
  assert.throws(
    () => readDocument(bytes),
    (error: unknown) => error instanceof ToolError && error.code === "NOT_A_GLB",
  );
});

test("readDocument rejects invalid JSON that looks like JSON", () => {
  assert.throws(
    () => readDocument(Buffer.from("{ not json", "utf8")),
    (error: unknown) => error instanceof ToolError && error.code === "NOT_A_GLB",
  );
});

test("readDocument accepts plain glTF JSON", () => {
  const doc = readDocument(Buffer.from(JSON.stringify({ asset: { version: "2.0" } }), "utf8"));
  assert.equal(doc.container, "gltf-json");
  assert.equal(doc.json.asset.version, "2.0");
});

test("readDocument parses a synthetic GLB container", () => {
  const doc = readDocument(buildGlb({ asset: { version: "2.0" }, nodes: [{ name: "a" }] }));
  assert.equal(doc.container, "glb");
  assert.equal(doc.json.nodes.length, 1);
});

test("readDocument parses the generated synthetic VRM fixture", (t) => {
  if (!requireFixture(syntheticAvatars.vrm1Compact, t)) return;
  const doc = readDocument(readFileSync(syntheticAvatars.vrm1Compact));
  assert.equal(doc.container, "glb");
  assert.ok(doc.json.extensions.VRMC_vrm);
});
