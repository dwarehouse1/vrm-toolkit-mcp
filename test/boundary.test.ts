import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { packageRoot } from "./fixtures.js";

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (path.endsWith(".ts") || path.endsWith(".mjs")) {
      out.push(path);
    }
  }
  return out;
}

test("no import edge outside the package (core/engine/native/app)", () => {
  const forbidden = [/from\s+["'][^"']*\.\.\/\.\.\/(core|engine|native|app)\//];
  const files = [
    ...sourceFiles(join(packageRoot, "src")),
    ...sourceFiles(join(packageRoot, "scripts")),
  ];
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(text),
        `${relative(packageRoot, file)} imports across the package boundary`,
      );
    }
  }
});

test("no FBX capability is exposed", () => {
  const files = sourceFiles(join(packageRoot, "src"));
  for (const file of files) {
    const text = readFileSync(file, "utf8").toLowerCase();
    assert.ok(
      !text.includes("fbx"),
      `${relative(packageRoot, file)} mentions FBX; conversion/ingestion is exclusively M1B territory`,
    );
  }
});
