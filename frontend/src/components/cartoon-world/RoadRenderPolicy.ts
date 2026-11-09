/** Low-frequency silhouettes take priority over thin, distant lines. */
import type { WorldQualityMode } from './quality'

export interface RoadRenderPolicy {
  readonly minimumShoulderWidth: number
  readonly maximumTriangleEdge: number
  readonly maximumVerticesPerArea: number
  readonly showWaterOutlines: boolean
  readonly routeTubeRadius: number
  readonly routeGlowRadius: number
}

/** World units; shoulders smaller than this threshold are not rendered separately. */
export function roadRenderPolicy(mode: WorldQualityMode): RoadRenderPolicy {
  switch (mode) {
    case 'LOCAL': return {
      minimumShoulderWidth: 0, maximumTriangleEdge: 1.65,
      maximumVerticesPerArea: 300_000, showWaterOutlines: true,
      routeTubeRadius: 0.14, routeGlowRadius: 0.23
    }
    case 'DISTRICT': return {
      minimumShoulderWidth: 1.18, maximumTriangleEdge: 2.35,
      maximumVerticesPerArea: 195_000, showWaterOutlines: false,
      routeTubeRadius: 0.15, routeGlowRadius: 0.24
    }
    case 'REGION': return {
      minimumShoulderWidth: Number.POSITIVE_INFINITY, maximumTriangleEdge: 3.2,
      maximumVerticesPerArea: 105_000, showWaterOutlines: false,
      routeTubeRadius: 0.17, routeGlowRadius: 0.25
    }
  }
}

/** Prevent accumulating camera target drift when switching to automated playback. */
export function cinematicDamping(deltaSeconds: number, responsiveness: number) {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds))
  return 1 - Math.exp(-dt * responsiveness)
}
