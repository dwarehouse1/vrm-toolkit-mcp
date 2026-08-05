import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openRenderer, writeDataUrl } from "./browser.js";
import { ToolError, maxInputBytes } from "../errors.js";

export type ViewName = "front" | "three_quarter" | "side" | "face";

function checkInput(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    throw new ToolError("FILE_NOT_FOUND", `file not found: ${absolute}`);
  }
  const size = statSync(absolute).size;
  const budget = maxInputBytes();
  if (size > budget) {
    throw new ToolError("SIZE_BUDGET_EXCEEDED", `file is ${size} bytes; budget is ${budget} bytes`);
  }
  return absolute;
}

export interface SnapshotRequest {
  path: string;
  output_path: string;
  expression?: Record<string, number>;
  pose?: "rest";
  view?: ViewName;
  width?: number;
  height?: number;
}

export async function vrmSnapshot(request: SnapshotRequest) {
  const input = checkInput(request.path);
  const width = request.width ?? 768;
  const height = request.height ?? 1024;
  const view = request.view ?? "front";
  const output = resolve(request.output_path);
  const session = await openRenderer(width, height);
  try {
    const loaded = await session.page.evaluate(
      (url) => (globalThis as any).__vrmToolkit.loadVrm(url),
      pathToFileURL(input).href,
    );
    let appliedExpressions: string[] = [];
    if (request.expression && Object.keys(request.expression).length > 0) {
      appliedExpressions = await session.page.evaluate(
        (weights) => (globalThis as any).__vrmToolkit.setExpressions(weights),
        request.expression,
      );
    }
    await session.page.evaluate((v) => (globalThis as any).__vrmToolkit.frame(v), view);
    const dataUrl: string = await session.page.evaluate(() =>
      (globalThis as any).__vrmToolkit.snapshot(),
    );
    const written = writeDataUrl(dataUrl, output);
    return {
      output_path: output,
      format: "png",
      bytes: written.bytes,
      width,
      height,
      view,
      pose: request.pose ?? "rest",
      applied_expressions: appliedExpressions,
      humanoid_bone_count: (loaded as any).boneCount,
    };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("RENDER_FAILED", `snapshot failed: ${(error as Error).message}`);
  } finally {
    await session.close();
  }
}

export interface PreviewRequest {
  vrm_path: string;
  vrma_path: string;
  output_path: string;
  mode?: "image" | "video";
  time_sec?: number;
  duration_sec?: number;
  fps?: number;
  view?: ViewName;
  width?: number;
  height?: number;
}

export async function vrmaPreview(request: PreviewRequest) {
  const vrmInput = checkInput(request.vrm_path);
  const vrmaInput = checkInput(request.vrma_path);
  const width = request.width ?? 768;
  const height = request.height ?? 768;
  const view = request.view ?? "three_quarter";
  const mode = request.mode ?? "image";
  const output = resolve(request.output_path);
  const session = await openRenderer(width, height);
  try {
    await session.page.evaluate(
      (url) => (globalThis as any).__vrmToolkit.loadVrm(url),
      pathToFileURL(vrmInput).href,
    );
    const clip = await session.page.evaluate(
      (url) => (globalThis as any).__vrmToolkit.loadVrma(url),
      pathToFileURL(vrmaInput).href,
    );
    const duration = (clip as any).duration as number;
    await session.page.evaluate((v) => (globalThis as any).__vrmToolkit.frame(v), view);

    if (mode === "image") {
      const at = Math.max(0, Math.min(request.time_sec ?? duration / 2, duration));
      await session.page.evaluate((t) => (globalThis as any).__vrmToolkit.renderAt(t), at);
      const dataUrl: string = await session.page.evaluate(() =>
        (globalThis as any).__vrmToolkit.snapshot(),
      );
      const written = writeDataUrl(dataUrl, output);
      return {
        output_path: output,
        format: "png",
        bytes: written.bytes,
        width,
        height,
        view,
        clip_duration_sec: duration,
        rendered_time_sec: at,
      };
    }

    const requested = request.duration_sec ?? Math.min(duration, 5);
    const capped = Math.max(0.5, Math.min(requested, 10));
    const fps = Math.max(5, Math.min(request.fps ?? 30, 60));
    session.page.setDefaultTimeout(Math.ceil(capped * 1000) + 60000);
    const dataUrl: string = await session.page.evaluate(
      (seconds, rate) => (globalThis as any).__vrmToolkit.record(seconds, rate),
      capped,
      fps,
    );
    const written = writeDataUrl(dataUrl, output);
    return {
      output_path: output,
      format: "webm",
      bytes: written.bytes,
      width,
      height,
      view,
      clip_duration_sec: duration,
      recorded_duration_sec: capped,
      fps,
    };
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw new ToolError("RENDER_FAILED", `preview failed: ${(error as Error).message}`);
  } finally {
    await session.close();
  }
}
