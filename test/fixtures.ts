import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Local-only test assets (not shipped with the repository). Drop VRM/VRMA files
// into test/assets/** or point the env vars at your own directories; tests that
// need a missing asset skip with a notice.
const avatarDir =
  process.env.VRM_TOOLKIT_TEST_AVATAR_DIR ?? join(packageRoot, "test", "assets", "avatars");
const motionDir =
  process.env.VRM_TOOLKIT_TEST_VRMA_DIR ?? join(packageRoot, "test", "assets", "motions");

export const syntheticAvatars = {
  vrm1Compact: join(avatarDir, "avatar-vrm1-compact.vrm"),
  vrm1Tall: join(avatarDir, "avatar-vrm1-tall.vrm"),
  vrm0Wide: join(avatarDir, "avatar-vrm0-wide.vrm"),
};

export const syntheticVrma = {
  walkForward: join(motionDir, "motion-walk-forward.vrma"),
  idleBreathe: join(motionDir, "motion-idle-breathe.vrma"),
};

export function requireFixture(path: string, t: { skip: (reason: string) => void }): boolean {
  if (existsSync(path)) return true;
  t.skip(
    `local test asset missing (set VRM_TOOLKIT_TEST_AVATAR_DIR / VRM_TOOLKIT_TEST_VRMA_DIR): ${path}`,
  );
  return false;
}

/** Build a minimal GLB container around a glTF JSON payload (for negative/synthetic tests). */
export function buildGlb(json: unknown): Buffer {
  const jsonText = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonText, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}
