import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  VRMAnimation,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";

type ViewName = "front" | "three_quarter" | "side" | "face";

interface ToolkitState {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  vrm: VRM | null;
  mixer: THREE.AnimationMixer | null;
  clipDuration: number;
}

const state: ToolkitState = {
  renderer: null,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(30, 1, 0.05, 100),
  vrm: null,
  mixer: null,
  clipDuration: 0,
};

function canvas(): HTMLCanvasElement {
  return document.getElementById("stage") as HTMLCanvasElement;
}

function setup(width: number, height: number): void {
  const element = canvas();
  element.width = width;
  element.height = height;
  state.renderer = new THREE.WebGLRenderer({
    canvas: element,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  state.renderer.setSize(width, height, false);
  state.renderer.setClearColor(new THREE.Color(0xeef0f4), 1);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.scene.clear();
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.2, 1.8, 1.5);
  const rim = new THREE.DirectionalLight(0xdde6ff, 0.7);
  rim.position.set(-1.5, 1.0, -1.2);
  state.scene.add(ambient, key, rim);
  const grid = new THREE.GridHelper(4, 8, 0xb9c0cc, 0xd6dae2);
  state.scene.add(grid);
}

async function loadVrm(url: string): Promise<{ isVrm: boolean; boneCount: number }> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrm: VRM | undefined = gltf.userData.vrm;
  if (!vrm) throw new Error("loaded glTF has no VRM extension");
  VRMUtils.rotateVRM0(vrm); // normalize VRM 0.x facing to +Z (no-op for VRM 1.0)
  state.vrm = vrm;
  state.scene.add(vrm.scene);
  vrm.scene.updateMatrixWorld(true);
  const bones = vrm.humanoid ? Object.keys(vrm.humanoid.humanBones).length : 0;
  return { isVrm: true, boneCount: bones };
}

async function loadVrma(url: string): Promise<{ duration: number }> {
  if (!state.vrm) throw new Error("load a VRM before loading a VRMA");
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const animations: VRMAnimation[] = gltf.userData.vrmAnimations ?? [];
  if (animations.length === 0) throw new Error("loaded glTF has no VRMC_vrm_animation");
  const clip = createVRMAnimationClip(animations[0], state.vrm);
  state.mixer = new THREE.AnimationMixer(state.vrm.scene);
  const action = state.mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
  action.play();
  state.clipDuration = clip.duration;
  return { duration: clip.duration };
}

function setExpressions(weights: Record<string, number>): string[] {
  const applied: string[] = [];
  const manager = state.vrm?.expressionManager;
  if (!manager) return applied;
  for (const [name, weight] of Object.entries(weights)) {
    if (manager.getExpression(name)) {
      manager.setValue(name, Math.max(0, Math.min(1, weight)));
      applied.push(name);
    }
  }
  state.vrm?.update(1 / 60);
  return applied;
}

function focusTarget(view: ViewName): { center: THREE.Vector3; radius: number } {
  const fallback = { center: new THREE.Vector3(0, 1, 0), radius: 1 };
  if (!state.vrm) return fallback;
  state.vrm.scene.updateMatrixWorld(true);
  if (view === "face") {
    const head = state.vrm.humanoid?.getNormalizedBoneNode("head");
    if (head) {
      const center = head.getWorldPosition(new THREE.Vector3());
      return { center, radius: 0.28 };
    }
  }
  const box = new THREE.Box3().setFromObject(state.vrm.scene);
  if (box.isEmpty()) {
    const hips = state.vrm.humanoid?.getNormalizedBoneNode("hips");
    const head = state.vrm.humanoid?.getNormalizedBoneNode("head");
    if (hips && head) {
      const hp = hips.getWorldPosition(new THREE.Vector3());
      const hd = head.getWorldPosition(new THREE.Vector3());
      const center = hp.clone().lerp(hd, 0.5);
      return { center, radius: Math.max(hd.distanceTo(hp) * 1.2, 0.5) };
    }
    return fallback;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { center, radius: Math.max(size.x, size.y, size.z) * 0.6 };
}

function frame(view: ViewName): void {
  const { center, radius } = focusTarget(view);
  const distance = (radius / Math.tan((state.camera.fov * Math.PI) / 360)) * 1.15;
  // Models are normalized to face +Z, so the front camera sits on the +Z axis.
  const azimuthByView: Record<ViewName, number> = {
    front: 0,
    three_quarter: Math.PI / 5,
    side: Math.PI / 2,
    face: 0,
  };
  const azimuth = azimuthByView[view];
  state.camera.position.set(
    center.x + distance * Math.sin(azimuth),
    center.y + radius * 0.15,
    center.z + distance * Math.cos(azimuth),
  );
  state.camera.lookAt(center);
  state.camera.updateProjectionMatrix();
}

function renderAt(timeSec: number): void {
  if (state.mixer) {
    state.mixer.setTime(timeSec);
  }
  state.vrm?.update(1 / 60);
  if (!state.renderer) throw new Error("renderer is not initialized");
  state.renderer.render(state.scene, state.camera);
}

function snapshot(): string {
  if (!state.renderer) throw new Error("renderer is not initialized");
  state.renderer.render(state.scene, state.camera);
  return canvas().toDataURL("image/png");
}

async function record(durationSec: number, fps: number): Promise<string> {
  if (!state.renderer) throw new Error("renderer is not initialized");
  const stream = canvas().captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const start = performance.now();
  const clock = { last: start };
  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const elapsed = (now - start) / 1000;
      const delta = (now - clock.last) / 1000;
      clock.last = now;
      state.mixer?.update(delta);
      state.vrm?.update(delta);
      state.renderer!.render(state.scene, state.camera);
      if (elapsed >= durationSec) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  const blob = new Blob(chunks, { type: "video/webm" });
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const view = new Uint8Array(buffer);
  const step = 0x8000;
  for (let i = 0; i < view.length; i += step) {
    binary += String.fromCharCode(...view.subarray(i, i + step));
  }
  return `data:video/webm;base64,${btoa(binary)}`;
}

(window as any).__vrmToolkit = {
  setup,
  loadVrm,
  loadVrma,
  setExpressions,
  frame,
  renderAt,
  snapshot,
  record,
};
