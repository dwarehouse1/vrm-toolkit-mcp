// Live MCP protocol check: drives dist/main.js over real stdio as an MCP client
// and exercises all five tools. Outputs land in out/live-check/.
// Inputs: set VRM_TOOLKIT_CHECK_VRM (and optionally _VRM0 / _VRMA) to local files.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "out", "live-check");
mkdirSync(outDir, { recursive: true });

const vrm1 = process.env.VRM_TOOLKIT_CHECK_VRM ?? "";
const vrm0 = process.env.VRM_TOOLKIT_CHECK_VRM0 ?? vrm1;
const vrma = process.env.VRM_TOOLKIT_CHECK_VRMA ?? "";
for (const [label, file] of [["VRM_TOOLKIT_CHECK_VRM", vrm1], ["VRM_TOOLKIT_CHECK_VRMA", vrma]]) {
  if (!file || !existsSync(file)) {
    console.error(`missing input: set ${label} to a local file (got: ${file || "(unset)"})`);
    process.exit(2);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist", "main.js")],
});
const client = new Client({ name: "vrm-toolkit-live-check", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const report = [];
async function call(name, args) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  const entry = {
    tool: name,
    isError: Boolean(result.isError),
    ms: Date.now() - started,
    result: JSON.parse(text),
  };
  report.push(entry);
  console.log(`\n=== ${name} (${entry.ms}ms, error=${entry.isError}) ===`);
  console.log(text.length > 1600 ? `${text.slice(0, 1600)}\n...(truncated)` : text);
  return entry;
}

await call("vrm_inspect", { path: vrm1 });
await call("vrm_validate", { path: vrm0 });
await call("vrma_inspect", { path: vrma });
await call("vrma_preview", {
  vrm_path: vrm1,
  vrma_path: vrma,
  output_path: join(outDir, "preview.webm"),
  mode: "video",
  duration_sec: 2,
  fps: 30,
  width: 640,
  height: 640,
});
await call("vrm_snapshot", {
  path: vrm1,
  output_path: join(outDir, "snapshot.png"),
  view: "three_quarter",
  width: 640,
  height: 800,
});

writeFileSync(join(outDir, "live-check-report.json"), JSON.stringify(report, null, 2));
console.log(`\nreport written: ${join(outDir, "live-check-report.json")}`);
const failed = report.filter((r) => r.isError);
console.log(`calls: ${report.length}, errors: ${failed.length}`);
await client.close();
process.exit(failed.length === 0 ? 0 : 1);
