import { useState, useSyncExternalStore } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import {
  LENS_DEFAULTS,
  getLensStore,
  getShaderEnabled,
  resetLensParams,
  setLensParam,
  setShaderEnabled,
  subscribeLensStore,
  subscribeShaderEnabled,
  type LensParams,
} from '../lensTweaks'

const CONTROLS: Array<{ key: keyof LensParams; label: string; min: number; max: number; step: number }> = [
  { key: 'magnify', label: 'Magnify', min: 0, max: 0.25, step: 0.005 },
  { key: 'bend', label: 'Edge bend (px)', min: 0, max: 120, step: 1 },
  { key: 'splitG', label: 'Green split', min: 1, max: 2, step: 0.01 },
  { key: 'splitB', label: 'Blue split', min: 1, max: 3, step: 0.01 },
  { key: 'brighten', label: 'Brighten', min: 0, max: 1.5, step: 0.01 },
  { key: 'fringe', label: 'Edge glow', min: 0, max: 0.6, step: 0.005 },
  { key: 'width', label: 'Lens width (px)', min: 8, max: 120, step: 1 },
  { key: 'radius', label: 'Corner radius (px)', min: 0, max: 32, step: 1 },
]

export default function LensTweakPanel({ theme }: { theme: ThemeMode }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const store = useSyncExternalStore(subscribeLensStore, getLensStore)
  const shaderEnabled = useSyncExternalStore(subscribeShaderEnabled, getShaderEnabled)
  const params = store[theme]

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(store, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 w-64 rounded-lg border border-border bg-surface p-3 text-xs text-text shadow-card">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between font-semibold"
        aria-expanded={open}
      >
        <span>Lens tweaks ({theme})</span>
        <span aria-hidden="true">{open ? '–' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <label className="flex items-center justify-between">
            <span>Shaders enabled</span>
            <input
              type="checkbox"
              checked={shaderEnabled}
              onChange={e => setShaderEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
          {CONTROLS.map(({ key, label, min, max, step }) => (
            <label key={key} className="block">
              <span className="flex justify-between text-text-muted">
                <span>{label}</span>
                <span className="tabular-nums text-text">
                  {params[key]}
                  {params[key] !== LENS_DEFAULTS[theme][key] ? ' *' : ''}
                </span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={params[key]}
                onChange={e => setLensParam(theme, key, Number(e.target.value))}
                className="w-full accent-[var(--color-accent)]"
              />
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => resetLensParams(theme)}
              className="rounded-pill border border-border px-3 py-1 text-text-muted hover:text-text"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-pill border border-border px-3 py-1 text-text-muted hover:text-text"
            >
              {copied ? 'Copied' : 'Copy both themes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
