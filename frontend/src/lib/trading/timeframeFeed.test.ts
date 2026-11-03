import { type BarsRequest, CandleBuilder, SessionCalendar } from 'openalgo-charts'
import { describe, expect, it, vi } from 'vitest'
import { createTradingTimeframes } from './timeframeFeed'

const start = Date.parse('2026-10-01T03:45:00Z') / 1000
const calendar = new SessionCalendar({ timezone: 'Asia/Kolkata', sessions: ['0915-1530:23456'] })
const request = {
  symbol: 'RELIANCE',
  exchange: 'NSE',
  interval: '7m',
  from: start,
  to: start + 14 * 60,
}
const options = (nativeIntervals = ['1m', '5m', 'D']) => ({
  providerId: 'test',
  nativeIntervals,
  calendar: () => calendar,
  calendarRevision: () => '1',
  now: () => start + 15 * 60,
})

describe('broker custom timeframes', () => {
  it('keeps only NSE and BSE index intraday bars from 09:15 to 15:15 IST', async () => {
    const close = start + 6 * 60 * 60
    const sourceBars = [start - 60, start, close - 60, close].map((time, index) => ({
      time,
      open: index,
      high: index + 2,
      low: index - 1,
      close: index + 1,
    }))
    const service = createTradingTimeframes(
      { getBars: async () => sourceBars },
      { ...options(['1m']), now: () => close + 60 }
    )

    await expect(
      service.feed.getBars({
        symbol: 'NIFTY',
        exchange: 'NSE_INDEX',
        interval: '1m',
        from: start - 60,
        to: close + 60,
      })
    ).resolves.toEqual([sourceBars[1], sourceBars[2]])
    service.destroy()
  })

  it('filters index history pages and leaves daily history unchanged', async () => {
    const close = start + 6 * 60 * 60
    const sourceBars = [start - 60, start, close - 60, close].map((time, index) => ({
      time,
      open: index,
      high: index + 2,
      low: index - 1,
      close: index + 1,
    }))
    const getBarsPage = vi.fn(async () => ({ bars: sourceBars, hasMore: true }))
    const service = createTradingTimeframes(
      { getBars: async () => sourceBars, getBarsPage },
      { ...options(['1m', 'D']), now: () => close + 60 }
    )

    const page = await service.feed.getBarsPage!({
      symbol: 'NIFTY',
      exchange: 'BSE_INDEX',
      interval: '1m',
      before: close + 60,
      countBack: 10,
    })
    expect(page.bars).toEqual([sourceBars[1], sourceBars[2]])

    const daily = await service.feed.getBars({
      symbol: 'NIFTY',
      exchange: 'NSE_INDEX',
      interval: 'D',
      from: start - 86400,
      to: close + 86400,
    })
    expect(daily).toEqual(sourceBars)
    service.destroy()
  })

  it('uses the source exchange timezone for a complete UTC month', async () => {
    const from = Date.parse('2026-10-01T00:00:00Z') / 1000
    const daily = Array.from({ length: 31 }, (_, i) => ({
      time: from + i * 86400,
      open: i,
      high: i + 2,
      low: i - 1,
      close: i + 1,
      volume: 1,
    }))
    const service = createTradingTimeframes(
      {
        getBars: async (req) => daily.filter((bar) => bar.time >= req.from! && bar.time < req.to!),
      },
      {
        ...options(['D']),
        calendar: () => new SessionCalendar({ timezone: 'UTC', sessions: ['0000-0000'] }),
      }
    )
    const result = await service.feed.getBars({
      symbol: 'TEST',
      exchange: 'CRYPTO',
      interval: 'M',
      from,
      to: from + 31 * 86400,
    })
    expect(result).toEqual([{ time: from, open: 0, high: 32, low: -1, close: 31, volume: 31 }])
    service.destroy()
  })

  it('derives only compatible choices and preserves the native wire token', async () => {
    const getBars = vi.fn(async (_req: BarsRequest) =>
      Array.from({ length: 14 }, (_, i) => ({
        time: start + i * 60,
        open: i,
        high: i + 2,
        low: i - 1,
        close: i + 1,
        volume: 10,
      }))
    )
    const service = createTradingTimeframes({ getBars }, options())
    for (const interval of ['7m', '1h', '2h', 'W', 'M', 'Q'])
      expect(service.supports(interval, request)).toBe(true)
    expect(service.supports('5s', request)).toBe(false)
    const bars = await service.feed.getBars(request)
    expect(getBars.mock.calls[0][0].interval).toBe('1m')
    expect(bars).toEqual([
      { time: start, open: 0, high: 8, low: -1, close: 7, volume: 70 },
      { time: start + 420, open: 7, high: 15, low: 6, close: 14, volume: 70 },
    ])
    await service.feed.getBars({ ...request, interval: '1d' })
    expect(getBars.mock.calls.at(-1)?.[0].interval).toBe('D')
    service.destroy()
  })

  it('uses seconds only when supplied, and never assumes unknown exchange alignment', () => {
    const seconds = createTradingTimeframes({ getBars: async () => [] }, options(['1s']))
    expect(seconds.supports('5s', request)).toBe(true)
    const unknown = createTradingTimeframes(
      { getBars: async () => [] },
      { ...options(), calendar: () => null }
    )
    expect(unknown.supports('1m', request)).toBe(true)
    expect(unknown.supports('7m', request)).toBe(false)
    seconds.destroy()
    unknown.destroy()
  })

  it('anchors history and live seven-minute bars to each session, including the next day', async () => {
    const service = createTradingTimeframes({ getBars: async () => [] }, options())
    const builder = new CandleBuilder({
      intervalSec: 420,
      bucketStart: (time) => service.bucketStart(request, time),
    })
    const next = start + 86400
    expect(builder.onTick({ time: start + 8 * 60, price: 100 })?.bar.time).toBe(start + 420)
    expect(builder.onTick({ time: next + 8 * 60, price: 101 })?.bar.time).toBe(next + 420)
    service.destroy()
  })

  it('passes cancellation and variants through preparation and cancels owned pending history on destroy', async () => {
    let signal: AbortSignal | undefined
    const prepare = vi.fn(async () => {})
    const service = createTradingTimeframes(
      {
        getBars: (req) =>
          new Promise((_resolve, reject) => {
            signal = req.signal
            signal?.addEventListener('abort', () =>
              reject(new DOMException('cancelled', 'AbortError'))
            )
          }),
      },
      { ...options(), prepare }
    )
    const pending = service.feed.getBars({ ...request, variant: { adjustment: 'adjusted' } })
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(signal).toBeDefined())
    service.destroy()
    await rejected
    expect(signal?.aborted).toBe(true)
    expect(prepare).toHaveBeenCalled()
  })

  it('warms daily history independently and withholds the current unfinished daily value', async () => {
    const now = Date.parse('2026-10-01T06:00:00Z') / 1000
    const daily = Array.from({ length: 450 }, (_, i) => {
      const time = start - (449 - i) * 86400 - 33300
      return { time, open: i + 1, high: i + 3, low: i, close: i + 2 }
    }).filter((bar) => {
      const session = calendar.sessionFrom(bar.time)
      return session && session.open < bar.time + 86400
    })
    const wires: string[] = []
    const service = createTradingTimeframes(
      {
        getBars: async (req) => {
          wires.push(req.interval)
          return daily.filter((bar) => bar.time >= req.from! && bar.time < req.to!)
        },
      },
      { ...options(), now: () => now }
    )
    const snapshot = await service.provider.requestSnapshot!({
      symbol: 'RELIANCE',
      exchange: 'NSE',
      interval: 'D',
      from: start - 2 * 86400,
      to: now,
      warmupBars: 200,
    })
    expect(
      snapshot.bars.filter(
        (_, i) => snapshot.confirmed[i] && snapshot.availableAt[i]! <= start - 2 * 86400
      ).length
    ).toBeGreaterThanOrEqual(200)
    expect(snapshot.confirmed.at(-1)).toBe(false)
    expect(new Set(wires)).toEqual(new Set(['D']))
    await expect(
      service.provider.requestSnapshot!({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        interval: 'D',
        from: start,
        to: now,
        asOf: start,
      })
    ).rejects.toThrow(/Historical/)
    service.destroy()
  })
})
