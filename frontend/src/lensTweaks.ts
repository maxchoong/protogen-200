export interface LensParams {
  magnify: number
  bend: number
  splitG: number
  splitB: number
  brighten: number
  fringe: number
  width: number
  radius: number
  rays: number
  rayDrift: number
  scene: number
  sceneLength: number
  hazeFlow: number
  swirl: number
  gateFlicker: number
}

export type LensTheme = 'dark' | 'light'

export const LENS_DEFAULTS: Record<LensTheme, LensParams> = {
  dark: {
    magnify: 0.06,
    bend: 12,
    splitG: 1.2,
    splitB: 1.4,
    brighten: 0.36,
    fringe: 0.36,
    width: 8,
    radius: 12,
    rays: 0.4,
    rayDrift: 0.12,
    scene: 0.15,
    sceneLength: 8,
    hazeFlow: 0.04,
    swirl: 1,
    gateFlicker: 0.02,
  },
  light: {
    magnify: 0.06,
    bend: 12,
    splitG: 1.2,
    splitB: 1.4,
    brighten: 0.36,
    fringe: 0.36,
    width: 8,
    radius: 12,
    rays: 0.64,
    rayDrift: 0.12,
    scene: 0.15,
    sceneLength: 8,
    hazeFlow: 0.04,
    swirl: 0.6,
    gateFlicker: 0.02,
  },
}

const STORAGE_KEY = 'lumera-lens-tweaks'

type LensStore = Record<LensTheme, LensParams>

const load = (): LensStore => {
  const fallback = { dark: { ...LENS_DEFAULTS.dark }, light: { ...LENS_DEFAULTS.light } }
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved) return fallback
    return {
      dark: { ...LENS_DEFAULTS.dark, ...saved.dark },
      light: { ...LENS_DEFAULTS.light, ...saved.light },
    }
  } catch {
    return fallback
  }
}

let store = load()
const listeners = new Set<() => void>()

const commit = (next: LensStore) => {
  store = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Storage can be unavailable (private mode); tweaks then last for the session only.
  }
  listeners.forEach(listener => listener())
}

export const getLensParams = (theme: LensTheme): LensParams => store[theme]

export const setLensParam = (theme: LensTheme, key: keyof LensParams, value: number) =>
  commit({ ...store, [theme]: { ...store[theme], [key]: value } })

export const resetLensParams = (theme: LensTheme) => commit({ ...store, [theme]: { ...LENS_DEFAULTS[theme] } })

export const getLensStore = () => store

const SHADER_KEY = 'lumera-shader-enabled'

let shaderEnabled = (() => {
  try {
    return window.localStorage.getItem(SHADER_KEY) !== 'off'
  } catch {
    return true
  }
})()
const shaderListeners = new Set<() => void>()

export const getShaderEnabled = () => shaderEnabled

export const setShaderEnabled = (enabled: boolean) => {
  shaderEnabled = enabled
  try {
    window.localStorage.setItem(SHADER_KEY, enabled ? 'on' : 'off')
  } catch {
    // Without storage the toggle only lasts for the session.
  }
  shaderListeners.forEach(listener => listener())
}

export const subscribeShaderEnabled = (listener: () => void) => {
  shaderListeners.add(listener)
  return () => {
    shaderListeners.delete(listener)
  }
}

export const isTweakPanelEnabled = () =>
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('tweak')

export const subscribeLensStore = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
