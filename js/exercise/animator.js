/**
 * The Three.js exercise animator.
 *
 * mountAnimator(container, archetype) builds a scene — figure, apparatus,
 * lights, ground — and loops the archetype's animation. It returns a handle
 * with pause/resume/setArchetype/dispose so the skill view can drive it and
 * tear it down cleanly on navigation.
 *
 * Three.js loads on demand from the CDN the first time an animator mounts, so
 * the module graph stays light for every page that never opens one.
 */
import { buildFigure, applyPose } from './figure.js';
import { poseFor } from './poses.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
let threePromise = null;

function loadThree() {
  if (!threePromise) threePromise = import(/* @vite-ignore */ THREE_URL);
  return threePromise;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Interpolate the pose at phase p (0..1) across a keyframe list. */
function sampleFrames(frames, p) {
  if (frames.length === 1) return frames[0].pose;
  let a = frames[0];
  let b = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i += 1) {
    if (p >= frames[i].t && p <= frames[i + 1].t) { a = frames[i]; b = frames[i + 1]; break; }
  }
  const span = b.t - a.t || 1;
  const k = smooth((p - a.t) / span);
  return blend(a.pose, b.pose, k);
}

function blend(pa, pb, k) {
  const out = {};
  const names = new Set([...Object.keys(pa), ...Object.keys(pb)]);
  for (const name of names) {
    if (name === 'root') continue;
    const va = pa[name] || [0, 0, 0];
    const vb = pb[name] || [0, 0, 0];
    out[name] = [0, 1, 2].map((i) => va[i] + (vb[i] - va[i]) * k);
  }
  const ra = pa.root || {};
  const rb = pb.root || {};
  const mix = (a = [], b = [], def) => [0, 1, 2].map((i) =>
    (a[i] ?? def[i]) + ((b[i] ?? def[i]) - (a[i] ?? def[i])) * k);
  out.root = {
    pos: mix(ra.pos, rb.pos, [0, 0.86, 0]),
    rot: mix(ra.rot, rb.rot, [0, 0, 0]),
  };
  return out;
}

function buildApparatus(THREE, kind, opts = {}) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });

  const bar = (y, len = 1.6) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 12), metal);
    b.rotation.z = Math.PI / 2; b.position.y = y; group.add(b);
    return b;
  };

  if (kind === 'bar') {
    const y = opts.barY ?? 1.55;
    bar(y);
    for (const x of [-0.8, 0.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, y, 10), dark);
      post.position.set(x, y / 2, 0); group.add(post);
    }
  } else if (kind === 'rings') {
    const y = opts.ringsY ?? 1.35;
    for (const x of [-0.42, 0.42]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 }));
      ring.position.set(x, y, 0); ring.rotation.x = Math.PI / 2; group.add(ring);
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 6), dark);
      strap.position.set(x, y + 0.35, 0); group.add(strap);
    }
  } else if (kind === 'parallettes') {
    for (const x of [-0.3, 0.3]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 10), metal);
      b.rotation.x = Math.PI / 2; b.position.set(x, 0.18, 0); group.add(b);
      for (const z of [-0.13, 0.13]) {
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.18, 8), dark);
        foot.position.set(x, 0.09, z); group.add(foot);
      }
    }
  } else if (kind === 'wall') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111c30, roughness: 0.9 }));
    wall.position.set(0, 1.2, -0.35); wall.receiveShadow = true; group.add(wall);
  } else if (kind === 'bench') {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.4), dark);
    bench.position.set(0, 0.62, 0.1); bench.castShadow = true; bench.receiveShadow = true;
    group.add(bench);
    for (const z of [-0.5, 0.5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.56, 0.08), dark);
      leg.position.set(0, 0.28, 0.1 + z); group.add(leg);
    }
  }
  return group;
}

export async function mountAnimator(container, archetype, opts = {}) {
  const THREE = await loadThree();
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 360;

  const scene = new THREE.Scene();
  const spec = poseFor(archetype);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.style.touchAction = 'none';

  // Drag to orbit, wheel to zoom. Kept lightweight — no external controls dep.
  let dragging = false; let lastX = 0; let lastY = 0;
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.style.cursor = 'grabbing'; e.preventDefault(); };
  const onMove = (e) => {
    if (!dragging) return;
    orbit.azimuth -= (e.clientX - lastX) * 0.01;
    orbit.polar -= (e.clientY - lastY) * 0.01;
    lastX = e.clientX; lastY = e.clientY;
    updateCamera();
  };
  const onUp = () => { dragging = false; renderer.domElement.style.cursor = 'grab'; };
  const onWheel = (e) => { orbit.radius = Math.max(1.6, Math.min(9, orbit.radius + e.deltaY * 0.003)); updateCamera(); e.preventDefault(); };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);

  // Orbit state in spherical coords around a look target. The archetype's eye
  // seeds it; dragging changes azimuth/polar, the wheel changes radius.
  const orbit = { target: new THREE.Vector3(), radius: 4, azimuth: 0, polar: 1.2 };
  const applyCamera = (spec) => {
    orbit.target.set(...spec.camera.look);
    const e = new THREE.Vector3(...spec.camera.eye).sub(orbit.target);
    orbit.radius = e.length();
    orbit.azimuth = Math.atan2(e.x, e.z);
    orbit.polar = Math.acos(Math.max(-1, Math.min(1, e.y / orbit.radius)));
  };
  const updateCamera = () => {
    orbit.polar = Math.max(0.25, Math.min(Math.PI - 0.15, orbit.polar));
    const sinP = Math.sin(orbit.polar);
    camera.position.set(
      orbit.target.x + orbit.radius * sinP * Math.sin(orbit.azimuth),
      orbit.target.y + orbit.radius * Math.cos(orbit.polar),
      orbit.target.z + orbit.radius * sinP * Math.cos(orbit.azimuth),
    );
    camera.lookAt(orbit.target);
  };
  applyCamera(spec);
  updateCamera();

  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x0b1220, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf97316, 0.5);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(8, 24, 0x1e293b, 0x162032);
  grid.position.y = 0.001;
  scene.add(grid);

  let apparatus = buildApparatus(THREE, spec.apparatus, spec.apparatusOpts);
  scene.add(apparatus);

  const figure = buildFigure(THREE);
  scene.add(figure.root);
  if (opts.muscles) figure.setActiveMuscles(opts.muscles);
  // Snap to the opening pose immediately so the first frame is not the T-rig.
  applyPose(figure, spec.motion === 'hold' ? spec.hold : spec.frames[0].pose, 1);

  let running = !opts.paused;
  let raf = 0;
  let phase = 0;
  const clock = new THREE.Clock();
  let current = spec;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (running) phase += dt;

    if (current.motion === 'hold') {
      const target = { ...current.hold };
      const s = current.sway || {};
      const wob = Math.sin(phase * 1.4) * 1; // gentle breathing
      const swayed = { ...target };
      for (const [k, v] of Object.entries(s)) {
        if (k === 'root') swayed.root = { ...target.root, ...v };
        else swayed[k] = v.map((n) => n + wob * 0.4);
      }
      applyPose(figure, swayed, 0.08);
    } else {
      // ping-pong 0→1→0 over a rep period
      const period = 2.6;
      const tri = 1 - Math.abs(((phase / period) % 2) - 1);
      applyPose(figure, sampleFrames(current.frames, tri), 0.35);
    }
    renderer.render(scene, camera);
  }
  frame();

  const onResize = () => {
    const w = container.clientWidth || width;
    const h = container.clientHeight || height;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    setMuscles(muscles) { figure.setActiveMuscles(muscles || {}); },
    setArchetype(next) {
      current = poseFor(next);
      scene.remove(apparatus);
      apparatus = buildApparatus(THREE, current.apparatus, current.apparatusOpts);
      scene.add(apparatus);
      applyCamera(current);
      updateCamera();
      phase = 0;
    },
    pause() { running = false; },
    resume() { running = true; clock.getDelta(); },
    toggle() { running = !running; if (running) clock.getDelta(); return running; },
    get running() { return running; },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.domElement.remove();
    },
  };
}
