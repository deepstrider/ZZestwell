import * as THREE from 'three';
import { PRINTS, SHEET_H, SHEET_URL, SHEET_W } from '../data/prints';

export const SMALL_MQ =
  '(max-width: 819px), (orientation: portrait) and (max-width: 1100px), (orientation: landscape) and (max-height: 500px)';

const R = 18;
const RIN = 12.2;
const H = 6.2;
const PW = 1.36;
const PH = (1.36 * 763) / 567;
const PY = 1.95;
const OUTER_COUNT = 36;
const INNER_COUNT = 24;
const STEP = (Math.PI * 2) / OUTER_COUNT;

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FocusedSlot {
  printIdx: number;
  angle: number;
  wall: 'outer' | 'inner';
  mesh: THREE.Mesh;
}

interface Pose {
  th: number;
  r: number;
  yaw: number;
  y: number;
  pitch: number;
}

interface GlideState {
  active: boolean;
  startTime: number;
  duration: number;
  from: Pose;
  to: Pose;
  targetFocus: FocusedSlot | null;
}

export interface GalleryCallbacks {
  onEntranceStart: () => void;
  onFocusChange: (slot: { printIdx: number; wall: 'outer' | 'inner'; angle: number } | null) => void;
  onOpenPrint: (printIdx: number, rect: ScreenRect) => void;
  onHoverState: (info: { overAny: boolean; overFocused: boolean; x: number; y: number }) => void;
  onSmallScreenPill: (pill: { visible: boolean; x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
}

function detectSoftwareGl(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isSmallScreen(): boolean {
  return window.matchMedia(SMALL_MQ).matches;
}

function isPortraitSmall(): boolean {
  return isSmallScreen() && window.innerHeight > window.innerWidth;
}

function getWalkOffsetD(): number {
  return isPortraitSmall() ? 0.14 + 0.9 * STEP : 0.14;
}

function getWalkPoseParams(): Omit<Pose, 'th'> {
  if (isPortraitSmall()) {
    return { r: 15.4, yaw: -0.42, y: 1.9, pitch: -0.1 };
  }
  return { r: 15.6, yaw: -0.3, y: 1.92, pitch: -0.12 };
}

function getFocusPoseParams(wall: 'outer' | 'inner'): Omit<Pose, 'th'> {
  const portrait = isPortraitSmall();
  const dist = portrait ? 5.2 : 4.26;
  const yOff = portrait ? 1.05 : 0.52;
  if (wall === 'outer') {
    return {
      r: R - dist,
      yaw: Math.PI / 2,
      y: PY - yOff,
      pitch: 0,
    };
  }
  return {
    r: RIN + dist,
    yaw: -Math.PI / 2,
    y: PY - yOff,
    pitch: 0,
  };
}

function createVerticalGradientTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(512, 512, (512 * RIN) / R, 512, 512, 512);
  grad.addColorStop(0, '#EDD6B0');
  grad.addColorStop(0.55, '#F3E1C3');
  grad.addColorStop(1, '#EFDAB8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createRadialAlphaTexture(
  rgb: string,
  innerAlpha: number,
  solidUntil: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, `rgba(${rgb}, ${innerAlpha})`);
  grad.addColorStop(solidUntil, `rgba(${rgb}, ${innerAlpha})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawLabelCanvas(canvas: HTMLCanvasElement, printIdx: number): void {
  const p = PRINTS[printIdx];
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 640, 260);
  ctx.fillStyle = '#3A3550';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '500 58px "Newsreader", Georgia, serif';
  ctx.fillText(p.artist, 30, 82);

  ctx.font = 'italic 400 54px "Newsreader", Georgia, serif';
  ctx.fillText(p.title, 30, 150);

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.font = '400 30px "DM Mono", ui-monospace, monospace';
  ctx.fillText(`${p.year} · PRINT`, 30, 215);
  ctx.restore();
}

export class GalleryScene {
  private container: HTMLElement;
  private callbacks: GalleryCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private printMeshes: THREE.Mesh[] = [];
  private outerSlotsByPrint: FocusedSlot[][] = Array.from({ length: 9 }, () => []);
  private printMaterials: THREE.MeshBasicMaterial[] = [];
  private printTextures: THREE.Texture[] = [];
  private labelTextures: THREE.CanvasTexture[] = [];
  private labelCanvases: HTMLCanvasElement[] = [];
  private disposables: Array<{ dispose: () => void }> = [];

  private pose: Pose;
  private targetTh: number;
  private focusedSlot: FocusedSlot | null = null;
  private hoveredMesh: THREE.Mesh | null = null;

  private intro = {
    started: false,
    active: false,
    startTime: 0,
    duration: 1400,
    startTh: 0,
    startR: 0,
  };

  private glide: GlideState = {
    active: false,
    startTime: 0,
    duration: 950,
    from: { th: 0, r: 15.6, yaw: -0.3, y: 1.92, pitch: -0.12 },
    to: { th: 0, r: 15.6, yaw: -0.3, y: 1.92, pitch: -0.12 },
    targetFocus: null,
  };

  private pointerDown = false;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private dragStartTarget = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerInside = false;

  private paused = false;
  private disposed = false;
  private rafId = 0;
  private timerId = 0;
  private failsafeTimer = 0;
  private lastFrameTime = performance.now();
  private needsRender = true;
  private artLoaded = false;
  private fontsLoaded = false;

  // Reusable math objects (zero GC in loop)
  private _pos = new THREE.Vector3();
  private _tangent = new THREE.Vector3();
  private _normal = new THREE.Vector3();
  private _dir = new THREE.Vector3();
  private _lookTarget = new THREE.Vector3();
  private _corner = new THREE.Vector3();

  private boundOnResize: () => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnPointerDown: (e: PointerEvent) => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;
  private boundOnPointerLeave: () => void;
  private boundOnContextLost: (e: Event) => void;
  private boundOnContextRestored: () => void;

  constructor(container: HTMLElement, callbacks: GalleryCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#FFF9EC');
    this.scene.fog = new THREE.Fog('#FFF9EC', 10, 46);

    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const fov = window.innerWidth >= window.innerHeight ? 56 : 70;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 100);

    // Spec lights
    this.scene.add(new THREE.HemisphereLight(0xfffdf6, 0xe9cfa6, 1.55));
    this.scene.add(new THREE.AmbientLight(0xfff6e6, 0.55));

    const D = getWalkOffsetD();
    const walkParams = getWalkPoseParams();
    this.targetTh = D;
    this.pose = {
      th: D + (isReducedMotion() ? 0 : 0.16),
      r: walkParams.r - (isReducedMotion() ? 0 : 0.35),
      yaw: walkParams.yaw,
      y: walkParams.y,
      pitch: walkParams.pitch,
    };

    this.buildRoom();
    this.buildPrints();
    this.applyCameraPose(this.pose);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.boundOnResize = () => this.handleResize();
    this.boundOnWheel = (e) => this.handleWheel(e);
    this.boundOnPointerDown = (e) => this.handlePointerDown(e);
    this.boundOnPointerMove = (e) => this.handlePointerMove(e);
    this.boundOnPointerUp = (e) => this.handlePointerUp(e);
    this.boundOnPointerLeave = () => this.handlePointerLeave();
    this.boundOnContextLost = (e) => {
      e.preventDefault();
      this.stopLoop();
    };
    this.boundOnContextRestored = () => {
      this.needsRender = true;
      this.startLoop();
    };

    window.addEventListener('resize', this.boundOnResize);
    canvas.addEventListener('wheel', this.boundOnWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.boundOnPointerDown);
    window.addEventListener('pointermove', this.boundOnPointerMove);
    window.addEventListener('pointerup', this.boundOnPointerUp);
    window.addEventListener('pointercancel', this.boundOnPointerUp);
    canvas.addEventListener('pointerleave', this.boundOnPointerLeave);
    canvas.addEventListener('webglcontextlost', this.boundOnContextLost);
    canvas.addEventListener('webglcontextrestored', this.boundOnContextRestored);

    this.loadAssetsAndStartIntro();
    this.startLoop();
  }

  private buildRoom(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const outerTex = createVerticalGradientTexture([
      [0, '#F5EBD8'],
      [0.2, '#FBF3E3'],
      [0.6, '#FBF3E3'],
      [0.86, '#F8EDD9'],
      [1, '#EFDFC4'],
    ]);
    const outerGeo = new THREE.CylinderGeometry(R, R, H, 160, 1, true);
    const outerMat = new THREE.MeshBasicMaterial({ map: outerTex, side: THREE.BackSide });
    const outerWall = new THREE.Mesh(outerGeo, outerMat);
    outerWall.position.y = H / 2;
    this.scene.add(outerWall);

    const innerTex = createVerticalGradientTexture([
      [0, '#F7EEDD'],
      [0.3, '#FFFAF0'],
      [0.8, '#FDF5E6'],
      [1, '#F1E1C6'],
    ]);
    const innerGeo = new THREE.CylinderGeometry(RIN, RIN, H, 120, 1, true);
    const innerMat = new THREE.MeshBasicMaterial({ map: innerTex, side: THREE.FrontSide });
    const innerPillar = new THREE.Mesh(innerGeo, innerMat);
    innerPillar.position.y = H / 2;
    this.scene.add(innerPillar);

    const floorTex = createFloorTexture(maxAniso);
    const floorGeo = new THREE.CircleGeometry(R, 160);
    const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const ceilingGeo = new THREE.CircleGeometry(R, 160);
    const ceilingMat = new THREE.MeshBasicMaterial({ color: 0xfaf1e0, side: THREE.BackSide });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = H;
    this.scene.add(ceiling);

    this.disposables.push(
      outerTex,
      outerGeo,
      outerMat,
      innerTex,
      innerGeo,
      innerMat,
      floorTex,
      floorGeo,
      floorMat,
      ceilingGeo,
      ceilingMat,
    );
  }

  private buildPrints(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const haloTex = createRadialAlphaTexture('255, 255, 255', 0.95, 0.35);
    const haloGeo = new THREE.PlaneGeometry(2.1 * PW, 1.75 * PH);
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      depthWrite: false,
      fog: true,
    });

    const shadowTex = createRadialAlphaTexture('120, 90, 50', 0.28, 0.25);
    const shadowGeo = new THREE.PlaneGeometry(1.25 * PW, 1.18 * PH);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    const frameGeo = new THREE.BoxGeometry(PW + 0.07, PH + 0.07, 0.06);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0xd3aa72 });
    const printGeo = new THREE.PlaneGeometry(PW, PH);
    const labelGeo = new THREE.PlaneGeometry(0.92, (0.92 * 260) / 640);

    this.disposables.push(
      haloTex,
      haloGeo,
      haloMat,
      shadowTex,
      shadowGeo,
      shadowMat,
      frameGeo,
      frameMat,
      printGeo,
      labelGeo,
    );

    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf6ead8 });
      this.printMaterials.push(mat);
      this.disposables.push(mat);

      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 640;
      labelCanvas.height = 260;
      this.labelCanvases.push(labelCanvas);

      const labelTex = new THREE.CanvasTexture(labelCanvas);
      labelTex.colorSpace = THREE.SRGBColorSpace;
      labelTex.anisotropy = maxAniso;
      this.labelTextures.push(labelTex);
      this.disposables.push(labelTex);
    }

    const labelMaterials = this.labelTextures.map((tex) => {
      const m = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      this.disposables.push(m);
      return m;
    });

    const createGroup = (
      printIdx: number,
      angle: number,
      wall: 'outer' | 'inner',
    ): THREE.Group => {
      const group = new THREE.Group();
      const radius = wall === 'outer' ? 17.98 : 12.22;
      group.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
      if (wall === 'outer') {
        group.lookAt(0, 0, 0);
      } else {
        group.lookAt(group.position.x * 2, 0, group.position.z * 2);
      }

      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(0, PY + 0.05, 0.005);
      group.add(halo);

      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(0.05, PY - 0.06, 0.01);
      group.add(shadow);

      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0, PY, 0.045);
      group.add(frame);

      const printMesh = new THREE.Mesh(printGeo, this.printMaterials[printIdx]);
      printMesh.position.set(0, PY, 0.077);
      const slot: FocusedSlot = { printIdx, angle, wall, mesh: printMesh };
      printMesh.userData.slot = slot;
      group.add(printMesh);
      this.printMeshes.push(printMesh);
      if (wall === 'outer') {
        this.outerSlotsByPrint[printIdx].push(slot);
      }

      const label = new THREE.Mesh(labelGeo, labelMaterials[printIdx]);
      label.position.set(-PW / 2 + 0.46, PY - PH / 2 - 0.42, 0.02);
      group.add(label);

      return group;
    };

    for (let s = 0; s < OUTER_COUNT; s++) {
      const angle = s * ((Math.PI * 2) / OUTER_COUNT);
      const printIdx = s % 9;
      this.scene.add(createGroup(printIdx, angle, 'outer'));
    }

    for (let k = 0; k < INNER_COUNT; k++) {
      const angle = (k + 0.5) * ((Math.PI * 2) / INNER_COUNT);
      const printIdx = (k + 4) % 9;
      this.scene.add(createGroup(printIdx, angle, 'inner'));
    }
  }

  private loadAssetsAndStartIntro(): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed) return;
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      const baseTex = new THREE.Texture(img);
      baseTex.colorSpace = THREE.SRGBColorSpace;
      baseTex.needsUpdate = true;
      this.disposables.push(baseTex);

      for (let i = 0; i < 9; i++) {
        const { x, y, w, h } = PRINTS[i].crop;
        const tex = baseTex.clone();
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.repeat.set(w / SHEET_W, h / SHEET_H);
        tex.offset.set(x / SHEET_W, 1 - (y + h) / SHEET_H);
        tex.needsUpdate = true;
        this.printTextures.push(tex);
        this.disposables.push(tex);

        const mat = this.printMaterials[i];
        mat.color.setHex(0xffffff);
        mat.map = tex;
        mat.needsUpdate = true;
      }

      this.artLoaded = true;
      this.needsRender = true;
      this.tryStartEntrance();
    };
    img.onerror = () => {
      this.artLoaded = true;
      this.tryStartEntrance();
    };
    img.src = SHEET_URL;

    document.fonts.ready.then(() => {
      if (this.disposed) return;
      for (let i = 0; i < 9; i++) {
        drawLabelCanvas(this.labelCanvases[i], i);
        this.labelTextures[i].needsUpdate = true;
      }
      this.fontsLoaded = true;
      this.needsRender = true;
      this.tryStartEntrance();
    });

    this.failsafeTimer = window.setTimeout(() => {
      if (!this.intro.started && !this.disposed) {
        for (let i = 0; i < 9; i++) {
          drawLabelCanvas(this.labelCanvases[i], i);
          this.labelTextures[i].needsUpdate = true;
        }
        this.startEntrance();
      }
    }, 4000);
  }

  private tryStartEntrance(): void {
    if (this.artLoaded && this.fontsLoaded && !this.intro.started) {
      this.startEntrance();
    }
  }

  private startEntrance(): void {
    if (this.intro.started || this.disposed) return;
    window.clearTimeout(this.failsafeTimer);
    this.intro.started = true;

    const D = getWalkOffsetD();
    const walkParams = getWalkPoseParams();

    if (isReducedMotion()) {
      this.intro.active = false;
      this.pose.th = D;
      this.pose.r = walkParams.r;
      this.targetTh = D;
      this.applyCameraPose(this.pose);
      this.needsRender = true;
    } else {
      this.intro.active = true;
      this.intro.startTime = performance.now();
      this.intro.startTh = D + 0.16;
      this.intro.startR = walkParams.r - 0.35;
      this.pose.th = this.intro.startTh;
      this.pose.r = this.intro.startR;
      this.targetTh = D;
    }

    this.callbacks.onEntranceStart();
  }

  private applyCameraPose(pose: Pose): void {
    const cosTh = Math.cos(pose.th);
    const sinTh = Math.sin(pose.th);
    this._pos.set(pose.r * cosTh, pose.y, pose.r * sinTh);
    this._tangent.set(sinTh, 0, -cosTh);
    this._normal.set(cosTh, 0, sinTh);

    const cosYaw = Math.cos(pose.yaw);
    const sinYaw = Math.sin(pose.yaw);
    this._dir
      .copy(this._tangent)
      .multiplyScalar(cosYaw)
      .addScaledVector(this._normal, sinYaw);

    this._lookTarget.copy(this._pos).add(this._dir);
    this._lookTarget.y += pose.pitch;

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._lookTarget);
    this.camera.updateMatrixWorld();
  }

  private handleResize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.fov = width >= height ? 56 : 70;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);

    if (!this.glide.active) {
      if (this.focusedSlot) {
        const fp = getFocusPoseParams(this.focusedSlot.wall);
        this.pose.r = fp.r;
        this.pose.yaw = fp.yaw;
        this.pose.y = fp.y;
        this.pose.pitch = fp.pitch;
      } else if (!this.intro.active) {
        const wp = getWalkPoseParams();
        this.pose.r = wp.r;
        this.pose.yaw = wp.yaw;
        this.pose.y = wp.y;
        this.pose.pitch = wp.pitch;
      }
      this.applyCameraPose(this.pose);
    }

    this.updateSmallScreenPill();
    this.needsRender = true;
  }

  private handleWheel(e: WheelEvent): void {
    if (this.paused) return;
    e.preventDefault();
    if (this.intro.active) {
      this.intro.active = false;
    }
    if (this.focusedSlot) {
      this.stepBack();
      return;
    }
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.targetTh -= delta * 0.0016;
    if (isReducedMotion()) {
      this.pose.th = this.targetTh;
      this.applyCameraPose(this.pose);
    }
    this.needsRender = true;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.paused || e.button !== 0) return;
    this.pointerDown = true;
    this.dragging = false;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.dragStartTarget = this.targetTh;
  }

  private handlePointerMove(e: PointerEvent): void {
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.pointerInside = true;

    if (this.paused) return;

    if (this.pointerDown) {
      const dx = e.clientX - this.downX;
      const dy = e.clientY - this.downY;
      if (!this.dragging && Math.hypot(dx, dy) > 6) {
        this.dragging = true;
        this.callbacks.onDragChange(true);
        if (this.intro.active) {
          this.intro.active = false;
        }
        if (this.focusedSlot) {
          this.stepBack();
          this.dragStartTarget = this.targetTh;
        }
      }
      if (this.dragging && !this.focusedSlot) {
        const sens = isSmallScreen() ? 0.0042 : 0.0022;
        const deltaPx = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        this.targetTh = this.dragStartTarget + deltaPx * sens;
        if (isReducedMotion()) {
          this.pose.th = this.targetTh;
          this.applyCameraPose(this.pose);
        }
        this.needsRender = true;
      }
      return;
    }

    this.updateHover(e.clientX, e.clientY);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.pointerDown) return;
    const wasDragging = this.dragging;
    this.pointerDown = false;
    this.dragging = false;
    this.callbacks.onDragChange(false);

    if (this.paused || wasDragging) return;

    const hit = this.raycastPrints(e.clientX, e.clientY);
    if (hit) {
      if (this.focusedSlot && this.focusedSlot.mesh === hit.mesh) {
        const rect = this.getProjectedRect(hit.mesh);
        this.callbacks.onOpenPrint(hit.printIdx, rect);
      } else {
        this.glideToFocus(hit);
      }
    } else if (this.focusedSlot) {
      this.stepBack();
    }
  }

  private handlePointerLeave(): void {
    this.pointerInside = false;
    this.hoveredMesh = null;
    this.callbacks.onHoverState({
      overAny: false,
      overFocused: false,
      x: this.lastPointerX,
      y: this.lastPointerY,
    });
  }

  private raycastPrints(clientX: number, clientY: number): FocusedSlot | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.printMeshes, false);
    if (hits.length === 0) return null;
    const mesh = hits[0].object as THREE.Mesh;
    return (mesh.userData.slot as FocusedSlot) || null;
  }

  private updateHover(clientX: number, clientY: number): void {
    if (this.paused || this.dragging || !this.pointerInside) {
      this.callbacks.onHoverState({ overAny: false, overFocused: false, x: clientX, y: clientY });
      return;
    }
    const hit = this.raycastPrints(clientX, clientY);
    this.hoveredMesh = hit ? hit.mesh : null;
    const overFocused = Boolean(hit && this.focusedSlot && hit.mesh === this.focusedSlot.mesh);
    this.callbacks.onHoverState({
      overAny: Boolean(hit),
      overFocused,
      x: clientX,
      y: clientY,
    });
  }

  private nearestAngleCopy(angle: number, referenceTh: number): number {
    let a = angle;
    while (a - referenceTh > Math.PI) a -= Math.PI * 2;
    while (a - referenceTh < -Math.PI) a += Math.PI * 2;
    return a;
  }

  public glideToFocus(slot: FocusedSlot): void {
    if (this.intro.active) {
      this.intro.active = false;
    }
    const destTh = this.nearestAngleCopy(slot.angle, this.pose.th);
    const fp = getFocusPoseParams(slot.wall);
    const toPose: Pose = {
      th: destTh,
      r: fp.r,
      yaw: fp.yaw,
      y: fp.y,
      pitch: fp.pitch,
    };

    this.focusedSlot = slot;
    this.targetTh = destTh;
    this.callbacks.onFocusChange({
      printIdx: slot.printIdx,
      wall: slot.wall,
      angle: destTh,
    });

    if (isReducedMotion()) {
      this.glide.active = false;
      this.pose = { ...toPose };
      this.applyCameraPose(this.pose);
      this.updateSmallScreenPill();
      this.needsRender = true;
      return;
    }

    this.glide = {
      active: true,
      startTime: performance.now(),
      duration: 950,
      from: { ...this.pose },
      to: toPose,
      targetFocus: slot,
    };
    this.needsRender = true;
  }

  public stepBack(): void {
    if (!this.focusedSlot && !this.glide.active) return;
    const D = getWalkOffsetD();
    const wp = getWalkPoseParams();
    const destTh = this.pose.th + D;
    const toPose: Pose = {
      th: destTh,
      r: wp.r,
      yaw: wp.yaw,
      y: wp.y,
      pitch: wp.pitch,
    };

    this.focusedSlot = null;
    this.targetTh = destTh;
    this.callbacks.onFocusChange(null);
    this.callbacks.onSmallScreenPill({ visible: false, x: 0, y: 0 });
    this.callbacks.onHoverState({
      overAny: false,
      overFocused: false,
      x: this.lastPointerX,
      y: this.lastPointerY,
    });

    if (isReducedMotion()) {
      this.glide.active = false;
      this.pose = { ...toPose };
      this.applyCameraPose(this.pose);
      this.needsRender = true;
      return;
    }

    this.glide = {
      active: true,
      startTime: performance.now(),
      duration: 950,
      from: { ...this.pose },
      to: toPose,
      targetFocus: null,
    };
    this.needsRender = true;
  }

  public stepArrow(d: 1 | -1): void {
    if (this.paused) return;
    if (this.intro.active) {
      this.intro.active = false;
    }
    if (this.focusedSlot) {
      this.stepBack();
      return;
    }
    const D = getWalkOffsetD();
    this.targetTh = (Math.round((this.targetTh - D) / STEP) - d) * STEP + D;
    if (isReducedMotion()) {
      this.pose.th = this.targetTh;
      this.applyCameraPose(this.pose);
    }
    this.needsRender = true;
  }

  public focusNearestOuterPrint(printIdx: number): void {
    const copies = this.outerSlotsByPrint[printIdx];
    if (!copies || copies.length === 0) return;

    let bestSlot = copies[0];
    let bestAngle = this.nearestAngleCopy(bestSlot.angle, this.pose.th);
    let bestDist = Math.abs(bestAngle - this.pose.th);

    for (let i = 1; i < copies.length; i++) {
      const candidateAngle = this.nearestAngleCopy(copies[i].angle, this.pose.th);
      const dist = Math.abs(candidateAngle - this.pose.th);
      if (dist < bestDist) {
        bestDist = dist;
        bestSlot = copies[i];
        bestAngle = candidateAngle;
      }
    }

    this.glideToFocus({ ...bestSlot, angle: bestAngle });
  }

  public getProjectedRectForFocused(): ScreenRect | null {
    if (!this.focusedSlot) return null;
    return this.getProjectedRect(this.focusedSlot.mesh);
  }

  private getProjectedRect(mesh: THREE.Mesh): ScreenRect {
    mesh.updateWorldMatrix(true, false);
    const hw = PW / 2;
    const hh = PH / 2;
    const corners: [number, number][] = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
    const w = window.innerWidth;
    const h = window.innerHeight;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [cx, cy] of corners) {
      this._corner.set(cx, cy, 0).applyMatrix4(mesh.matrixWorld).project(this.camera);
      const sx = ((this._corner.x + 1) / 2) * w;
      const sy = ((-this._corner.y + 1) / 2) * h;
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }

    return {
      left: minX,
      top: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  private updateSmallScreenPill(): void {
    if (!this.focusedSlot || this.paused || !isSmallScreen()) {
      this.callbacks.onSmallScreenPill({ visible: false, x: 0, y: 0 });
      return;
    }
    const rect = this.getProjectedRect(this.focusedSlot.mesh);
    this.callbacks.onSmallScreenPill({
      visible: true,
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.55,
    });
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.pointerDown = false;
      this.dragging = false;
      this.callbacks.onDragChange(false);
      this.callbacks.onSmallScreenPill({ visible: false, x: 0, y: 0 });
      this.callbacks.onHoverState({ overAny: false, overFocused: false, x: 0, y: 0 });
    } else {
      this.updateSmallScreenPill();
      this.needsRender = true;
    }
  }

  private startLoop(): void {
    this.lastFrameTime = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;

      let moving = false;

      if (this.intro.active) {
        const t = Math.min(1, (now - this.intro.startTime) / this.intro.duration);
        const ease = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
        const D = getWalkOffsetD();
        const wp = getWalkPoseParams();
        this.pose.th = this.intro.startTh + (D - this.intro.startTh) * ease;
        this.pose.r = this.intro.startR + (wp.r - this.intro.startR) * ease;
        this.pose.yaw = wp.yaw;
        this.pose.y = wp.y;
        this.pose.pitch = wp.pitch;
        this.applyCameraPose(this.pose);
        moving = true;
        if (t >= 1) {
          this.intro.active = false;
          this.targetTh = D;
        }
      } else if (this.glide.active) {
        const t = Math.min(1, (now - this.glide.startTime) / this.glide.duration);
        const eTh = 1 - Math.pow(1 - t, 4);
        const eYaw = 1 - Math.pow(1 - t, 2);
        const eCubic = 1 - Math.pow(1 - t, 3);

        this.pose.th = this.glide.from.th + (this.glide.to.th - this.glide.from.th) * eTh;
        this.pose.yaw = this.glide.from.yaw + (this.glide.to.yaw - this.glide.from.yaw) * eYaw;
        this.pose.r = this.glide.from.r + (this.glide.to.r - this.glide.from.r) * eCubic;
        this.pose.y = this.glide.from.y + (this.glide.to.y - this.glide.from.y) * eCubic;
        this.pose.pitch =
          this.glide.from.pitch + (this.glide.to.pitch - this.glide.from.pitch) * eCubic;

        this.applyCameraPose(this.pose);
        this.updateSmallScreenPill();
        moving = true;
        if (t >= 1) {
          this.glide.active = false;
          this.updateSmallScreenPill();
          if (this.pointerInside && !this.paused) {
            this.updateHover(this.lastPointerX, this.lastPointerY);
          }
        }
      } else if (!this.focusedSlot) {
        const diff = this.targetTh - this.pose.th;
        if (Math.abs(diff) > 1e-5) {
          if (isReducedMotion()) {
            this.pose.th = this.targetTh;
          } else {
            this.pose.th += diff * (1 - Math.exp(-dt / 0.36));
          }
          this.applyCameraPose(this.pose);
          moving = true;
          if (this.pointerInside && !this.paused && !this.dragging) {
            this.updateHover(this.lastPointerX, this.lastPointerY);
          }
        } else if (diff !== 0) {
          this.pose.th = this.targetTh;
          this.applyCameraPose(this.pose);
          moving = true;
        }
      }

      const didRender = moving || this.needsRender;
      if (didRender) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }

      if (this.isSoftwareGl && didRender) {
        this.afterDraw(tick);
      } else {
        this.rafId = requestAnimationFrame(tick);
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.timerId = window.setTimeout(cb, 80);
        }
      };
      this.timerId = window.setTimeout(poll, 5);
    } else {
      this.timerId = window.setTimeout(cb, 80);
    }
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.timerId);
  }

  public dispose(): void {
    this.disposed = true;
    this.stopLoop();
    window.clearTimeout(this.failsafeTimer);

    const canvas = this.renderer.domElement;
    window.removeEventListener('resize', this.boundOnResize);
    canvas.removeEventListener('wheel', this.boundOnWheel);
    canvas.removeEventListener('pointerdown', this.boundOnPointerDown);
    window.removeEventListener('pointermove', this.boundOnPointerMove);
    window.removeEventListener('pointerup', this.boundOnPointerUp);
    window.removeEventListener('pointercancel', this.boundOnPointerUp);
    canvas.removeEventListener('pointerleave', this.boundOnPointerLeave);
    canvas.removeEventListener('webglcontextlost', this.boundOnContextLost);
    canvas.removeEventListener('webglcontextrestored', this.boundOnContextRestored);

    for (const item of this.disposables) {
      item.dispose();
    }
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
