import { useEffect } from 'react'
import { brandMarkSrc } from '@/lib/branding'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeBrandAssets() {
  const mode = useThemeStore((state) => state.mode)
  const appMode = useThemeStore((state) => state.appMode)

  useEffect(() => {
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon) favicon.href = brandMarkSrc(mode, appMode)
  }, [mode, appMode])

  return null
}
