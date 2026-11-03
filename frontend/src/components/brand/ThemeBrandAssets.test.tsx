import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'
import { ThemeBrandAssets } from './ThemeBrandAssets'

let favicon: HTMLLinkElement

beforeEach(() => {
  useThemeStore.setState({ mode: 'light', appMode: 'live' })
  favicon = document.createElement('link')
  favicon.rel = 'icon'
  document.head.append(favicon)
})

afterEach(() => favicon.remove())

describe('ThemeBrandAssets', () => {
  it('updates the favicon with the selected theme', () => {
    render(<ThemeBrandAssets />)

    expect(favicon.getAttribute('href')).toBe('/images/sp-trading-mark-light.png')

    act(() => useThemeStore.getState().setMode('dark'))

    expect(favicon.getAttribute('href')).toBe('/images/sp-trading-mark-dark.png')
  })
})
