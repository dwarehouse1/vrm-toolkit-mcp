import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { ToolError } from "../errors.js";

const CANDIDATES = [
  process.env.VRM_TOOLKIT_CHROME ?? "",
  // Windows
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter((p) => p !== "");

export function findBrowser(): string {
  for (const candidate of CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new ToolError(
    "BROWSER_NOT_FOUND",
    "no local Chrome/Edge found; set VRM_TOOLKIT_CHROME to a Chromium-based browser executable",
  );
}

function rendererHtmlPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // compiled: dist/render/browser.js -> dist/renderer.html
  // tsx dev/test: src/render/browser.ts -> <package>/dist/renderer.html
  const candidates = [
    join(dirname(here), "renderer.html"),
    join(dirname(dirname(here)), "dist", "renderer.html"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export interface RenderSession {
  page: Page;
  close: () => Promise<void>;
}

export async function openRenderer(width: number, height: number): Promise<RenderSession> {
  const executablePath = findBrowser();
  const html = rendererHtmlPath();
  if (!existsSync(html)) {
    throw new ToolError("RENDER_FAILED", `renderer bundle missing: ${html}; run npm run build`);
  }
  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--allow-file-access-from-files",
        "--disable-web-security",
        "--hide-scrollbars",
        "--mute-audio",
        "--force-color-profile=srgb",
      ],
    });
  } catch (error) {
    throw new ToolError("RENDER_FAILED", `failed to launch browser: ${(error as Error).message}`);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(pathToFileURL(html).href, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(
      (w, h) => (globalThis as any).__vrmToolkit.setup(w, h),
      width,
      height,
    );
    return {
      page,
      close: async () => {
        await browser.close().catch(() => undefined);
      },
    };
  } catch (error) {
    await browser.close().catch(() => undefined);
    if (error instanceof ToolError) throw error;
    throw new ToolError("RENDER_FAILED", `renderer page failed: ${(error as Error).message}`);
  }
}

export function writeDataUrl(dataUrl: string, outputPath: string): { bytes: number } {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new ToolError("RENDER_FAILED", "renderer returned an invalid data URL");
  }
  const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, buffer);
  } catch (error) {
    throw new ToolError("OUTPUT_WRITE_FAILED", `cannot write ${outputPath}: ${(error as Error).message}`);
  }
  return { bytes: buffer.length };
}
