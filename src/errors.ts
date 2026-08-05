export type ToolErrorCode =
  | "FILE_NOT_FOUND"
  | "SIZE_BUDGET_EXCEEDED"
  | "NOT_A_GLB"
  | "NOT_A_VRM"
  | "NOT_A_VRMA"
  | "BROWSER_NOT_FOUND"
  | "RENDER_FAILED"
  | "OUTPUT_WRITE_FAILED";

export class ToolError extends Error {
  readonly code: ToolErrorCode;

  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ToolError";
  }
}

export const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

export function maxInputBytes(): number {
  const raw = process.env.VRM_TOOLKIT_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_BYTES;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_BYTES;
}
