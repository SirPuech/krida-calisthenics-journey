/**
 * A muscular male figure whose individual muscles can be highlighted.
 *
 * The joint hierarchy and every pivot position match the original rig, so all
 * archetype poses keep working. Each muscle belly is tagged with a group name
 * and collected in `muscleMeshes`, so the animator can light up the muscles an
 * exercise actually works — the anatomy shown on the model, not a flat chart.
 *
 * No Three.js import; the caller passes THREE in.
 */
const DEG = Math.PI / 180;

const L = {
  spine: 0.52, neck: 0.09, head: 0.145,
  upperArm: 0.30, foreArm: 0.27, hand: 0.10,
  thigh: 0.46, shin: 0.42, foot: 0.18,
  shoulder: 0.20, hip: 0.12,
};

export function buildFigure(THREE, opts = {}) {
  const skinColor = opts.skin ?? 0xd7a983;
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.62, metalness: 0.02 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x1f2733, roughness: 0.8 });

  const joints = {};
  const muscleMeshes = {};   // group name -> [mesh, …]
  const root = new THREE.Group();

  const capsule = (len, radius, dir = -1, mat = skin) => {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 6, 12);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = dir * len / 2;
    m.castShadow = true;
    return m;
  };
  // A muscle belly: a sphere scaled into an oval, tagged with its group so it
  // can be highlighted. Untagged (group null) bellies are plain structure.
  const belly = (group, radius, scale, pos, mat = skin) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 12), mat);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    if (group) {
      m.userData.muscle = group;
      (muscleMeshes[group] ||= []).push(m);
    }
    return m;
  };
  const pivot = (name, parent, pos) => {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    joints[name] = g;
    return g;
  };

  // --- pelvis / torso / head ---
  const pelvis = pivot('pelvis', root, [0, 0, 0]);
  pelvis.add(belly(null, 0.15, [1.25, 0.7, 0.85], [0, 0, 0], shorts));       // hips / shorts
  pelvis.add(belly('glutes', 0.10, [1.1, 0.9, 0.9], [0.06, -0.03, -0.09]));  // glute L
  pelvis.add(belly('glutes', 0.10, [1.1, 0.9, 0.9], [-0.06, -0.03, -0.09])); // glute R

  const spine = pivot('spine', pelvis, [0, 0, 0]);
  spine.add(capsule(L.spine, 0.12, 1));                                       // core column (structure)
  spine.add(belly('abs', 0.14, [1.1, 1.35, 0.72], [0, 0.16, 0.04]));         // abs
  spine.add(belly('abs', 0.10, [1.05, 0.9, 0.6], [0, 0.02, 0.12]));          // lower ab ridge
  spine.add(belly(null, 0.17, [1.55, 1.15, 0.72], [0, 0.42, 0.0]));          // upper torso mass
  spine.add(belly('chest', 0.092, [1.05, 0.85, 0.72], [0.088, 0.44, 0.12])); // left pec
  spine.add(belly('chest', 0.092, [1.05, 0.85, 0.72], [-0.088, 0.44, 0.12]));// right pec
  spine.add(belly('lats', 0.10, [0.8, 1.5, 0.9], [0.15, 0.30, -0.02]));      // lat L
  spine.add(belly('lats', 0.10, [0.8, 1.5, 0.9], [-0.15, 0.30, -0.02]));     // lat R

  const chest = pivot('chest', spine, [0, L.spine, 0]);
  chest.add(belly('traps', 0.10, [1.5, 0.7, 0.95], [0, 0.0, -0.02]));        // traps / yoke
  const neck = pivot('neck', chest, [0, 0.05, 0]);
  neck.add(capsule(L.neck + 0.05, 0.055, 1));
  const head = pivot('head', neck, [0, L.neck, 0]);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(L.head, 18, 16), skin);
  headMesh.scale.set(0.92, 1.05, 0.95);
  headMesh.position.y = L.head * 0.72;
  headMesh.castShadow = true;
  head.add(headMesh);

  // --- arms ---
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = pivot(`shoulder${side}`, chest, [sx * L.shoulder, 0.02, 0]);
    sh.add(belly('shoulders', 0.10, [1.1, 1.15, 1.1], [0, 0.02, 0]));        // deltoid
    sh.add(capsule(L.upperArm, 0.055, -1));                                  // upper arm (structure)
    sh.add(belly('biceps', 0.072, [1, 1.3, 1], [0, -0.13, 0.03]));          // bicep
    sh.add(belly('triceps', 0.062, [1, 1.25, 1], [0, -0.15, -0.035]));      // tricep
    const el = pivot(`elbow${side}`, sh, [0, -L.upperArm, 0]);
    el.add(capsule(L.foreArm, 0.048, -1));                                   // forearm (structure)
    el.add(belly('forearms', 0.058, [1, 1.2, 1], [0, -0.07, 0.01]));        // forearm belly
    const wr = pivot(`wrist${side}`, el, [0, -L.foreArm, 0]);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, L.hand, 0.11), skin);
    hand.position.y = -L.hand / 2; hand.castShadow = true;
    wr.add(hand);
  }

  // --- legs ---
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const hp = pivot(`hip${side}`, pelvis, [sx * L.hip, -0.04, 0]);
    hp.add(capsule(L.thigh, 0.095, -1));                                     // thigh (structure)
    hp.add(belly('quads', 0.11, [1.05, 1.4, 1.0], [0, -0.16, 0.03]));        // quad
    hp.add(belly('hamstrings', 0.10, [1.0, 1.35, 0.95], [0, -0.18, -0.05])); // hamstring
    hp.add(belly(null, 0.11, [1.1, 1.1, 1], [0, -0.03, 0], shorts));         // short leg
    const kn = pivot(`knee${side}`, hp, [0, -L.thigh, 0]);
    kn.add(capsule(L.shin, 0.065, -1));                                      // shin (structure)
    kn.add(belly('calves', 0.078, [1, 1.35, 1.05], [0, -0.13, -0.03]));      // calf
    const an = pivot(`ankle${side}`, kn, [0, -L.shin, 0]);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, L.foot), skin);
    foot.position.set(0, -0.02, L.foot * 0.32); foot.castShadow = true;
    an.add(foot);
  }

  root.position.y = L.thigh + L.shin;

  const primaryMat = new THREE.MeshStandardMaterial({ color: 0xef3b2f, roughness: 0.5, emissive: 0x5c0f0a, emissiveIntensity: 0.6 });
  const secondaryMat = new THREE.MeshStandardMaterial({ color: 0xf6a24b, roughness: 0.55, emissive: 0x3a1e04, emissiveIntensity: 0.4 });

  /** Light up the worked muscles; everything else returns to skin. */
  function setActiveMuscles({ primary = [], secondary = [] } = {}) {
    const prim = new Set(primary);
    const sec = new Set(secondary);
    for (const [group, meshes] of Object.entries(muscleMeshes)) {
      const mat = prim.has(group) ? primaryMat : sec.has(group) ? secondaryMat : skin;
      for (const m of meshes) m.material = mat;
    }
  }

  return { root, joints, lengths: L, muscleMeshes, setActiveMuscles,
    materials: { skin, shorts, primaryMat, secondaryMat } };
}

/** Ease every joint toward a target pose. `amount` 0..1 is this frame's blend. */
export function applyPose(figure, pose, amount = 1) {
  const { joints, root } = figure;
  const lerp = (obj, target) => {
    const t = target || [0, 0, 0];
    obj.rotation.x += (t[0] * DEG - obj.rotation.x) * amount;
    obj.rotation.y += (t[1] * DEG - obj.rotation.y) * amount;
    obj.rotation.z += (t[2] * DEG - obj.rotation.z) * amount;
  };
  for (const name of Object.keys(joints)) lerp(joints[name], pose[name]);

  const r = pose.root || {};
  const rot = r.rot || [0, 0, 0];
  root.rotation.x += (rot[0] * DEG - root.rotation.x) * amount;
  root.rotation.y += (rot[1] * DEG - root.rotation.y) * amount;
  root.rotation.z += (rot[2] * DEG - root.rotation.z) * amount;
  const pos = r.pos || [0, root.position.y, 0];
  root.position.x += (pos[0] - root.position.x) * amount;
  root.position.y += (pos[1] - root.position.y) * amount;
  root.position.z += (pos[2] - root.position.z) * amount;
}
