import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';

/**
 * Escena 3D del inicio: pelota con gorro de cumpleaños flotando entre confeti.
 * three.js se carga aparte (solo en esta pantalla). Si no hay WebGL se muestra el logo.
 */
@Component({
  selector: 'app-ball3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <canvas #canvas class="absolute inset-0 h-full w-full touch-pan-y" [class.opacity-0]="!ready()" aria-hidden="true"></canvas>
    @if (!ready()) {
      <img src="brand/mark.svg" alt="" class="absolute inset-0 m-auto h-3/5 w-3/5 animate-float" [class.opacity-0]="loading()" />
    }
  `,
  styles: `
    canvas {
      transition: opacity 0.8s ease;
    }
  `,
})
export class Ball3dComponent implements AfterViewInit, OnDestroy {
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly ready = signal(false);
  protected readonly loading = signal(true);
  private cleanup: (() => void) | null = null;
  private destroyed = false;

  async ngAfterViewInit() {
    try {
      const THREE = await import('three');
      if (this.destroyed) return;
      this.cleanup = buildScene(THREE, this.canvas().nativeElement, () => this.ready.set(true));
    } catch {
      /* sin WebGL: queda el logo */
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.cleanup?.();
  }
}

type Three = typeof import('three');

const BALL_VERT = /* glsl */ `
  varying vec3 vObjN;
  varying vec3 vViewN;
  varying vec3 vViewPos;
  void main() {
    vObjN = normalize(position);
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const BALL_FRAG = /* glsl */ `
  uniform vec3 uCenters[32];
  varying vec3 vObjN;
  varying vec3 vViewN;
  varying vec3 vViewPos;
  void main() {
    // Patrón clásico: 12 pentágonos (vértices del icosaedro) y 20 hexágonos.
    float best = -2.0;
    float second = -2.0;
    int bestIdx = 0;
    for (int i = 0; i < 32; i++) {
      float d = dot(vObjN, uCenters[i]) + (i < 12 ? -0.025 : 0.0);
      if (d > best) { second = best; best = d; bestIdx = i; }
      else if (d > second) { second = d; }
    }
    vec3 white = vec3(0.97, 0.96, 1.0);
    vec3 dark = vec3(0.12, 0.08, 0.05);
    vec3 base = bestIdx < 12 ? dark : white;
    float seam = 1.0 - smoothstep(0.004, 0.014, best - second);
    base = mix(base, vec3(0.55, 0.47, 0.42), seam * (bestIdx < 12 ? 0.0 : 0.85));

    vec3 n = normalize(vViewN);
    vec3 v = normalize(-vViewPos);
    vec3 keyDir = normalize(vec3(-0.5, 0.8, 0.7));
    float diff = max(dot(n, keyDir), 0.0);
    vec3 h = normalize(keyDir + v);
    float spec = pow(max(dot(n, h), 0.0), 48.0) * (bestIdx < 12 ? 0.5 : 0.35);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    vec3 rimPink = vec3(1.0, 0.45, 0.05) * rim * smoothstep(-0.2, 0.6, n.x) * 0.8;
    vec3 rimLime = vec3(1.0, 0.75, 0.4) * rim * smoothstep(-0.2, 0.6, -n.x) * 0.45;
    vec3 col = base * (0.28 + 0.85 * diff) + spec + rimPink + rimLime;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function ballCenters(T: Three): import('three').Vector3[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const ico: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) ico.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  const dod: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) dod.push([a, b, c]);
  // Centros de las caras del icosaedro (vértices del dodecaedro dual, misma orientación).
  for (const a of [-1, 1]) for (const b of [-1, 1]) dod.push([0, a * phi, b / phi], [a / phi, 0, b * phi], [a * phi, b / phi, 0]);
  return [...ico, ...dod].map(([x, y, z]) => new T.Vector3(x, y, z).normalize());
}

function stripeTexture(T: Three) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f26200';
  g.fillRect(0, 0, 256, 256);
  const colors = ['#ffffff', '#ffb648'];
  for (let i = -8; i < 16; i++) {
    g.fillStyle = colors[(i + 8) % 2];
    g.save();
    g.translate(i * 32, 0);
    g.rotate(-0.5);
    g.fillRect(0, -50, 12, 400);
    g.restore();
  }
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 26; i++) {
    g.beginPath();
    g.arc((i * 97) % 256, (i * 53) % 256, 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function buildScene(T: Three, canvas: HTMLCanvasElement, onReady: () => void): () => void {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0.25, 6.2);

  scene.add(new T.AmbientLight(0xffe7d4, 1.0));
  const key = new T.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 4, 4);
  scene.add(key);
  const pink = new T.PointLight(0xff7a1a, 14, 12);
  pink.position.set(3, 0.5, 2);
  scene.add(pink);

  // Grupo principal (se inclina hacia el dedo / mouse)
  const rig = new T.Group();
  scene.add(rig);

  // Pelota
  const ballMat = new T.ShaderMaterial({
    uniforms: { uCenters: { value: ballCenters(T) } },
    vertexShader: BALL_VERT,
    fragmentShader: BALL_FRAG,
  });
  const ball = new T.Mesh(new T.SphereGeometry(1, 128, 96), ballMat);
  rig.add(ball);

  // Gorro de cumpleaños
  const hat = new T.Group();
  const tex = stripeTexture(T);
  const cone = new T.Mesh(
    new T.ConeGeometry(0.48, 1.05, 64, 1, true),
    new T.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05, side: T.DoubleSide }),
  );
  cone.position.y = 0.52;
  hat.add(cone);
  const lime = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x552200, emissiveIntensity: 0.25 });
  const brim = new T.Mesh(new T.TorusGeometry(0.47, 0.065, 16, 64), lime);
  brim.rotation.x = Math.PI / 2;
  hat.add(brim);
  const pom = new T.Mesh(new T.IcosahedronGeometry(0.13, 2), lime);
  pom.position.y = 1.08;
  hat.add(pom);
  hat.position.set(-0.12, 0.86, 0);
  hat.rotation.z = 0.32;
  rig.add(hat);

  // Confeti
  const COUNT = 140;
  const palette = [0xf26200, 0xff8a1f, 0xffb648, 0xffd089, 0xd13f00, 0xffe1c2].map((c) => new T.Color(c));
  const confetti = new T.InstancedMesh(
    new T.PlaneGeometry(0.09, 0.05),
    new T.MeshBasicMaterial({ side: T.DoubleSide, transparent: true, opacity: 0.95 }),
    COUNT,
  );
  const bits = Array.from({ length: COUNT }, (_, i) => {
    confetti.setColorAt(i, palette[i % palette.length]);
    return {
      x: (Math.random() - 0.5) * 7,
      y: (Math.random() - 0.5) * 6,
      z: -2.5 + Math.random() * 3.6,
      speed: 0.25 + Math.random() * 0.45,
      spin: (Math.random() - 0.5) * 4,
      phase: Math.random() * Math.PI * 2,
    };
  });
  scene.add(confetti);
  const dummy = new T.Object3D();

  // Sombra suave bajo la pelota
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(120,55,10,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new T.CanvasTexture(c);
  })();
  const shadow = new T.Mesh(new T.PlaneGeometry(2.4, 0.7), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.position.set(0, -1.45, 0);
  shadow.rotation.x = -Math.PI / 2.4;
  scene.add(shadow);

  // Interacción
  const target = { x: 0, y: 0 };
  const onPointer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  };
  const onLeave = () => {
    target.x = 0;
    target.y = 0;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });
  canvas.addEventListener('pointerleave', onLeave);
  let kick = 0;
  const onTap = () => (kick = 1);
  canvas.addEventListener('pointerdown', onTap);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !reduce) loop();
  });
  io.observe(canvas);

  const clock = new T.Clock();
  let raf = 0;
  let spin = 0;
  const render = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    kick *= 0.94;
    spin += dt * (0.5 + kick * 9);
    ball.rotation.y = spin;
    ball.rotation.x = Math.sin(t * 0.4) * 0.25 + kick * 0.6;
    rig.position.y = Math.sin(t * 1.3) * 0.12 + kick * 0.35;
    rig.rotation.z += (-target.x * 0.25 - rig.rotation.z) * 0.06;
    rig.rotation.x += (target.y * 0.2 - rig.rotation.x) * 0.06;
    hat.rotation.z = 0.32 + Math.sin(t * 2.1) * 0.06 - kick * 0.4;
    shadow.scale.setScalar(1 - rig.position.y * 0.4);
    pink.position.x = 3 * Math.cos(t * 0.6);
    pink.position.z = 2 + Math.sin(t * 0.6);

    for (let i = 0; i < COUNT; i++) {
      const b = bits[i];
      b.y -= b.speed * dt;
      if (b.y < -3) b.y = 3;
      dummy.position.set(b.x + Math.sin(t + b.phase) * 0.15, b.y, b.z);
      dummy.rotation.set(t * b.spin, t * b.spin * 0.7, b.phase);
      dummy.updateMatrix();
      confetti.setMatrixAt(i, dummy.matrix);
    }
    confetti.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  };
  const loop = () => {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!visible) return;
      render();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  render();
  onReady();
  if (!reduce) loop();

  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    window.removeEventListener('pointermove', onPointer);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onTap);
    scene.traverse((o) => {
      const m = o as import('three').Mesh;
      m.geometry?.dispose();
      const mat = m.material as import('three').Material | undefined;
      mat?.dispose();
    });
    tex.dispose();
    shadowTex.dispose();
    renderer.dispose();
  };
}
