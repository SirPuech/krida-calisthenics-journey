/**
 * A low-poly humanoid rig for the exercise animations.
 *
 * The figure is a hierarchy of joint groups; each limb segment is a capsule
 * hanging along -Y from its joint pivot, so rotating a joint swings the segment
 * below it. A "pose" is a map of joint name -> [x, y, z] Euler degrees, plus a
 * root transform, and `applyPose` interpolates the whole body toward it.
 *
 * No Three.js import here — the caller passes THREE in, so this stays a pure
 * builder the animator can drive.
 */
const DEG = Math.PI / 180;

// Segment lengths, roughly human proportion in figure units.
const L = {
  spine: 0.52, neck: 0.10, head: 0.14,
  upperArm: 0.30, foreArm: 0.27, hand: 0.09,
  thigh: 0.44, shin: 0.42, foot: 0.17,
  shoulder: 0.19, hip: 0.11,
};

export function buildFigure(THREE, color = 0xf8fafc, accent = 0xf97316) {
  const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const joint = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4 });

  const joints = {};
  const root = new THREE.Group();

  // A capsule of `len` from a pivot group, hanging down -Y by default (limbs)
  // or reaching up +Y (dir = 1) for the spine.
  const segment = (len, radius, dir = -1) => {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8);
    const mesh = new THREE.Mesh(geo, skin);
    mesh.position.y = dir * len / 2;
    mesh.castShadow = true;
    return mesh;
  };

  const knob = (radius) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), joint);
    m.castShadow = true;
    return m;
  };

  // pivot group registered under `name`, positioned at `pos` inside `parent`.
  const pivot = (name, parent, pos) => {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    joints[name] = g;
    return g;
  };

  // --- pelvis / spine / head ---
  const pelvis = pivot('pelvis', root, [0, 0, 0]);
  pelvis.add(knob(0.11));
  const spine = pivot('spine', pelvis, [0, 0, 0]);
  spine.add(segment(L.spine, 0.10, 1));   // reaches up to the chest
  const chest = pivot('chest', spine, [0, L.spine, 0]);
  chest.add(knob(0.12));
  const neck = pivot('neck', chest, [0, 0.04, 0]);
  const head = pivot('head', neck, [0, L.neck, 0]);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(L.head, 14, 12), skin);
  headMesh.position.y = L.head * 0.7;
  headMesh.castShadow = true;
  head.add(headMesh);

  // --- arms --- (side: -X is right, +X is left)
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const sh = pivot(`shoulder${side}`, chest, [sx * L.shoulder, 0.02, 0]);
    sh.add(knob(0.07));
    sh.add(segment(L.upperArm, 0.06));
    const el = pivot(`elbow${side}`, sh, [0, -L.upperArm, 0]);
    el.add(segment(L.foreArm, 0.05));
    const wr = pivot(`wrist${side}`, el, [0, -L.foreArm, 0]);
    wr.add(segment(L.hand, 0.045));
  }

  // --- legs ---
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const hp = pivot(`hip${side}`, pelvis, [sx * L.hip, -0.02, 0]);
    hp.add(knob(0.08));
    hp.add(segment(L.thigh, 0.08));
    const kn = pivot(`knee${side}`, hp, [0, -L.thigh, 0]);
    kn.add(segment(L.shin, 0.06));
    const an = pivot(`ankle${side}`, kn, [0, -L.shin, 0]);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, L.foot), skin);
    foot.position.set(0, -0.02, L.foot * 0.35);
    foot.castShadow = true;
    an.add(foot);
  }

  // Lift the whole rig so the pelvis sits at a natural height by default.
  root.position.y = L.thigh + L.shin;

  return { root, joints, lengths: L, materials: { skin, joint } };
}

/** Ease toward a target pose. `amount` 0..1 is the blend for this frame. */
export function applyPose(figure, pose, amount = 1) {
  const { joints, root } = figure;

  const lerpEuler = (obj, target) => {
    if (!target) target = [0, 0, 0];
    obj.rotation.x += (target[0] * DEG - obj.rotation.x) * amount;
    obj.rotation.y += (target[1] * DEG - obj.rotation.y) * amount;
    obj.rotation.z += (target[2] * DEG - obj.rotation.z) * amount;
  };

  for (const name of Object.keys(joints)) {
    lerpEuler(joints[name], pose[name]);
  }

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
