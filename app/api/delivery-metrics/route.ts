import { NextResponse } from 'next/server'
import { getDeliveryDeviationMetrics } from '@/app/actions/advanced-simulation.actions'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const factoryId = url.searchParams.get('factoryId')
    const sinceParam = url.searchParams.get('since')
    const simStartParam = url.searchParams.get('simulationStartTime')

    if (!factoryId) {
      return NextResponse.json(
        { success: false, error: 'Parameter factoryId fehlt' },
        { status: 400 }
      )
    }

    let sinceDate: Date | null = null
    if (sinceParam) {
      const numeric = Number(sinceParam)
      if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
        const parsed = new Date(numeric)
        if (!Number.isNaN(parsed.getTime())) {
          sinceDate = parsed
        }
      } else {
        const parsed = new Date(sinceParam)
        if (!Number.isNaN(parsed.getTime())) {
          sinceDate = parsed
        }
      }
    }

    let simulationStartTime: number | null = null
    if (simStartParam) {
      const numeric = Number(simStartParam)
      if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
        simulationStartTime = numeric
      }
    }

    const result = await getDeliveryDeviationMetrics(factoryId, sinceDate, simulationStartTime)
    const status = result.success ? 200 : 500
    return NextResponse.json(result, { status })
  } catch (error) {
    console.error('[delivery-metrics] failed:', error)
    return NextResponse.json(
      { success: false, error: 'Unerwarteter Fehler beim Laden der Liefertermin-Analysen' },
      { status: 500 }
    )
  }
}
