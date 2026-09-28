import * as THREE from 'three';

const canvas = document.getElementById('scene');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// WebGL が使えない環境では例外で止まり、CSS の背景のまま表示される
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x010d14, 1);
renderer.autoClear = false;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
    return v;
  }
`;

// ---------- 霧（背景） ----------
const fogScene = new THREE.Scene();
const fogCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fogUniforms = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uMouse: { value: new THREE.Vector2() },
  uScroll: { value: 0 },
};
fogScene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms: fogUniforms,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uScroll;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float t = uTime * 0.035;
        vec2 q = vec2(fbm(p * 1.5 + t), fbm(p * 1.5 - t + 3.1));
        vec2 r = vec2(fbm(p * 1.9 + q * 1.7 + vec2(1.7, 9.2) + t * 1.3),
                      fbm(p * 1.9 + q * 1.7 + vec2(8.3, 2.8) - t));
        float f = fbm(p * 1.7 + r * 1.6 + uMouse * 0.12);
        vec3 col = mix(vec3(0.003, 0.02, 0.035), vec3(0.01, 0.14, 0.21), f * f * 1.7);
        col += vec3(0.28, 0.48, 0.62) * pow(f, 4.5) * 0.55;
        col += vec3(0.02, 0.07, 0.11) * smoothstep(0.85, 0.0, length(p - vec2(0.0, 0.2)));
        col *= 1.0 - uScroll * 0.5;
        col *= smoothstep(1.5, 0.15, length(p));
        // 走査線のようなかすかなちらつき
        col *= 0.97 + 0.03 * sin(vUv.y * uRes.y * 1.5 + uTime * 8.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
));

// ---------- 本体 ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0.6, 6);

const logoTex = new THREE.TextureLoader().load('assets/logo.jpg');
logoTex.colorSpace = THREE.SRGBColorSpace;

function logoMaterial({ reflect = 0, mirror = 0, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTex: { value: logoTex },
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uReflect: { value: reflect },
      uMirror: { value: mirror },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uTime; uniform float uOpacity; uniform float uReflect; uniform float uMirror;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        if (uMirror > 0.5) uv.x = 1.0 - uv.x;
        // 吐息のゆらぎ
        float breath = smoothstep(0.47, 0.7, uv.x) * (1.0 - uMirror);
        uv.y += breath * sin(uv.x * 13.0 - uTime * 1.1) * 0.013;
        uv.x += breath * sin(uv.y * 9.0 + uTime * 0.8) * 0.009;
        // 水面の揺れ
        if (uReflect > 0.5) uv.x += sin(uv.y * 70.0 + uTime * 2.2) * 0.004;
        vec3 c = texture2D(uTex, uv).rgb;
        float lum = dot(c, vec3(0.3, 0.5, 0.2));
        float a = smoothstep(0.2, 0.55, lum);
        float n = noise(uv * 9.0 + vec2(uTime * 0.25, -uTime * 0.15));
        a *= smoothstep(0.52, 0.34, length(uv - 0.5));
        a *= mix(1.0, 0.55 + 0.45 * n, breath);
        vec3 col = c * 1.2 + vec3(0.04, 0.09, 0.14) * n;
        if (uReflect > 0.5) a *= pow(1.0 - vUv.y, 2.2) * 0.32;
        if (uMirror > 0.5) { a *= smoothstep(0.35, 0.75, n); col = vec3(0.75, 0.85, 0.92) * lum; }
        gl_FragColor = vec4(col, a * uOpacity);
      }
    `,
  });
}

const LOGO_SIZE = 2.3;
const logoGroup = new THREE.Group();
scene.add(logoGroup);

const logo = new THREE.Mesh(new THREE.PlaneGeometry(LOGO_SIZE, LOGO_SIZE), logoMaterial());
logo.position.y = 1.05;
logoGroup.add(logo);

// 映り込み（上下反転）
const reflection = new THREE.Mesh(new THREE.PlaneGeometry(LOGO_SIZE, LOGO_SIZE), logoMaterial({ reflect: 1 }));
reflection.scale.y = -1;
reflection.position.y = 1.05 - LOGO_SIZE + 0.08;
logoGroup.add(reflection);

// 霧の奥の、もうひとつの顔
const glimpse = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), logoMaterial({ mirror: 1, opacity: 0 }));
glimpse.position.set(-3.2, 0.9, -4);
scene.add(glimpse);
let glimpseAt = 14 + Math.random() * 10;

// ---------- 塵 ----------
const COUNT = 1400;
const pos = new Float32Array(COUNT * 3);
const seed = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  pos[i * 3] = (Math.random() - 0.5) * 14;
  pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
  pos[i * 3 + 2] = -6 + Math.random() * 9;
  seed[i] = Math.random();
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
const dustUniforms = { uTime: { value: 0 }, uPixel: { value: renderer.getPixelRatio() } };
const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: dustUniforms,
  vertexShader: /* glsl */ `
    uniform float uTime; uniform float uPixel;
    attribute float aSeed;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      p.y = mod(p.y + uTime * (0.03 + aSeed * 0.06) + 4.5, 9.0) - 4.5;
      p.x += sin(uTime * 0.2 + aSeed * 40.0) * 0.25;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = (1.2 + aSeed * 2.6) * uPixel * (6.0 / -mv.z);
      vAlpha = (0.25 + 0.75 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 90.0)));
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d) * vAlpha * 0.55;
      gl_FragColor = vec4(vec3(0.68, 0.84, 0.95), a);
    }
  `,
}));
scene.add(dust);

// ---------- 入力 ----------
const mouse = new THREE.Vector2();
const mouseSmooth = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
}, { passive: true });

let scroll = 0;
function onScroll() { scroll = Math.min(1, window.scrollY / window.innerHeight); }
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fogUniforms.uRes.value.set(w, h);
  // 縦長の画面ではロゴを小さく
  const visibleW = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
  logoGroup.scale.setScalar(Math.min(1, (visibleW * 0.82) / LOGO_SIZE));
}
window.addEventListener('resize', resize);
resize();

// ---------- 描画 ----------
const clock = new THREE.Clock();
const mats = [logo.material, reflection.material, glimpse.material];

function frame() {
  const t = clock.getElapsedTime();
  mouseSmooth.lerp(mouse, 0.04);

  fogUniforms.uTime.value = t;
  fogUniforms.uMouse.value.copy(mouseSmooth);
  fogUniforms.uScroll.value = scroll;
  dustUniforms.uTime.value = t;
  mats.forEach((m) => { m.uniforms.uTime.value = t; });

  // ロゴは呼吸するように揺れ、スクロールで闇へ退く
  logoGroup.position.y = Math.sin(t * 0.5) * 0.04 + scroll * 1.2;
  logoGroup.position.z = -scroll * 2.5;
  logo.material.uniforms.uOpacity.value = Math.max(0, 1 - scroll * 1.4);
  reflection.material.uniforms.uOpacity.value = Math.max(0, 1 - scroll * 2);
  logoGroup.visible = scroll < 0.99;

  // ごくまれに、霧の奥に横顔が浮かぶ
  const g = t - glimpseAt;
  let ga = 0;
  if (g > 0 && g < 3.2) ga = Math.sin((g / 3.2) * Math.PI) * 0.16;
  if (g >= 3.2) glimpseAt = t + 22 + Math.random() * 20;
  glimpse.material.uniforms.uOpacity.value = ga;
  glimpse.position.x = -3.2 - mouseSmooth.x * 0.6;

  camera.position.x = mouseSmooth.x * 0.35;
  camera.position.y = 0.6 + mouseSmooth.y * 0.2;
  camera.lookAt(0, 0.55, 0);
  dust.rotation.y = mouseSmooth.x * 0.08;

  renderer.clear();
  renderer.render(fogScene, fogCamera);
  renderer.render(scene, camera);

  if (!reduceMotion) requestAnimationFrame(frame);
}

logoTex.onUpdate = () => { if (reduceMotion) frame(); };
frame();
document.documentElement.classList.add('webgl');
