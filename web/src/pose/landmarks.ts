// MediaPipe Pose Landmarker's 33 landmark names; array position = index in MediaPipe's
// landmarks / worldLandmarks arrays. Shared with the API via shared/poseLandmarks.json.
import data from '../../../shared/poseLandmarks.json'

export const POSE_LANDMARKS: readonly string[] = data.landmarks

export function landmarkIndex(name: string): number {
  const i = POSE_LANDMARKS.indexOf(name)
  if (i < 0) throw new Error(`Unknown MediaPipe landmark: ${name}`)
  return i
}
