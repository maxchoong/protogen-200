import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import type { ThemeMode } from '../hooks/useTheme'
import { sampleGlassCards, trackGlassCards } from '../glassCards'
import { getLensParams } from '../lensTweaks'

const VERTEX = /* glsl */ `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// GLSL ES 1.00 so WebGL1 and WebGL2 contexts behave identically across browsers.
const FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uLight;
uniform float uPx;
uniform vec4 uRect0;
uniform vec4 uRect1;
uniform vec4 uRect2;
uniform vec4 uRect3;
uniform vec4 uHover;
uniform vec4 uClip0;
uniform vec4 uClip1;
uniform vec4 uClip2;
uniform vec4 uClip3;
uniform vec4 uLensA;
uniform vec4 uLensB;
uniform vec4 uBeamA;
uniform vec4 uBeamB;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}

float dust(vec2 p, float scale, float seed, float t) {
  vec2 q = p * scale + vec2(t * 0.012, -t * 0.02) * scale + seed;
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash(id + seed);
  vec2 jitter = vec2(h - 0.5, hash(id + 7.7) - 0.5) * 0.6;
  jitter += 0.12 * vec2(sin(t * 0.4 + h * 6.28), cos(t * 0.33 + h * 6.28));
  float d = length(f - jitter);
  float twinkle = 0.6 + 0.4 * sin(t * 0.9 + h * 40.0);
  return step(0.55, h) * smoothstep(0.045, 0.0, d) * twinkle;
}

// Streaks fanning out from the lens, as if cast by bright and dark areas of the projected picture.
float rayPattern(float ang, float seed, float t) {
  float z = seed * 7.31 + t * uBeamA.y;
  return 0.65 * noise(vec2(ang * 28.0, z)) + 0.35 * noise(vec2(ang * 70.0 + 3.7, z * 1.3 + 4.1));
}

vec4 shade(vec2 p) {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = vec2(p.x / aspect, p.y);
  float t = uTime;

  // Projector sits just off the top-right corner, aimed down-left.
  vec2 origin = vec2(aspect * 1.08, 1.12);
  vec2 dir = normalize(vec2(-0.72, -0.69));
  vec2 v = p - origin;
  float along = dot(v, dir);
  float across = v.x * dir.y - v.y * dir.x;

  float halfWidth = 0.05 + max(along, 0.0) * 0.34;
  float cone = smoothstep(halfWidth, halfWidth * 0.15, abs(across));
  cone *= smoothstep(0.0, 0.25, along) * exp(-max(along, 0.0) * 0.85);

  // Scenes crossfade over the last quarter of each shot so picture changes never read as hard cuts.
  float s = t / max(uBeamA.w, 0.5);
  float shot = floor(s);
  float blend = smoothstep(0.75, 1.0, fract(s));

  float ang = across / max(along, 0.05);
  float rays = mix(rayPattern(ang, shot, t), rayPattern(ang, shot + 1.0, t), blend);
  float rayMod = 1.0 + uBeamA.x * (rays * 2.0 - 1.0);

  float level = mix(hash(vec2(shot, 1.7)), hash(vec2(shot + 1.0, 1.7)), blend);
  float sceneMod = 1.0 + uBeamA.z * (level * 2.0 - 1.0);
  float gate = 1.0 - uBeamB.z * hash(vec2(floor(t * 24.0), 9.1));

  // Smoke drifts away from the projector and curls via a cheap domain warp.
  vec2 hp = p * 2.2;
  vec2 warp = vec2(noise(hp * 0.6 + t * 0.05), noise(hp * 0.6 + 9.1 - t * 0.04)) - 0.5;
  float haze = fbm(hp + warp * uBeamB.y - dir * t * uBeamB.x + vec2(t * 0.018, -t * 0.012));
  float beam = cone * (0.55 + 0.75 * haze) * rayMod * sceneMod * gate;

  float motes = dust(p, 18.0, 1.0, t) + 0.7 * dust(p, 32.0, 5.0, t);
  float cut = smoothstep(0.02, 0.35, cone);
  beam += (hash(gl_FragCoord.xy + floor(t * 24.0)) - 0.5) * 0.03 * cone;

  // Light theme tints the page with deep amber and uses dark motes, since added light is invisible on a bright page.
  vec3 beamTint = mix(vec3(1.0, 0.84, 0.58), vec3(1.0, 0.82, 0.68), uLight);
  vec3 moteTint = mix(vec3(1.0, 0.84, 0.58), vec3(0.68, 0.55, 0.38), uLight);

  float aB = clamp(beam * 0.5 * mix(0.6, 0.95, uLight), 0.0, 1.0);
  float aM = clamp(motes * cut * mix(0.55, 0.65, uLight), 0.0, 1.0);

  vec3 col = beamTint * aB * (1.0 - aM) + moteTint * aM;
  float aL = aB + aM - aB * aM;

  float vig = smoothstep(0.35, 1.25, length((uv - 0.5) * vec2(aspect, 1.0) * 1.15));
  float aV = vig * mix(0.4, 0.0, uLight);

  float alpha = aL + aV * (1.0 - aL);
  return vec4(col, alpha);
}

float sdBox(vec2 q, vec2 halfSize, float r) {
  vec2 d = abs(q) - halfSize + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// Card interior acts as a lens: the beam bends toward the edge, splits per channel, and brightens.
vec4 applyCard(vec4 base, vec2 frag, vec4 card, vec4 clip, float h) {
  if (h < 0.002) return base;
  if (frag.x < clip.x || frag.y < clip.y || frag.x > clip.z || frag.y > clip.w) return base;

  vec2 q = frag - card.xy;
  float r = uLensB.w * uPx;
  float sd = sdBox(q, card.zw, r);
  if (sd > 0.0) return base;

  float e = smoothstep(-uLensB.z * uPx, 0.0, sd);
  vec2 k = vec2(1.5 * uPx, 0.0);
  vec2 n = normalize(vec2(
    sdBox(q + k.xy, card.zw, r) - sdBox(q - k.xy, card.zw, r),
    sdBox(q + k.yx, card.zw, r) - sdBox(q - k.yx, card.zw, r)
  ) + 1e-5);

  vec2 magnify = -q * uLensA.x * h;
  vec2 bend = -n * e * e * uLensA.y * uPx * h;
  vec2 pBase = frag / uResolution.y;
  vec4 cR = shade(pBase + (magnify + bend) / uResolution.y);
  vec4 cG = shade(pBase + (magnify + bend * uLensB.x) / uResolution.y);
  vec4 cB = shade(pBase + (magnify + bend * uLensB.y) / uResolution.y);

  vec4 lens = vec4(cR.r, cG.g, cB.b, (cR.a + cG.a + cB.a) / 3.0) * (1.0 + uLensA.z * h);

  float facing = dot(n, normalize(vec2(0.72, 0.69)));
  float fringe = e * e * h * uLensA.w;
  vec3 warm = mix(vec3(1.0, 0.62, 0.4), vec3(1.0, 0.5, 0.38), uLight);
  vec3 cool = vec3(0.45, 0.65, 1.0);
  lens.rgb += warm * max(facing, 0.0) * fringe + cool * max(-facing, 0.0) * fringe;
  lens.a = clamp(max(lens.a, max(lens.r, max(lens.g, lens.b))), 0.0, 1.0);
  lens.rgb = min(lens.rgb, vec3(lens.a));

  return mix(base, lens, (1.0 - smoothstep(-1.5 * uPx, 0.0, sd)) * h);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec4 c = shade(frag / uResolution.y);
  c = applyCard(c, frag, uRect0, uClip0, uHover.x);
  c = applyCard(c, frag, uRect1, uClip1, uHover.y);
  c = applyCard(c, frag, uRect2, uClip2, uHover.z);
  c = applyCard(c, frag, uRect3, uClip3, uHover.w);
  gl_FragColor = c;
}
`

interface BeamBackgroundProps {
  theme: ThemeMode
  onReady?: () => void
  onUnavailable?: () => void
}

const RENDER_SCALE = 0.6
const MAX_DPR = 1.5

export default function BeamBackground({ theme, onReady, onUnavailable }: BeamBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lightRef = useRef<{ value: number }>({ value: theme === 'light' ? 1 : 0 })
  const callbacksRef = useRef({ onReady, onUnavailable })

  callbacksRef.current = { onReady, onUnavailable }
  lightRef.current.value = theme === 'light' ? 1 : 0

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: Renderer
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        webgl: 1,
        dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR) * RENDER_SCALE,
      })
    } catch {
      callbacksRef.current.onUnavailable?.()
      return
    }

    const gl = renderer.gl
    if (!gl) {
      callbacksRef.current.onUnavailable?.()
      return
    }

    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.className = 'beam-canvas'
    container.appendChild(canvas)

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: [1, 1] },
      uLight: lightRef.current,
      uPx: { value: 1 },
      uRect0: { value: [0, 0, 0, 0] },
      uRect1: { value: [0, 0, 0, 0] },
      uRect2: { value: [0, 0, 0, 0] },
      uRect3: { value: [0, 0, 0, 0] },
      uHover: { value: [0, 0, 0, 0] },
      uClip0: { value: [0, 0, 0, 0] },
      uClip1: { value: [0, 0, 0, 0] },
      uClip2: { value: [0, 0, 0, 0] },
      uClip3: { value: [0, 0, 0, 0] },
      uLensA: { value: [0, 0, 0, 0] },
      uLensB: { value: [0, 0, 0, 0] },
      uBeamA: { value: [0, 0, 0, 1] },
      uBeamB: { value: [0, 0, 0, 0] },
    }
    const rectUniforms = [uniforms.uRect0, uniforms.uRect1, uniforms.uRect2, uniforms.uRect3]
    const clipUniforms = [uniforms.uClip0, uniforms.uClip1, uniforms.uClip2, uniforms.uClip3]

    const program = new Program(gl, { vertex: VERTEX, fragment: FRAGMENT, uniforms, transparent: true, depthTest: false })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      const { clientWidth, clientHeight } = container
      if (!clientWidth || !clientHeight) return
      renderer.setSize(clientWidth, clientHeight)
      uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height]
      uniforms.uPx.value = gl.canvas.width / clientWidth
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    let frame = 0
    let contextLost = false
    const startedAt = performance.now()
    let lastFrame = startedAt
    const stopTracking = trackGlassCards()

    const syncCards = (dt: number) => {
      const scale = uniforms.uPx.value
      const height = container.clientHeight
      const hover = [0, 0, 0, 0]
      const active = sampleGlassCards(dt, rectUniforms.length)

      const lens = getLensParams(lightRef.current.value > 0.5 ? 'light' : 'dark')
      uniforms.uLensA.value = [lens.magnify, lens.bend, lens.brighten, lens.fringe]
      uniforms.uLensB.value = [lens.splitG, lens.splitB, lens.width, lens.radius]
      uniforms.uBeamA.value = [lens.rays, lens.rayDrift, lens.scene, lens.sceneLength]
      uniforms.uBeamB.value = [lens.hazeFlow, lens.swirl, lens.gateFlicker, 0]

      rectUniforms.forEach((uniform, i) => {
        const card = active[i]
        if (!card) {
          uniform.value = [0, 0, 0, 0]
          return
        }
        const { rect, clip } = card
        uniform.value = [
          (rect.left + rect.width / 2) * scale,
          (height - rect.top - rect.height / 2) * scale,
          (rect.width / 2) * scale,
          (rect.height / 2) * scale,
        ]
        clipUniforms[i].value = [clip.left * scale, (height - clip.bottom) * scale, clip.right * scale, (height - clip.top) * scale]
        hover[i] = card.value
      })
      uniforms.uHover.value = hover
    }

    const draw = (now: number) => {
      syncCards(Math.min((now - lastFrame) / 1000, 0.1))
      lastFrame = now
      uniforms.uTime.value = (now - startedAt) / 1000
      renderer.render({ scene: mesh })
      frame = requestAnimationFrame(draw)
    }
    const start = () => {
      if (!frame && !contextLost) {
        lastFrame = performance.now()
        frame = requestAnimationFrame(draw)
      }
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }

    const onVisibility = () => (document.hidden ? stop() : start())
    const onLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      stop()
      delete document.documentElement.dataset.glassShader
      callbacksRef.current.onUnavailable?.()
    }

    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onLost)

    start()
    document.documentElement.dataset.glassShader = 'on'
    callbacksRef.current.onReady?.()

    return () => {
      stop()
      stopTracking()
      delete document.documentElement.dataset.glassShader
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <div ref={containerRef} className="beam-background" aria-hidden="true" />
}
