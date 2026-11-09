import * as THREE from 'three'

/** Stitches the terrain perimeter to the diorama lid in one watertight band.
 * The terrain mesh spans width+2 x depth+2; this ring uses that SAME rectangle.
 * Both colours and positions are interpolated per vertex; no opaque tabletop.
 */
export function buildDioramaEdgeSeal(options: {
  width: number
  depth: number
  topColor: string
  bottomColor: string
  bottomY: number
  heightAt: (x: number, z: number) => number
}): THREE.BufferGeometry {
  const hw = options.width * 0.5
  const hd = options.depth * 0.5
  const nx = Math.max(8, Math.ceil(options.width / 2))
  const nz = Math.max(8, Math.ceil(options.depth / 2))
  const ring: Array<{ x: number; z: number }> = []
  // Keep a single shared corner per side. Last quad closes the loop.
  for (let i = 0; i < nx; i++) ring.push({ x: -hw + i * options.width / nx, z: -hd })
  for (let i = 0; i < nz; i++) ring.push({ x: hw, z: -hd + i * options.depth / nz })
  for (let i = 0; i < nx; i++) ring.push({ x: hw - i * options.width / nx, z: hd })
  for (let i = 0; i < nz; i++) ring.push({ x: -hw, z: hd - i * options.depth / nz })
  const upper = new THREE.Color(options.topColor).lerp(new THREE.Color(options.bottomColor), 0.20)
  const lower = new THREE.Color(options.bottomColor)
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  ring.forEach((p, i) => {
    const elevation = options.heightAt(p.x, p.z)
    const yTop = Number.isFinite(elevation) ? Math.max(-0.2, Math.min(12, elevation)) : 0
    // Extend slightly into the lid so floating-point cracks never expose the background.
    const yBottom = Math.min(options.bottomY, yTop - 0.15)
    positions.push(p.x, yTop, p.z, p.x, yBottom, p.z)
    colors.push(upper.r, upper.g, upper.b, lower.r, lower.g, lower.b)
    const j = (i + 1) % ring.length
    indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
