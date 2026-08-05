#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { vrmInspect } from "./inspect.js";
import { vrmValidate } from "./validate.js";
import { vrmaInspect } from "./vrma.js";
import { vrmSnapshot, vrmaPreview } from "./render/tools.js";
import { ToolError } from "./errors.js";

const server = new McpServer({ name: "vrm-toolkit", version: "0.1.0" });

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(payload: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function fail(error: unknown): ToolResult {
  if (error instanceof ToolError) {
    return {
      isError: true,
      content: [
        { type: "text", text: JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2) },
      ],
    };
  }
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          { error: { code: "RENDER_FAILED", message: (error as Error)?.message ?? String(error) } },
          null,
          2,
        ),
      },
    ],
  };
}

async function guarded(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}

const limitsShape = z
  .object({
    max_triangles: z.number().int().positive().optional(),
    max_total_bytes: z.number().int().positive().optional(),
    max_texture_size: z.number().int().positive().optional(),
    max_materials: z.number().int().positive().optional(),
  })
  .optional();

server.registerTool(
  "vrm_inspect",
  {
    description:
      "Inspect a local VRM file (0.x or 1.0): meta including license/permission fields, humanoid bone map, expressions/blendshapes, polygon and texture statistics. Structured JSON output; no rendering.",
    inputSchema: { path: z.string().describe("Local path to a .vrm file") },
  },
  async ({ path }) => guarded(() => vrmInspect(path)),
);

server.registerTool(
  "vrm_validate",
  {
    description:
      "Validate a local VRM file and return a finding list: missing required humanoid bones, broken node references, missing meta/license fields, unrecognized required extensions, and configurable size/triangle/texture/material budget checks.",
    inputSchema: {
      path: z.string().describe("Local path to a .vrm file"),
      limits: limitsShape.describe("Optional budget overrides"),
    },
  },
  async ({ path, limits }) => guarded(() => vrmValidate(path, limits)),
);

server.registerTool(
  "vrma_inspect",
  {
    description:
      "Inspect a local VRMA (VRM animation) file: spec version, targeted humanoid bones, expression tracks, channel counts, duration, and an estimated frame rate. Structured JSON output; no rendering.",
    inputSchema: { path: z.string().describe("Local path to a .vrma file") },
  },
  async ({ path }) => guarded(() => vrmaInspect(path)),
);

server.registerTool(
  "vrma_preview",
  {
    description:
      "Render a VRMA animation applied to a VRM through a local headless Chrome/Edge. mode=image writes a PNG at time_sec; mode=video records a short WebM clip (max 10 seconds).",
    inputSchema: {
      vrm_path: z.string().describe("Local path to the .vrm avatar"),
      vrma_path: z.string().describe("Local path to the .vrma animation"),
      output_path: z.string().describe("Where to write the PNG/WebM output"),
      mode: z.enum(["image", "video"]).optional().describe("Default image"),
      time_sec: z.number().min(0).optional().describe("Image mode: clip time to render (default mid-clip)"),
      duration_sec: z.number().min(0.5).max(10).optional().describe("Video mode: recording length"),
      fps: z.number().int().min(5).max(60).optional().describe("Video mode: capture rate (default 30)"),
      view: z.enum(["front", "three_quarter", "side", "face"]).optional(),
      width: z.number().int().min(64).max(4096).optional(),
      height: z.number().int().min(64).max(4096).optional(),
    },
  },
  async (request) => guarded(() => vrmaPreview(request)),
);

server.registerTool(
  "vrm_snapshot",
  {
    description:
      "Render a still PNG of a VRM in its rest pose through a local headless Chrome/Edge, with optional expression weights (e.g. {\"happy\": 1}) and view presets including a face close-up.",
    inputSchema: {
      path: z.string().describe("Local path to the .vrm avatar"),
      output_path: z.string().describe("Where to write the PNG output"),
      expression: z.record(z.string(), z.number().min(0).max(1)).optional(),
      pose: z.enum(["rest"]).optional().describe("v0.1 supports the rest pose only"),
      view: z.enum(["front", "three_quarter", "side", "face"]).optional(),
      width: z.number().int().min(64).max(4096).optional(),
      height: z.number().int().min(64).max(4096).optional(),
    },
  },
  async (request) => guarded(() => vrmSnapshot(request)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
