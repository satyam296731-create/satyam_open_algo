import { webClient } from '@/api/client'

export interface SignalScannerSettings {
  user_id: string
  timeframe: string
  atr_multiple: number
  atr_period: number
  last_scan_at: string | null
  scanned_count: number
  failed_count: number
}

export interface SignalScannerEvent {
  id: number
  symbol: string
  exchange: string
  timeframe: string
  action: 'BUY' | 'SELL'
  price: number
  bar_timestamp: number
  created_at: string
}

export interface SignalScannerDashboard {
  settings: SignalScannerSettings
  scanner: {
    running: boolean
    strategy_id: string
  }
  signals: SignalScannerEvent[]
}

interface DashboardResponse {
  status: 'success' | 'error'
  message?: string
  settings?: SignalScannerSettings
  scanner?: SignalScannerDashboard['scanner']
  signals?: SignalScannerEvent[]
}

interface SettingsResponse {
  status: 'success' | 'error'
  message?: string
  settings?: SignalScannerSettings
}

interface StatusResponse {
  status: 'success' | 'error'
  message?: string
}

export async function fetchSignalScannerDashboard(): Promise<SignalScannerDashboard> {
  const response = await webClient.get<DashboardResponse>('/signal-scanner/api/dashboard')
  if (
    response.data.status !== 'success' ||
    !response.data.settings ||
    !response.data.scanner ||
    !response.data.signals
  ) {
    throw new Error(response.data.message || 'Signal scanner details could not be loaded.')
  }
  return {
    settings: response.data.settings,
    scanner: response.data.scanner,
    signals: response.data.signals,
  }
}

export async function saveSignalScannerSettings(
  settings: Pick<SignalScannerSettings, 'timeframe' | 'atr_multiple' | 'atr_period'>
): Promise<SignalScannerSettings> {
  const response = await webClient.post<SettingsResponse>('/signal-scanner/api/settings', settings)
  if (response.data.status !== 'success' || !response.data.settings) {
    throw new Error(response.data.message || 'Signal scanner settings could not be saved.')
  }
  return response.data.settings
}

export async function startSignalScanner(): Promise<void> {
  const response = await webClient.post<StatusResponse>('/signal-scanner/api/start')
  if (response.data.status !== 'success') {
    throw new Error(response.data.message || 'Signal scanner could not start.')
  }
}

export async function stopSignalScanner(): Promise<void> {
  const response = await webClient.post<StatusResponse>('/signal-scanner/api/stop')
  if (response.data.status !== 'success') {
    throw new Error(response.data.message || 'Signal scanner could not stop.')
  }
}
