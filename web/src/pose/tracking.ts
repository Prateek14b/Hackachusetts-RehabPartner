// Turning MediaPipe pose landmarks into the PT's measurement and counting reps. Pure logic, no DOM.
import { clinicalAngle, type ExerciseMotion } from '../exercises/library'

export interface Landmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export type PlanSide = 'left' | 'right' | 'both'

export const MIN_VISIBILITY = 0.5

// Interior angle (0–180°) at b, in 3D — used with MediaPipe's worldLandmarks (meters, hip-centred)
export function angle3d(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z]
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z]
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]
  const len = Math.hypot(...v1) * Math.hypot(...v2)
  if (len === 0) return 0
  return (Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180) / Math.PI
}

export interface Measurement {
  value: number // in the exercise's clinical units, e.g. knee bend in degrees (0 = start position)
  side: 'left' | 'right'
  visibility: number
}

// The PT's angle for this exercise. For "both sides" exercises, use whichever side the camera sees better.
// Visibility comes from the image landmarks; the angle from the 3D world landmarks.
export function measure(
  exercise: ExerciseMotion,
  side: PlanSide,
  world: Landmark[],
  image: Landmark[],
): Measurement | null {
  const sides: ('left' | 'right')[] = side === 'both' ? ['left', 'right'] : [side]
  let best: Measurement | null = null
  for (const s of sides) {
    const [a, b, c] = exercise.anglePoints[s].indices
    if (!world[a] || !world[b] || !world[c]) continue
    const visibility = Math.min(...[a, b, c].map((i) => image[i]?.visibility ?? 0))
    if (best && best.visibility >= visibility) continue
    best = { value: clinicalAngle(exercise, angle3d(world[a], world[b], world[c])), side: s, visibility }
  }
  return best && best.visibility >= MIN_VISIBILITY ? best : null
}

// Landmark indices that must be visible for a whole-body view: shoulders, hips, knees, ankles
export const BODY_CHECK = [11, 12, 23, 24, 25, 26, 27, 28]

export function wholeBodyVisible(image: Landmark[] | undefined): boolean {
  return !!image && BODY_CHECK.every((i) => (image[i]?.visibility ?? 0) >= MIN_VISIBILITY)
}

// Exponential moving average to calm frame-to-frame jitter
export class Smoother {
  private current: number | null = null
  constructor(private alpha = 0.35) {}
  update(value: number): number {
    this.current = this.current === null ? value : this.alpha * value + (1 - this.alpha) * this.current
    return this.current
  }
  reset() {
    this.current = null
  }
}

export interface RepEvent {
  peak: number // furthest the patient got during this rep
  hitTarget: boolean
}

// Two-state rep counter with hysteresis, relative to the PT's target:
//   "home" (near the start position) → "away" (moved past AWAY of the target) → back home = 1 rep.
// The gap between HOME and AWAY means jitter around one threshold can't count extra reps.
export class RepCounter {
  static HOME = 0.3 // fraction of target
  static AWAY = 0.6
  static HIT = 0.9 // a rep "reaches the target" at 90% of it

  private state: 'unknown' | 'home' | 'away' = 'unknown'
  private repPeak = 0
  constructor(private target: number) {}

  get atStart() {
    return this.state === 'home'
  }

  get moving() {
    return this.state === 'away'
  }

  update(value: number): RepEvent | null {
    const home = this.target * RepCounter.HOME
    const away = this.target * RepCounter.AWAY
    if (this.state === 'unknown') {
      if (value <= home) this.state = 'home' // wait until the patient is in the start position
      return null
    }
    if (this.state === 'home') {
      if (value >= away) {
        this.state = 'away'
        this.repPeak = value
      }
      return null
    }
    this.repPeak = Math.max(this.repPeak, value)
    if (value <= home) {
      this.state = 'home'
      return { peak: this.repPeak, hitTarget: this.repPeak >= this.target * RepCounter.HIT }
    }
    return null
  }
}
