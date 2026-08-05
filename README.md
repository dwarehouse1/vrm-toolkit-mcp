# vrm-toolkit-mcp

**Status: v0.1.0 (pre-release). Source on GitHub; not yet published to npm. /
v0.1.0(プレリリース)。ソースはGitHub公開済み・npm未公開。**

An MCP (Model Context Protocol) server that lets an AI agent inspect, validate and preview
VRM / VRMA files on your machine. Five tools, stdio transport, no network access at runtime.

VRM / VRMAファイルの検品・情報抽出・プレビューをAIエージェントから使えるようにする
MCPサーバーです。ツールは5本、stdioトランスポート、実行時のネットワークアクセスなし。

## Tools / ツール

| Tool | What it does | 説明 |
| --- | --- | --- |
| `vrm_inspect` | Structured JSON: meta (name/author/license and permission fields), humanoid bone map, expressions, polygon/texture statistics | メタ(名前/作者/ライセンス許諾)・ボーン・表情・ポリゴン/テクスチャ規模を構造化出力 |
| `vrm_validate` | Finding list: missing required humanoid bones, broken node references, missing meta/license fields, unknown required extensions, configurable size/triangle/texture budgets | humanoidマッピング欠落・参照切れ・メタ/ライセンス欠落・未知の必須拡張・サイズ超過などの検品リスト |
| `vrma_inspect` | Tracks, targeted humanoid bones, expression tracks, duration, estimated frame rate | トラック・対象ボーン・表情トラック・尺・フレームレート推定 |
| `vrma_preview` | Applies a VRMA to a VRM and renders a PNG still or a short WebM clip (max 10 s) through local headless Chrome/Edge | VRMAをVRMに適用し、ローカルのヘッドレスChrome/EdgeでPNG静止画または短尺WebM動画を書き出し |
| `vrm_snapshot` | Renders a rest-pose PNG with optional expression weights and view presets (front / three-quarter / side / face close-up) | 表情ウェイトとビュープリセット(正面/斜め/側面/顔アップ)を指定できる静止画スクリーンショット |

Structural tools (`vrm_inspect`, `vrm_validate`, `vrma_inspect`) parse the GLB/glTF container
directly in Node and need no browser. Rendering tools (`vrma_preview`, `vrm_snapshot`) use an
already-installed Chromium-based browser via `puppeteer-core`; nothing is downloaded.

構造系3ツールはNode単体でGLB/glTFを直接パースし、ブラウザ不要。描画系2ツールは
インストール済みのChromium系ブラウザを`puppeteer-core`で使います(追加ダウンロードなし)。

Supported inputs: VRM 0.x (`extensions.VRM`), VRM 1.0 (`extensions.VRMC_vrm`),
VRMA (`extensions.VRMC_vrm_animation`), GLB container or plain glTF JSON.

## Requirements / 動作条件

- Node.js 20+
- For `vrma_preview` / `vrm_snapshot`: a local Chrome or Edge
  (auto-detected; override with the `VRM_TOOLKIT_CHROME` environment variable)
- Input size budget: 512 MiB by default (`VRM_TOOLKIT_MAX_BYTES` to override)

## Setup / セットアップ

```bash
npm install
npm run build
```

Register with Claude Code / Claude Codeへの登録:

```bash
claude mcp add vrm-toolkit -- node /absolute/path/to/vrm-toolkit/dist/main.js
```

Verified locally: `claude mcp list` reports `vrm-toolkit: ... - ✔ Connected`.

## Execution examples / 実行例

Real outputs from the local test run (2026-08-05, file paths shortened).
ローカルテスト実行(2026-08-05)の実出力です(パスは短縮表記)。

### vrm_inspect

Input: a VRoid Studio-exported VRM 1.0 avatar (15.7 MB).

```json
{
  "file": { "path": "...\\V1.vrm", "bytes": 15737992, "container": "glb" },
  "vrm": { "specFamily": "vrm1", "specVersion": "1.0" },
  "meta": {
    "name": "V1",
    "authors": ["D"],
    "licenseUrl": "https://vrm.dev/licenses/1.0/",
    "avatarPermission": "onlyAuthor",
    "commercialUsage": "corporation",
    "creditNotation": "required",
    "allowRedistribution": false,
    "modification": "prohibited"
  },
  "humanoid": {
    "mappedBoneCount": 54,
    "bones": [
      { "bone": "hips", "node": 1, "nodeName": "J_Bip_C_Hips" },
      { "bone": "spine", "node": 34, "nodeName": "J_Bip_C_Spine" }
    ],
    "missingRequiredBones": []
  },
  "expressions": { "presetCount": 14, "presets": ["happy", "angry", "sad", "..."] },
  "geometry": {
    "meshCount": 3,
    "totalVertices": 103489,
    "totalTriangles": 33484,
    "perMesh": [
      { "name": "Face (merged)", "vertices": 33640, "triangles": 7308 },
      { "name": "Body (merged)", "vertices": 57128, "triangles": 11548 },
      { "name": "Hair001 (merged)", "vertices": 12721, "triangles": 14628 }
    ]
  },
  "textures": { "imageCount": 26, "totalImageBytes": 8033934, "maxDimension": 2048 },
  "materials": { "materialCount": 17 }
}
```

(Output truncated for readability; the tool returns the full bone and image lists.)

### vrma_inspect

```json
{
  "file": { "path": "...\\motion-walk-forward.vrma", "bytes": 3268, "container": "glb" },
  "vrma": { "specVersion": "1.0" },
  "humanoid": { "mappedBoneCount": 16, "bones": ["hips", "spine", "chest", "head", "..."] },
  "animation": {
    "animationCount": 1,
    "channelCount": 2,
    "channelsByPath": { "translation": 1, "rotation": 1, "scale": 0, "weights": 0 },
    "totalKeyframes": 62,
    "durationSec": 1.25,
    "fpsEstimate": 24,
    "frameCountEstimate": 31,
    "humanoidBoneTracks": [
      { "bone": "hips", "paths": ["translation"] },
      { "bone": "chest", "paths": ["rotation"] }
    ]
  }
}
```

### vrm_validate

A finding list with stable codes and severities:

```json
{
  "ok": false,
  "errorCount": 1,
  "warningCount": 1,
  "findings": [
    { "severity": "error", "code": "HUMANOID_REQUIRED_BONE_MISSING",
      "message": "required humanoid bone is not mapped: leftHand (vrm1 required set)" },
    { "severity": "warning", "code": "META_LICENSE_OTHER_URL_MISSING",
      "message": "licenseName is Other but otherLicenseUrl is empty" }
  ]
}
```

### vrm_snapshot / vrma_preview

```json
{
  "output_path": "...\\v1-three-quarter-snapshot.png",
  "format": "png", "bytes": 194005, "width": 768, "height": 1024,
  "view": "three_quarter", "pose": "rest", "humanoid_bone_count": 54
}
```

```json
{
  "output_path": "...\\v1-walk-preview.webm",
  "format": "webm", "bytes": 313597, "width": 768, "height": 768,
  "clip_duration_sec": 1.25, "recorded_duration_sec": 3, "fps": 30
}
```

## Error codes / エラーコード

Every failure is a structured tool error with one of:
`FILE_NOT_FOUND`, `SIZE_BUDGET_EXCEEDED`, `NOT_A_GLB`, `NOT_A_VRM`, `NOT_A_VRMA`,
`BROWSER_NOT_FOUND`, `RENDER_FAILED`, `OUTPUT_WRITE_FAILED`.
The server process never crashes on a bad input file.

## Privacy / プライバシー

All processing is local. The server opens no network connection, sends no telemetry, and writes
only the output files you name. / 処理はすべてローカルです。ネットワーク接続・テレメトリ送信は
なく、書き込みは指定した出力ファイルのみです。

## Development / 開発

```bash
npm test   # build + 25 self-verification tests (structural, boundary, headless rendering)
```

Rendering tests skip with a notice when no local Chrome/Edge is found.

## License / ライセンス

MIT (see [LICENSE](./LICENSE)). / MITライセンス([LICENSE](./LICENSE)参照)。
