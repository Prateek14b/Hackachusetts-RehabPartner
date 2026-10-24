// Exercise motions for the stick figure. Each exercise is driven by one clinical angle (the
// same angle MediaPipe will measure later); `pose(rom)` returns the figure at that angle.
// Squat only for now — more exercises (and a DB table) come in the next step.

export interface Point {
  x: number
  y: number // world units, y up, ground at 0
}

export interface Skeleton {
  head: Point
  shoulder: Point
  elbow: Point
  wrist: Point
  hip: Point
  knee: Point
  ankle: Point
  heel: Point
  toe: Point
}

export interface ExerciseMotion {
  id: string
  name: string
  metric: string // what the slider controls, e.g. "Knee bend"
  hint: string // plain-language meaning, e.g. "How low the hips go"
  fullRom: number // degrees at full range of motion
  minRom: number
  pose: (rom: number) => Skeleton
}

// Segment lengths (world units)
const SHIN = 45
const THIGH = 45
const TORSO = 55
const UPPER_ARM = 25
const FOREARM = 25
export const HEAD_RADIUS = 9
const NECK = 8

// Unit vector for a direction measured in degrees from straight up, positive = toward the front (+x)
function dir(deg: number): Point {
  const r = (deg * Math.PI) / 180
  return { x: Math.sin(r), y: Math.cos(r) }
}

function step(from: Point, length: number, deg: number): Point {
  const d = dir(deg)
  return { x: from.x + d.x * length, y: from.y + d.y * length }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Side view, facing right, feet planted. `kneeInterior`/`hipInterior` are the joint angles
// (180 = straight), matching the hip-knee-ankle / shoulder-hip-knee angles from MediaPipe.
function buildLegsUp(shinTilt: number, kneeInterior: number, hipInterior: number, armDeg: number): Skeleton {
  const ankle = { x: 0, y: 6 }
  const knee = step(ankle, SHIN, shinTilt)
  const thighDeg = shinTilt - 180 + kneeInterior
  const hip = step(knee, THIGH, thighDeg)
  const torsoDeg = thighDeg + 180 - hipInterior
  const shoulder = step(hip, TORSO, torsoDeg)
  const head = step(shoulder, NECK + HEAD_RADIUS, torsoDeg)
  const elbow = step(shoulder, UPPER_ARM, armDeg)
  const wrist = step(elbow, FOREARM, armDeg)
  return { head, shoulder, elbow, wrist, hip, knee, ankle, heel: { x: -6, y: 0 }, toe: { x: 22, y: 0 } }
}

// rom = knee flexion in degrees (0 = standing straight, 120 = deep squat).
// Shin, hip and arms move in proportion so the figure stays balanced over the feet.
function squatPose(rom: number): Skeleton {
  const t = rom / 120
  return buildLegsUp(
    lerp(0, 35, t), // shin tilts forward
    180 - rom, // knee interior angle
    lerp(180, 65, t), // hips hinge
    lerp(180, 90, t), // arms reach forward for balance
  )
}

export const SQUAT: ExerciseMotion = {
  id: 'squat',
  name: 'Squat',
  metric: 'Knee bend',
  hint: 'How low the hips go',
  fullRom: 120,
  minRom: 10,
  pose: squatPose,
}

export const EXERCISES: ExerciseMotion[] = [SQUAT]
