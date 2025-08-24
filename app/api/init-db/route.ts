import { NextResponse } from 'next/server'
import { connectWithRetry } from '@/lib/db-config'

export async function POST() {
  try {
    const success = await connectWithRetry(3)
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Database initialized successfully'
      })
    } else {
      return NextResponse.json({
        success: false,
        message: 'Database initialization failed'
      }, { status: 500 })
    }
  } catch (error) {
    console.error('Database initialization error:', error)
    return NextResponse.json({
      success: false,
      message: 'Database initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Database initialization endpoint. Use POST to initialize.'
  })
}