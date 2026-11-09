import * as THREE from 'three'
import type { WorldPalette } from './theme'
import type { ShoreMask } from './CinematicShore'

/**
 * A bounded-cost animated water surface for the CINEMA visual treatment.
 * Geometry, water level, river/shore topology and bridge heights are untouched.
 * This is analytical sky/sun reflection, NOT planar city reflection or SSR.
 */
export function createCinematicWaterMaterial(palette: WorldPalette, night: boolean, shore: ShoreMask | null = null) {
  const deep = new THREE.Color(palette.waterDeep).lerp(new THREE.Color(night ? '#0b243a' : '#123c4b'), night ? 0.48 : 0.32)
  const shallow = new THREE.Color(palette.water).lerp(new THREE.Color(night ? '#3c667e' : '#72a5a1'), 0.36)
  const material = new THREE.ShaderMaterial({
    name: 'tm-cinema-water',
    uniforms: {
      // Required by WebGLMaterials.refreshFogUniforms when material.fog=true.
      // Without these keys, Three.js throws reading 'value' at render time.
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uDeep: { value: deep },
      uShallow: { value: shallow },
      uHorizon: { value: new THREE.Color(night ? '#7181aa' : '#ffe2bd') },
      uZenith: { value: new THREE.Color(night ? '#233657' : '#8aacca') },
      uSunDir: { value: new THREE.Vector3(-28, 62, 34).normalize() },
      uNight: { value: night ? 1 : 0 },
      uShoreEnabled: { value: shore ? 1 : 0 },
      uShoreMap: { value: shore?.texture ?? null },
      uShoreBounds: { value: shore?.bounds ?? new THREE.Vector4() },
      uReflectionEnabled: { value: 0 },
      uReflectionHeight: { value: 0 },
      uReflectionMap: { value: null },
      uReflectionMatrix: { value: new THREE.Matrix4() }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      #include <fog_pars_vertex>
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uNight;
      uniform float uShoreEnabled;
      uniform sampler2D uShoreMap;
      uniform vec4 uShoreBounds;
      uniform float uReflectionEnabled;
      uniform float uReflectionHeight;
      uniform sampler2D uReflectionMap;
      uniform mat4 uReflectionMatrix;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      #include <fog_pars_fragment>
      void main() {
        // Continuous XZ coordinates keep the ripple field aligned across
        // independently triangulated lake / river / waterway meshes.
        vec2 p = vWorldPos.xz;
        float t = uTime;
        float a = dot(p, vec2(0.73, 0.68)) * 2.2 + t * 0.65;
        float b = dot(p, vec2(-0.86, 0.51)) * 3.6 - t * 0.48;
        float c = dot(p, vec2(0.34, -0.94)) * 6.1 + t * 0.28;
        // Fade sub-pixel frequencies to avoid distant water shimmer / moire.
        float aa = 1.0 - smoothstep(0.75, 2.1, fwidth(a));
        float ab = 1.0 - smoothstep(0.75, 2.1, fwidth(b));
        float ac = 1.0 - smoothstep(0.75, 2.1, fwidth(c));
        vec2 slope =
          vec2(0.73, 0.68) * cos(a) * 0.083 * aa +
          vec2(-0.86, 0.51) * cos(b) * 0.061 * ab +
          vec2(0.34, -0.94) * cos(c) * 0.023 * ac;
        vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float cosTheta = clamp(dot(viewDir, n), 0.0, 1.0);
        // Fresnel term controls the sky contribution at grazing angles.
        float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);
        vec3 reflected = reflect(-viewDir, n);
        float skyHeight = smoothstep(-0.1, 0.8, reflected.y);
        vec3 sky = mix(uHorizon, uZenith, skyHeight);
        float wave = (sin(a) * aa + sin(b) * ab * 0.42 + sin(c) * ac * 0.16) * 0.5;
        vec3 water = mix(uDeep, uShallow, clamp(0.45 + wave * 0.16, 0.0, 1.0));
        vec3 lightDir = normalize(uSunDir);
        vec3 sunReflection = reflect(-lightDir, n);
        float sunLobe = pow(max(dot(sunReflection, viewDir), 0.0), 85.0);
        float sunSpark = pow(max(dot(sunReflection, viewDir), 0.0), 380.0);
        vec3 sunTint = mix(vec3(1.0, 0.83, 0.63), vec3(0.49, 0.61, 0.95), uNight);
        vec3 color = mix(water, sky, clamp(0.15 + fresnel * 0.78, 0.0, 0.88));
        // True-shore distance mask: land, island holes and OSM coastlines have
        // one shared topology. This changes only color, NEVER the water mesh.
        if (uShoreEnabled > 0.5) {
          vec2 shoreUv = (p - uShoreBounds.xy) * uShoreBounds.zw;
          float shoreDistance = texture2D(uShoreMap, clamp(shoreUv, 0.0, 1.0)).r * 4.0;
          float shoal = 1.0 - smoothstep(0.22, 2.3, shoreDistance);
          color = mix(color, uShallow * 1.13, shoal * 0.49);
          float foam = exp(-shoreDistance * 3.8) * 0.07 * shoal;
          color += vec3(0.85, 0.91, 0.92) * foam;
        }
        // The planar capture is from the dominant FLAT water body only.
        // Guard by surface height and projected UV to avoid misaligned reflection
        // on curved rivers, terrain-following streams or different-height lakes.
        if (uReflectionEnabled > 0.5) {
          vec4 projected = uReflectionMatrix * vec4(vWorldPos, 1.0);
          vec2 reflectionUv = projected.xy / max(projected.w, 0.001);
          float validUv = step(0.001, projected.w) * step(0.01, reflectionUv.x)
                        * step(reflectionUv.x, 0.99) * step(0.01, reflectionUv.y)
                        * step(reflectionUv.y, 0.99);
          float flatMatch = 1.0 - smoothstep(0.09, 0.42, abs(vWorldPos.y - uReflectionHeight));
          vec2 distortion = slope * (0.04 + fresnel * 0.06);
          vec3 captured = texture2D(uReflectionMap, clamp(reflectionUv + distortion, 0.01, 0.99)).rgb;
          float reflectionMix = 0.34 * flatMatch * validUv * smoothstep(0.10, 0.83, fresnel);
          color = mix(color, captured, reflectionMix);
        }
        color += sunTint * (sunLobe * 0.16 + sunSpark * 0.36) * (1.0 - uNight * 0.5);
        // Do not use alpha translucency; water has a cut-out terrain beneath it
        // and should remain depth-stable against the shore and the bridges.
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    transparent: false
  })
  return material
}

/** The time is bounded to avoid loss of floating-point precision on long sessions. */
export function updateCinematicWater(material: THREE.Material, elapsedSeconds: number) {
  if (material instanceof THREE.ShaderMaterial && material.name === 'tm-cinema-water') {
    material.uniforms['uTime']!.value = (Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0) % 2048
  }
}
