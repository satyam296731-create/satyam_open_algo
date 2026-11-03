import { brandLogoSrc } from '@/lib/branding'
import { useThemeStore } from '@/stores/themeStore'

interface BrandLogoProps {
  className?: string
  variant?: 'full' | 'mark'
}

export function BrandLogo({ className, variant = 'mark' }: BrandLogoProps) {
  const mode = useThemeStore((state) => state.mode)
  const appMode = useThemeStore((state) => state.appMode)

  return (
    <img
      src={brandLogoSrc(mode, appMode, variant)}
      alt="SP Trading"
      className={className}
      draggable={false}
    />
  )
}
