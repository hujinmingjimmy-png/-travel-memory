import * as THREE from 'three'
import type { JourneyPose } from './JourneyPlaybackController'

/** The journey pose is a road-deck surface point. The mesh origin is NOT its tyre contact. */
export class VehicleController {
  private readonly wheelBottomOffset: number
  private initialized = false
  private lastRouteDistance = 0

  constructor(private readonly vehicle: THREE.Object3D) {
    // The procedural car has wheel centres y=.30, radius=.24 and group scale=.55.
    // Wheel-ground point must match route-deck y, not the car's visual centre.
    this.wheelBottomOffset = (0.30 - 0.24) * vehicle.scale.y
  }

  update(pose: JourneyPose, deltaSeconds = 1 / 60) {
    const jumped = !this.initialized || Math.abs(pose.distance - this.lastRouteDistance) > 4.5
    this.lastRouteDistance = pose.distance
    this.vehicle.position.copy(pose.position)
    this.vehicle.position.y -= this.wheelBottomOffset
    // Small clearance avoids tyre/deck z-fighting without creating visible hover.
    this.vehicle.position.y += 0.008
    const flat = pose.tangent.clone()
    flat.y = 0
    if (flat.lengthSq() > 1e-6) {
      flat.normalize()
      const targetYaw = Math.atan2(flat.x, flat.z)
      const oldYaw = this.vehicle.rotation.y
      const shortestTurn = THREE.MathUtils.euclideanModulo(targetYaw - oldYaw + Math.PI, Math.PI * 2) - Math.PI
      const alpha = jumped ? 1 : 1 - Math.exp(-Math.max(0, Math.min(deltaSeconds, .12)) * 9)
      this.vehicle.rotation.set(0, oldYaw + shortestTurn * alpha, 0)
      this.initialized = true
    }
  }
}
