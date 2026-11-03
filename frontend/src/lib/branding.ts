import type { AppMode, ThemeMode } from '@/stores/themeStore'

type LogoVariant = 'full' | 'mark'

export function brandLogoSrc(
  mode: ThemeMode,
  appMode: AppMode,
  variant: LogoVariant = 'mark'
): string {
  const tone = mode === 'dark' || appMode === 'analyzer' ? 'dark' : 'light'
  return `/images/sp-trading-${variant}-${tone}.png`
}

export function brandMarkSrc(mode: ThemeMode, appMode: AppMode): string {
  return brandLogoSrc(mode, appMode, 'mark')
}
