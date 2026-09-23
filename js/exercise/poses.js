/**
 * Per-archetype animation data: how the figure is oriented, what apparatus is
 * drawn, where the camera sits, and the joint poses it moves through.
 *
 * Angles are Euler degrees. A `reps` archetype ping-pongs through `frames`; a
 * `hold` archetype eases into `hold` and adds a slow breathing sway. Joints not
 * named default to the neutral standing rig (arms down, legs down, upright).
 *
 * Values were tuned against the rig in figure.js; the debug harness at
 * exercise-lab.html renders any archetype full-screen for adjusting them.
 */

// Symmetric helper: mirror L/R joints so a pose reads for both sides.
function sym(base, arms, legs) {
  const p = { ...base };
  if (arms) {
    p.shoulderL = arms.shoulder; p.shoulderR = mirrorZ(arms.shoulder);
    if (arms.elbow) { p.elbowL = arms.elbow; p.elbowR = mirrorZ(arms.elbow); }
    if (arms.wrist) { p.wristL = arms.wrist; p.wristR = mirrorZ(arms.wrist); }
  }
  if (legs) {
    p.hipL = legs.hip; p.hipR = mirrorZ(legs.hip);
    if (legs.knee) { p.kneeL = legs.knee; p.kneeR = mirrorZ(legs.knee); }
    if (legs.ankle) { p.ankleL = legs.ankle; p.ankleR = mirrorZ(legs.ankle); }
  }
  return p;
}
// Mirroring across the sagittal plane flips Y and Z spin, keeps forward/back (X).
function mirrorZ(a) { return [a[0], -a[1], -a[2]]; }

const STAND_Y = 0.86;

export const POSES = {
  squat: {
    apparatus: 'floor', view: 'side', motion: 'reps',
    camera: { eye: [3.3, 0.7, 0.6], look: [0, 0.5, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, STAND_Y, 0] }, spine: [8, 0, 0] },
        { shoulder: [-75, 0, 0], elbow: [-10, 0, 0] }, { hip: [0, 0, 0], knee: [0, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.5, 0] }, spine: [26, 0, 0] },
        { shoulder: [-95, 0, 0], elbow: [-15, 0, 0] }, { hip: [-105, 0, 0], knee: [118, 0, 0] }) },
    ],
  },

  pistol: {
    apparatus: 'floor', view: 'side', motion: 'reps',
    camera: { eye: [3.3, 0.7, 0.6], look: [0, 0.5, 0] },
    frames: [
      { t: 0, pose: { root: { pos: [0, STAND_Y, 0] }, spine: [6, 0, 0],
        shoulderL: [-80, 0, 0], shoulderR: [-80, 0, 0], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
        hipL: [-14, 0, 0], kneeL: [8, 0, 0], hipR: [-40, 0, 0], kneeR: [10, 0, 0] } },
      { t: 1, pose: { root: { pos: [0, 0.42, 0] }, spine: [30, 0, 0],
        shoulderL: [-95, 0, 0], shoulderR: [-95, 0, 0], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0],
        hipL: [-125, 0, 0], kneeL: [135, 0, 0], hipR: [-96, 0, 0], kneeR: [4, 0, 0] } },
    ],
  },

  nordic: {
    apparatus: 'floor', view: 'side', motion: 'reps',
    camera: { eye: [3.4, 0.6, 0.4], look: [0, 0.4, 0.2] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.46, 0], rot: [0, 0, 0] }, spine: [0, 0, 0] },
        { shoulder: [-70, 0, 0], elbow: [-20, 0, 0] }, { hip: [-95, 0, 0], knee: [92, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.42, 0.32], rot: [46, 0, 0] }, spine: [0, 0, 0] },
        { shoulder: [-120, 0, 0], elbow: [-30, 0, 0] }, { hip: [-95, 0, 0], knee: [92, 0, 0] }) },
    ],
  },

  legext: {
    apparatus: 'floor', view: 'side', motion: 'reps',
    camera: { eye: [3.4, 0.6, 0.4], look: [0, 0.4, -0.1] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.5, 0], rot: [0, 0, 0] } },
        { shoulder: [10, 0, 0], elbow: [-4, 0, 0] }, { hip: [-95, 0, 0], knee: [92, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.5, -0.2], rot: [-34, 0, 0] } },
        { shoulder: [10, 0, 0], elbow: [-4, 0, 0] }, { hip: [-95, 0, 0], knee: [92, 0, 0] }) },
    ],
  },

  pushup: {
    apparatus: 'floor', view: 'side', motion: 'reps',
    camera: { eye: [3.4, 0.9, 0.3], look: [0, 0.15, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.42, 0], rot: [90, 0, 0] } },
        { shoulder: [-92, 0, 4], elbow: [0, 0, 0] }, { hip: [4, 0, 0], knee: [0, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.26, 0], rot: [90, 0, 0] } },
        { shoulder: [-70, 0, 20], elbow: [-84, 0, 0] }, { hip: [4, 0, 0], knee: [0, 0, 0] }) },
    ],
  },

  pseudo: {
    apparatus: 'parallettes', view: 'side', motion: 'hold',
    camera: { eye: [3.4, 0.9, 0.4], look: [0, 0.35, 0] },
    hold: sym({ root: { pos: [0, 0.5, 0], rot: [66, 0, 0] } },
      { shoulder: [-96, 0, 8], elbow: [0, 0, 0] }, { hip: [6, 0, 0], knee: [0, 0, 0] }),
    sway: { spine: [3, 0, 0] },
  },

  planche: {
    apparatus: 'parallettes', view: 'side', motion: 'hold',
    camera: { eye: [3.4, 0.7, 0.5], look: [0, 0.5, 0] },
    hold: sym({ root: { pos: [0, 0.62, 0], rot: [90, 0, 0] } },
      { shoulder: [-108, 0, 10], elbow: [0, 0, 0] }, { hip: [2, 0, 0], knee: [0, 0, 0] }),
    sway: { root: { pos: [0, 0.62, 0], rot: [88, 0, 0] } },
  },

  dip: {
    apparatus: 'parallettes', view: 'side', motion: 'reps',
    camera: { eye: [3.2, 0.9, 0.8], look: [0, 0.6, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 1.0, 0] }, spine: [10, 0, 0] },
        { shoulder: [6, 0, 6], elbow: [-6, 0, 0] }, { hip: [-18, 0, 0], knee: [24, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.74, 0] }, spine: [14, 0, 0] },
        { shoulder: [42, 0, 8], elbow: [-96, 0, 0] }, { hip: [-18, 0, 0], knee: [24, 0, 0] }) },
    ],
  },

  pullup: {
    apparatus: 'bar', view: 'front', motion: 'reps',
    camera: { eye: [0.4, 1.0, 3.6], look: [0, 1.1, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.86, 0] } },
        { shoulder: [4, 0, 168], elbow: [0, 0, 0] }, { hip: [-8, 0, 0], knee: [16, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 1.16, 0] } },
        { shoulder: [4, 0, 132], elbow: [0, 0, 92] }, { hip: [-8, 0, 0], knee: [16, 0, 0] }) },
    ],
  },

  muscleup: {
    apparatus: 'bar', view: 'front', motion: 'reps',
    camera: { eye: [0.5, 1.0, 3.8], look: [0, 0.95, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.82, 0] } },
        { shoulder: [4, 0, 170], elbow: [0, 0, 0] }, { hip: [-6, 0, 0], knee: [14, 0, 0] }) },
      { t: 0.6, pose: sym({ root: { pos: [0, 1.2, 0] } },
        { shoulder: [4, 0, 120], elbow: [0, 0, 110] }, { hip: [-10, 0, 0], knee: [20, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 1.34, 0] }, spine: [6, 0, 0] },
        { shoulder: [30, 0, 8], elbow: [-10, 0, 0] }, { hip: [-6, 0, 0], knee: [10, 0, 0] }) },
    ],
  },

  lever: {
    apparatus: 'bar', view: 'side', motion: 'hold',
    apparatusOpts: { barY: 1.2 },
    camera: { eye: [3.6, 1.0, 0.5], look: [0, 1.0, 0] },
    // Body horizontal just under the bar; straight arms angle up to the grip.
    hold: sym({ root: { pos: [0, 0.95, 0.0], rot: [-90, 0, 0] } },
      { shoulder: [-32, 0, 176], elbow: [0, 0, 0] }, { hip: [0, 0, 0], knee: [4, 0, 0] }),
    sway: { root: { pos: [0, 0.96, 0.0], rot: [-88, 0, 0] } },
  },

  handstand: {
    apparatus: 'floor', view: 'front', motion: 'hold',
    camera: { eye: [0.4, 0.9, 3.8], look: [0, 0.9, 0] },
    hold: sym({ root: { pos: [0, 0.16, 0], rot: [180, 0, 0] } },
      { shoulder: [6, 0, 176], elbow: [0, 0, 0] }, { hip: [0, 0, 0], knee: [0, 0, 0] }),
    sway: { spine: [0, 0, 2] },
  },

  hspu: {
    apparatus: 'wall', view: 'front', motion: 'reps',
    camera: { eye: [0.5, 0.9, 3.8], look: [0, 0.9, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.16, 0], rot: [180, 0, 0] } },
        { shoulder: [6, 0, 176], elbow: [0, 0, 0] }, { hip: [0, 0, 0], knee: [0, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.42, 0], rot: [180, 0, 0] } },
        { shoulder: [6, 0, 140], elbow: [0, 0, 96] }, { hip: [0, 0, 0], knee: [0, 0, 0] }) },
    ],
  },

  lsit: {
    apparatus: 'parallettes', view: 'side', motion: 'hold',
    camera: { eye: [3.2, 0.9, 0.8], look: [0, 0.7, 0.15] },
    hold: sym({ root: { pos: [0, 0.92, 0] } },
      { shoulder: [8, 0, 4], elbow: [-4, 0, 0] }, { hip: [-92, 0, 0], knee: [4, 0, 0] }),
    sway: { spine: [2, 0, 0] },
  },

  dragonflag: {
    apparatus: 'bench', view: 'side', motion: 'reps',
    camera: { eye: [3.6, 0.8, 0.4], look: [0, 0.7, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.72, 0.15], rot: [-58, 0, 0] } },
        { shoulder: [150, 0, 0], elbow: [-40, 0, 0] }, { hip: [4, 0, 0], knee: [0, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.7, 0.2], rot: [-88, 0, 0] } },
        { shoulder: [150, 0, 0], elbow: [-40, 0, 0] }, { hip: [4, 0, 0], knee: [0, 0, 0] }) },
    ],
  },

  plank: {
    apparatus: 'floor', view: 'side', motion: 'hold',
    camera: { eye: [3.4, 0.8, 0.3], look: [0, 0.12, 0] },
    hold: sym({ root: { pos: [0, 0.34, 0], rot: [90, 0, 0] } },
      { shoulder: [-70, 0, 6], elbow: [-96, 0, 0] }, { hip: [3, 0, 0], knee: [0, 0, 0] }),
    sway: { root: { pos: [0, 0.345, 0], rot: [90, 0, 0] } },
  },

  rings_support: {
    apparatus: 'rings', view: 'front', motion: 'hold',
    camera: { eye: [0.5, 1.0, 3.6], look: [0, 0.95, 0] },
    hold: sym({ root: { pos: [0, 0.9, 0] } },
      { shoulder: [4, 0, 10], elbow: [-4, 0, 0] }, { hip: [-8, 0, 0], knee: [12, 0, 0] }),
    sway: { root: { pos: [0.02, 0.9, 0] } },
  },

  rings_dip: {
    apparatus: 'rings', view: 'front', motion: 'reps',
    camera: { eye: [0.6, 1.0, 3.6], look: [0, 0.85, 0] },
    frames: [
      { t: 0, pose: sym({ root: { pos: [0, 0.98, 0] } },
        { shoulder: [4, 0, 10], elbow: [-4, 0, 0] }, { hip: [-10, 0, 0], knee: [14, 0, 0] }) },
      { t: 1, pose: sym({ root: { pos: [0, 0.72, 0] }, spine: [10, 0, 0] },
        { shoulder: [40, 0, 12], elbow: [-98, 0, 0] }, { hip: [-10, 0, 0], knee: [14, 0, 0] }) },
    ],
  },

  rings_cross: {
    apparatus: 'rings', view: 'front', motion: 'hold',
    camera: { eye: [0.4, 1.0, 3.9], look: [0, 0.95, 0] },
    apparatusOpts: { ringsY: 1.32 },
    hold: sym({ root: { pos: [0, 1.02, 0] } },
      { shoulder: [4, 0, 90], elbow: [0, 0, 0] }, { hip: [-4, 0, 0], knee: [8, 0, 0] }),
    sway: { root: { pos: [0, 1.015, 0] } },
  },
};

export function poseFor(archetype) {
  return POSES[archetype] || POSES.pushup;
}
