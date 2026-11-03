import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'
import { BrandLogo } from './BrandLogo'

beforeEach(() => {
  useThemeStore.setState({ mode: 'light', appMode: 'live' })
})

describe('BrandLogo', () => {
  it('uses the light mark in the light theme', () => {
    render(<BrandLogo />)

    expect(screen.getByRole('img', { name: 'SP Trading' })).toHaveAttribute(
      'src',
      '/images/sp-trading-mark-light.png'
    )
  })

  it('switches to the dark mark when dark mode is enabled', () => {
    render(<BrandLogo />)

    act(() => useThemeStore.getState().setMode('dark'))

    expect(screen.getByRole('img', { name: 'SP Trading' })).toHaveAttribute(
      'src',
      '/images/sp-trading-mark-dark.png'
    )
  })

  it('uses the dark mark for analyzer mode', () => {
    render(<BrandLogo />)

    act(() => useThemeStore.getState().setAppMode('analyzer'))

    expect(screen.getByRole('img', { name: 'SP Trading' })).toHaveAttribute(
      'src',
      '/images/sp-trading-mark-dark.png'
    )
  })

  it('uses the full logo when requested', () => {
    render(<BrandLogo variant="full" />)

    expect(screen.getByRole('img', { name: 'SP Trading' })).toHaveAttribute(
      'src',
      '/images/sp-trading-full-light.png'
    )
  })
})
