import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { usePageTitle } from './usePageTitle'

function PageTitle() {
  usePageTitle()
  return null
}

describe('usePageTitle', () => {
  afterEach(() => {
    cleanup()
    document.title = ''
  })

  it('uses the brand name on the trading terminal', () => {
    render(
      <MemoryRouter initialEntries={['/trading']}>
        <PageTitle />
      </MemoryRouter>
    )

    expect(document.title).toBe('SP Trading')
  })

  it('uses the brand name after page titles throughout the app', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <PageTitle />
      </MemoryRouter>
    )

    expect(document.title).toBe('Dashboard | SP Trading')
  })
})
