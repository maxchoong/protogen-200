import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { ThemeMode } from '../hooks/useTheme'
import { getShaderEnabled, subscribeShaderEnabled } from '../lensTweaks'

const BeamBackground = lazy(() => import('./BeamBackground'))

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches)

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export default function AmbientBackground({ theme }: { theme: ThemeMode }) {
  const reducedMotion = usePrefersReducedMotion()
  const [shaderFailed, setShaderFailed] = useState(false)
  const [shaderReady, setShaderReady] = useState(false)
  const shaderEnabled = useSyncExternalStore(subscribeShaderEnabled, getShaderEnabled)
  const useShader = shaderEnabled && !reducedMotion && !shaderFailed

  useEffect(() => {
    if (!useShader) setShaderReady(false)
  }, [useShader])

  return (
    <div className="ambient-background" data-shader-ready={useShader && shaderReady} aria-hidden="true">
      <div className="ambient-fallback" />
      {useShader && (
        <Suspense fallback={null}>
          <BeamBackground
            theme={theme}
            onReady={() => setShaderReady(true)}
            onUnavailable={() => setShaderFailed(true)}
          />
        </Suspense>
      )}
    </div>
  )
}
