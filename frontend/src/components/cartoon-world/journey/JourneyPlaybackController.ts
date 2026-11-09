import * as THREE from 'three'

export type JourneyPlaybackStatus = 'IDLE' | 'PLAYING' | 'PAUSED' | 'FINISHED'
export type JourneyCameraMode = 'FREE' | 'FOLLOW' | 'OVERVIEW'

export interface JourneyPlaybackSnapshot {
  ready: boolean
  status: JourneyPlaybackStatus
  progress: number
  currentStopIndex: number
  nextStopIndex: number
  totalStops: number
  cameraMode: JourneyCameraMode
  routeMode: 'ROAD' | 'MIXED' | 'DIRECT'
  roadCoverage: number
  speedMultiplier: number
}

export interface JourneyPose {
  position: THREE.Vector3
  tangent: THREE.Vector3
  distance: number
  progress: number
}

export class JourneyPlaybackController {
  readonly points: THREE.Vector3[]
  readonly cumulative: number[]
  readonly stopDistances: number[]
  readonly totalLength: number
  private distance = 0
  private status: JourneyPlaybackStatus = 'IDLE'
  private currentStopIndex = 0
  private nextStopIndex = 1
  private dwellRemaining = 0
  private cameraMode: JourneyCameraMode = 'FOLLOW'
  private readonly speed: number
  private speedMultiplier = 1
  private reportAccumulator = 0

  constructor(
    points: THREE.Vector3[],
    stopPointIndices: number[],
    readonly routeMode: 'ROAD' | 'MIXED' | 'DIRECT',
    readonly roadCoverage: number,
    private readonly onChange?: (snapshot: JourneyPlaybackSnapshot) => void,
    private readonly onStop?: (stopIndex: number) => void
  ) {
    this.points = points.map(point => point.clone())
    this.cumulative = [0]
    for (let i = 1; i < this.points.length; i += 1) {
      this.cumulative.push(this.cumulative[i - 1]! + this.points[i]!.distanceTo(this.points[i - 1]!))
    }
    this.totalLength = this.cumulative[this.cumulative.length - 1] || 0
    this.stopDistances = stopPointIndices.map(index => this.cumulative[Math.min(Math.max(index, 0), this.cumulative.length - 1)] || 0)
    const targetDuration = THREE.MathUtils.clamp(Math.max(18, this.stopDistances.length * 7), 18, 76)
    this.speed = this.totalLength > 0 ? this.totalLength / targetDuration : 0
    this.emit()
  }

  snapshot(): JourneyPlaybackSnapshot {
    return {
      ready: this.points.length >= 2 && this.stopDistances.length >= 2,
      status: this.status,
      progress: this.totalLength > 0 ? THREE.MathUtils.clamp(this.distance / this.totalLength, 0, 1) : 0,
      currentStopIndex: this.currentStopIndex,
      nextStopIndex: Math.min(this.nextStopIndex, Math.max(0, this.stopDistances.length - 1)),
      totalStops: this.stopDistances.length,
      cameraMode: this.cameraMode,
      routeMode: this.routeMode,
      roadCoverage: this.roadCoverage,
      speedMultiplier: this.speedMultiplier
    }
  }

  setCameraMode(mode: JourneyCameraMode) {
    this.cameraMode = mode
    this.emit()
  }

  /** Playback speed is independent from keyboard / free-camera speed. */
  setSpeedMultiplier(value: number) {
    if (!Number.isFinite(value)) return
    this.speedMultiplier = THREE.MathUtils.clamp(value, 0.5, 2.5)
    this.emit()
  }

  getCameraMode() {
    return this.cameraMode
  }

  play() {
    if (!this.snapshot().ready) return
    if (this.status === 'FINISHED') this.restart(false)
    this.status = 'PLAYING'
    this.emit()
  }

  pause() {
    if (this.status !== 'PLAYING') return
    this.status = 'PAUSED'
    this.emit()
  }

  toggle() {
    if (this.status === 'PLAYING') this.pause()
    else this.play()
  }

  restart(autoPlay = true) {
    this.distance = 0
    this.currentStopIndex = 0
    this.nextStopIndex = Math.min(1, Math.max(0, this.stopDistances.length - 1))
    this.dwellRemaining = 0
    this.status = autoPlay ? 'PLAYING' : 'IDLE'
    this.onStop?.(0)
    this.emit()
  }

  seekStop(index: number, autoPlay = false) {
    if (!this.stopDistances.length) return
    const target = THREE.MathUtils.clamp(Math.round(index), 0, this.stopDistances.length - 1)
    this.distance = this.stopDistances[target]!
    this.currentStopIndex = target
    this.nextStopIndex = Math.min(target + 1, this.stopDistances.length - 1)
    this.dwellRemaining = 0
    this.status = target >= this.stopDistances.length - 1 ? 'FINISHED' : autoPlay ? 'PLAYING' : 'PAUSED'
    this.onStop?.(target)
    this.emit()
  }

  nextStop() {
    this.seekStop(Math.min(this.currentStopIndex + 1, this.stopDistances.length - 1), false)
  }

  previousStop() {
    this.seekStop(Math.max(this.currentStopIndex - 1, 0), false)
  }

  update(delta: number): JourneyPose {
    const step = Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.08) : 0
    if (this.status === 'PLAYING' && this.totalLength > 0) {
      if (this.dwellRemaining > 0) {
        this.dwellRemaining = Math.max(0, this.dwellRemaining - step)
      } else {
        this.distance = Math.min(this.totalLength, this.distance + this.speed * this.speedMultiplier * step)
        if (this.nextStopIndex < this.stopDistances.length && this.distance >= this.stopDistances[this.nextStopIndex]! - 0.001) {
          this.distance = this.stopDistances[this.nextStopIndex]!
          this.currentStopIndex = this.nextStopIndex
          this.nextStopIndex += 1
          this.dwellRemaining = this.currentStopIndex < this.stopDistances.length - 1 ? 1.75 : 0
          this.onStop?.(this.currentStopIndex)
          if (this.currentStopIndex >= this.stopDistances.length - 1) this.status = 'FINISHED'
          this.emit()
        }
      }
    }
    // Progress was previously reported only at stops, so the HUD stayed frozen
    // while the car moved. Publish 8-12 Hz updates without triggering 60fps Vue renders.
    if (this.status === 'PLAYING') {
      this.reportAccumulator += step
      if (this.reportAccumulator >= 0.10) {
        this.reportAccumulator = 0
        this.emit()
      }
    } else this.reportAccumulator = 0
    return this.sample(this.distance)
  }

  sample(distance: number): JourneyPose {
    if (!this.points.length) return { position: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, -1), distance: 0, progress: 0 }
    if (this.points.length === 1 || this.totalLength <= 0) return { position: this.points[0]!.clone(), tangent: new THREE.Vector3(0, 0, -1), distance: 0, progress: 0 }
    const d = THREE.MathUtils.clamp(distance, 0, this.totalLength)
    // Binary search rather than walking every vertex for every rendered frame.
    let lo = 1, hi = this.cumulative.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.cumulative[mid]! < d) lo = mid + 1
      else hi = mid
    }
    const index = lo
    const a = this.points[index - 1]!
    const b = this.points[index]!
    const start = this.cumulative[index - 1]!
    const end = this.cumulative[index]!
    const t = end > start ? (d - start) / (end - start) : 0
    const position = a.clone().lerp(b, t)
    const tangent = b.clone().sub(a).normalize()
    return { position, tangent, distance: d, progress: this.totalLength > 0 ? d / this.totalLength : 0 }
  }

  private emit() {
    this.onChange?.(this.snapshot())
  }
}
