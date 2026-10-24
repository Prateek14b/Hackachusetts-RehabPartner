// Exercise motions for the stick figure. Metadata (names, ROM limits, which MediaPipe landmarks
// measure the angle) comes from shared/exerciseLibrary.json, the same file the API seeds the DB
// from. Each exercise is driven by one clinical angle; `pose(rom)` returns the figure at that angle.
import libraryData from '../../../shared/exerciseLibrary.json'
import { landmarkIndex } from '../pose/landmarks'

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

export type Joint = keyof Skeleton
export type Side = 'left' | 'right'

export interface AnglePoints {
  names: [string, string, string] // MediaPipe names, e.g. LEFT_HIP, LEFT_KNEE, LEFT_ANKLE
  indices: [number, number, number] // positions in MediaPipe's landmark arrays
}

export interface Chair {
  seatY: number
  front: number
  back: number
}

export interface ExerciseMotion {
  id: string
  name: string
  metric: string // what the slider controls, e.g. "Knee bend"
  hint: string // plain-language meaning, e.g. "How low the hips go"
  fullRom: number // degrees at full range of motion
  minRom: number
  // value shown to the PT = angleOffset + angleSign * interior angle at the middle landmark
  angleOffset: number
  angleSign: number
  anglePoints: Record<Side, AnglePoints>
  pose: (rom: number) => Skeleton
  marker: Joint // body part whose target height is marked with a dashed line
  chair?: Chair
}

// Segment lengths (world units)
const SHIN = 45
const THIGH = 45
const TORSO = 55
const UPPER_ARM = 25
const FOREARM = 25
export const HEAD_RADIUS = 9
const NECK = 8
const FOOT = 22
const HEEL = 6

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

function upperBody(hip: Point, torsoDeg: number, armDeg: number) {
  const shoulder = step(hip, TORSO, torsoDeg)
  const head = step(shoulder, NECK + HEAD_RADIUS, torsoDeg)
  const elbow = step(shoulder, UPPER_ARM, armDeg)
  const wrist = step(elbow, FOREARM, armDeg)
  return { shoulder, head, elbow, wrist }
}

// Standing on the ground, side view facing right, feet planted. `kneeInterior`/`hipInterior` are the
// joint angles (180 = straight), the same hip-knee-ankle / shoulder-hip-knee angles MediaPipe gives.
function standing(shinTilt: number, kneeInterior: number, hipInterior: number, armDeg: number): Skeleton {
  const ankle = { x: 0, y: 6 }
  const knee = step(ankle, SHIN, shinTilt)
  const thighDeg = shinTilt - 180 + kneeInterior
  const hip = step(knee, THIGH, thighDeg)
  const torsoDeg = thighDeg + 180 - hipInterior
  return { ...upperBody(hip, torsoDeg, armDeg), hip, knee, ankle, heel: { x: -HEEL, y: 0 }, toe: { x: FOOT, y: 0 } }
}

// Sitting with the hip fixed and the thigh level; the lower leg swings from the knee.
const SEATED_HIP = { x: -20, y: 50 }
function seated(kneeInterior: number): Skeleton {
  const hip = SEATED_HIP
  const knee = step(hip, THIGH, 90)
  const shinDeg = 270 - kneeInterior // 90° → hanging straight down, 180° → straight out in front
  const ankle = step(knee, SHIN, shinDeg)
  const footDeg = shinDeg - 90
  return {
    ...upperBody(hip, 0, 180),
    hip,
    knee,
    ankle,
    heel: step(ankle, -HEEL, footDeg),
    toe: step(ankle, FOOT, footDeg),
  }
}

// rom = knee bend (0 = standing straight). Shin, hips and arms move together so the figure
// stays balanced over the feet.
function squat(rom: number): Skeleton {
  const t = rom / 120
  return standing(lerp(0, 35, t), 180 - rom, lerp(180, 65, t), lerp(180, 90, t))
}

// rom = hip bend with straight knees (140 = hands reach the floor); hips shift back for balance
// and the arms hang toward the toes
function toeTouch(rom: number): Skeleton {
  const t = rom / 140
  return standing(lerp(0, -12, t), 180, 180 - rom, lerp(180, 195, t))
}

// rom = arm raised forward from the side (0 = arm down, 180 = straight overhead)
function shoulderRaise(rom: number): Skeleton {
  return standing(0, 180, 180, 180 - rom)
}

// rom = how far the knees straighten from seated (0 = sitting, 90 = standing). The torso leans
// forward mid-rise, as people do when getting up from a chair.
function chairStand(rom: number): Skeleton {
  const t = rom / 90
  return standing(lerp(10, 0, t), 90 + rom, lerp(90, 180, t) - 40 * Math.sin(Math.PI * t), lerp(100, 180, t))
}

// rom = how far the knee straightens from hanging (0 = foot down, 90 = leg straight out)
function kneeExtension(rom: number): Skeleton {
  return seated(90 + rom)
}

function chairUnder(s: Skeleton): Chair {
  return { seatY: s.hip.y - 4, front: s.hip.x + 14, back: s.hip.x - 22 }
}

const MOTIONS: Record<string, Pick<ExerciseMotion, 'pose' | 'marker' | 'chair'>> = {
  squat: { pose: squat, marker: 'hip' },
  toe_touch: { pose: toeTouch, marker: 'wrist' },
  shoulder_raise: { pose: shoulderRaise, marker: 'wrist' },
  chair_stand: { pose: chairStand, marker: 'hip', chair: chairUnder(chairStand(0)) },
  seated_knee_extension: { pose: kneeExtension, marker: 'ankle', chair: chairUnder(kneeExtension(0)) },
}

function toAnglePoints(names: string[]): AnglePoints {
  const [a, v, c] = names
  return { names: [a, v, c], indices: [landmarkIndex(a), landmarkIndex(v), landmarkIndex(c)] }
}

export const EXERCISES: ExerciseMotion[] = libraryData.exercises.map((ex) => {
  const motion = MOTIONS[ex.id]
  if (!motion) throw new Error(`No stick-figure motion defined for exercise "${ex.id}"`)
  return {
    id: ex.id,
    name: ex.name,
    metric: ex.metric,
    hint: ex.hint,
    fullRom: ex.fullRom,
    minRom: ex.minRom,
    angleOffset: ex.angleOffset,
    angleSign: ex.angleSign,
    anglePoints: { left: toAnglePoints(ex.anglePoints.left), right: toAnglePoints(ex.anglePoints.right) },
    ...motion,
  }
})

// MediaPipe landmark name → the stick figure's joint, e.g. LEFT_KNEE → knee
export function figureJoint(landmarkName: string): Joint {
  return landmarkName.replace(/^(LEFT|RIGHT)_/, '').toLowerCase() as Joint
}

// Interior angle (0–180°) at b between b→a and b→c — the same math the webcam check will run on MediaPipe points
export function interiorAngle(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y }
  const v2 = { x: c.x - b.x, y: c.y - b.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y))
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

// Interior angle → the clinical value the PT sees (e.g. knee bend = 180 - interior)
export function clinicalAngle(exercise: ExerciseMotion, interior: number): number {
  return exercise.angleOffset + exercise.angleSign * interior
}
