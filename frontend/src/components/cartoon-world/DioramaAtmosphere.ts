import * as THREE from 'three'
import type { WorldPalette } from './theme'

/**
 * The atmosphere belongs to one scene instance, not the global renderer.
 * Building it never queries OSM/DEM or modifies the terrain and road meshes.
 * Dispose it when WorldRenderer is destroyed to release the sprite texture,
 * GPU geometry and shader materials.
 */
export interface DioramaAtmosphere {
  readonly group: THREE.Group
  readonly cloudCount: number
  update(elapsedSeconds: number): void
  dispose(): void
}

type EnvironmentOptions = {
  width: number
  depth: number
  palette: WorldPalette
  night: boolean
  heightAt: (x: number, z: number) => number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** A soft elongated alpha mask; unlike low-poly balls, it contains no hard silhouettes. */
function createWispTexture(): THREE.DataTexture {
  const width = 128
  const height = 64
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const x = col / (width - 1) * 2 - 1
      const y = row / (height - 1) * 2 - 1
      const a = Math.exp(-3.0 * (((x + 0.23) / 0.68) ** 2 + ((y - 0.02) / 0.43) ** 2))
      const b = Math.exp(-3.8 * (((x - 0.25) / 0.61) ** 2 + ((y + 0.06) / 0.32) ** 2))
      const c = Math.exp(-5.1 * (((x + 0.02) / 0.81) ** 2 + ((y + 0.20) / 0.38) ** 2))
      const feather = (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.80, 1))
        * (1 - THREE.MathUtils.smoothstep(Math.abs(y), 0.69, 1))
      const alpha = clamp((a * 0.58 + b * 0.40 + c * 0.26 - 0.075) * feather * 1.75, 0, 1)
      const index = (row * width + col) * 4
      pixels[index] = 255
      pixels[index + 1] = 255
      pixels[index + 2] = 255
      pixels[index + 3] = Math.round(alpha * 255)
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export function createDioramaAtmosphere(options: EnvironmentOptions): DioramaAtmosphere {
  const group = new THREE.Group()
  group.name = 'tm-diorama-atmosphere'
  const owned: Array<{ dispose: () => void }> = []
  const track = <T extends { dispose: () => void }>(resource: T): T => {
    owned.push(resource)
    return resource
  }

  // A small radial footprint replaces the large opaque rectangular tabletop.
  // The slab itself is left intact: its sides and shadow still read as a model.
  const shadowGeometry = track(new THREE.PlaneGeometry(options.width + 29, options.depth + 28))
  shadowGeometry.rotateX(-Math.PI / 2)
  const shadowMaterial = track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uInk: { value: new THREE.Color(options.night ? '#151e35' : '#546375') },
      uOpacity: { value: options.night ? 0.28 : 0.19 }
    },
    vertexShader: `varying vec2 vUvShadow;
      void main() { vUvShadow = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uInk; uniform float uOpacity; varying vec2 vUvShadow;
      void main() {
        vec2 p = (vUvShadow - vec2(0.5)) * 2.0;
        float r = length(p * vec2(1.00, 0.87));
        float alpha = uOpacity * (1.0 - smoothstep(0.64, 0.99, r));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uInk, alpha);
      }`
  }))
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial)
  shadow.name = 'feathered-pedestal-shadow'
  shadow.position.set(1.5, -3.51, 2)
  shadow.renderOrder = 3
  group.add(shadow)

  // One connected feathered perimeter mist. The central 85% is transparent,
  // so landmarks, route pins, buildings and the car remain readable.
  const fogGeometry = track(new THREE.PlaneGeometry(options.width + 39, options.depth + 39, 48, 34))
  fogGeometry.rotateX(-Math.PI / 2)
  const positions = fogGeometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    const cx = clamp(x, -options.width / 2, options.width / 2)
    const cz = clamp(z, -options.depth / 2, options.depth / 2)
    // Sample the rim of the existing terrain instead of using a flat coplanar mesh.
    const raisedRim = clamp(options.heightAt(cx, cz), -1.2, 10.0)
    const inside = Math.abs(x) <= options.width / 2 && Math.abs(z) <= options.depth / 2
    positions.setY(i, (inside ? raisedRim : 0) + 0.72)
  }
  positions.needsUpdate = true
  fogGeometry.computeVertexNormals()
  const fogMaterial = track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {
      uHalfBounds: { value: new THREE.Vector2(options.width * 0.5, options.depth * 0.5) },
      uColor: { value: new THREE.Color(options.palette.fog).lerp(new THREE.Color(options.palette.skyBottom), 0.25) },
      uStrength: { value: options.night ? 0.24 : 0.27 }
    },
    vertexShader: `varying vec2 vXZ;
      void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec2 uHalfBounds; uniform vec3 uColor; uniform float uStrength; varying vec2 vXZ;
      float sdBox(vec2 p, vec2 b) {
        vec2 d = abs(p) - b;
        return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
      }
      void main() {
        float d = sdBox(vXZ, uHalfBounds - vec2(1.4));
        float softInner = smoothstep(-7.0, 0.8, d);
        float softOuter = 1.0 - smoothstep(9.0, 17.0, d);
        float variation = 0.85 + 0.15 * sin(vXZ.x * 0.12 + sin(vXZ.y * 0.16) * 1.8);
        float alpha = uStrength * softInner * softOuter * variation;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`
  }))
  const fog = new THREE.Mesh(fogGeometry, fogMaterial)
  fog.name = 'feathered-rim-haze'
  fog.renderOrder = 16
  fog.frustumCulled = false // Big transparent ring must not pop at steep camera angles.
  group.add(fog)

  // All wisps are camera-facing sprites with real parallax (not CSS overlays).
  // Restrict them to the perimeter/upper background, never directly over the city.
  const texture = track(createWispTexture())
  type Drift = { sprite: THREE.Sprite; x: number; y: number; z: number; phase: number; speed: number }
  const wisps: Drift[] = []
  const cloudColor = new THREE.Color(options.night ? '#b5c6e9' : '#fffdf9')
  const layout = [
    { x: -0.61, z: -0.30, y: 15, w: 22, h: 4.0, opacity: 0.17, speed: 0.26 },
    { x: 0.60, z: 0.15, y: 19, w: 24, h: 4.2, opacity: 0.15, speed: 0.21 },
    { x: -0.49, z: 0.64, y: 25, w: 20, h: 3.6, opacity: 0.12, speed: 0.18 },
    { x: 0.45, z: -0.71, y: 27, w: 27, h: 4.8, opacity: 0.13, speed: 0.14 },
    { x: 0.04, z: -0.94, y: 32, w: 31, h: 4.0, opacity: 0.085, speed: 0.11 }
  ]
  layout.forEach((item, index) => {
    const material = track(new THREE.SpriteMaterial({
      map: texture,
      color: cloudColor,
      transparent: true,
      opacity: options.night ? item.opacity * 0.65 : item.opacity,
      depthWrite: false,
      depthTest: true,
      fog: true,
      toneMapped: false
    }))
    const sprite = new THREE.Sprite(material)
    sprite.name = `cinematic-wisp-${index + 1}`
    sprite.scale.set(item.w, item.h, 1)
    const x = item.x * options.width
    const z = item.z * options.depth
    sprite.position.set(x, item.y, z)
    sprite.renderOrder = 18
    group.add(sprite)
    wisps.push({ sprite, x, y: item.y, z, phase: index * 1.6, speed: item.speed })
  })

  return {
    group,
    cloudCount: wisps.length,
    update(elapsedSeconds) {
      // Absolute-time motion: never accumulates drift and is FPS independent.
      for (const wisp of wisps) {
        wisp.sprite.position.set(
          wisp.x + Math.sin(elapsedSeconds * wisp.speed + wisp.phase) * 1.6,
          wisp.y + Math.sin(elapsedSeconds * wisp.speed * 0.61 + wisp.phase) * 0.34,
          wisp.z
        )
      }
    },
    dispose() {
      group.removeFromParent()
      group.clear()
      owned.forEach(resource => resource.dispose())
    }
  }
}
