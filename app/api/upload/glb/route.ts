import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, readFile } from 'fs/promises'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'Keine Datei gefunden' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.glb')) {
      return NextResponse.json(
        { error: 'Nur .glb Dateien sind erlaubt' },
        { status: 400 }
      )
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024 // 50MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Datei ist zu groß. Maximal 50MB erlaubt.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Create unique filename
    const timestamp = Date.now()
    const uniqueFilename = `${timestamp}-${file.name}`

    // Detect Vercel/runtime env where public dir is read-only
    const isVercel = !!process.env.VERCEL || process.env.NODE_ENV === 'production'

    if (isVercel) {
      // Use /tmp for ephemeral, writable storage on Vercel
      const tmpUploadDir = path.join('/tmp', 'uploads', 'glb')
      await mkdir(tmpUploadDir, { recursive: true })
      const tmpFilePath = path.join(tmpUploadDir, uniqueFilename)
      await writeFile(tmpFilePath, buffer)

      // Return API URL that streams from /tmp
      const apiUrl = `/api/upload/glb?filename=${encodeURIComponent(uniqueFilename)}`
      return NextResponse.json({ success: true, url: apiUrl, filename: uniqueFilename })
    } else {
      // Local/dev: write into public so it’s directly served
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'glb')
      await mkdir(uploadDir, { recursive: true })
      const filePath = path.join(uploadDir, uniqueFilename)
      await writeFile(filePath, buffer)

      const publicUrl = `/uploads/glb/${uniqueFilename}`
      return NextResponse.json({ success: true, url: publicUrl, filename: uniqueFilename })
    }
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: 'Fehler beim Hochladen der Datei' },
      { status: 500 }
    )
  }
}

// Stream a GLB file back. In Vercel we serve from /tmp, locally from public/uploads/glb
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')

    if (!filename) {
      return NextResponse.json({ error: 'Dateiname fehlt' }, { status: 400 })
    }

    // Security check - prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Ungültiger Dateiname' }, { status: 400 })
    }

    const tmpPath = path.join('/tmp', 'uploads', 'glb', filename)
    const publicPath = path.join(process.cwd(), 'public', 'uploads', 'glb', filename)

    let filePath: string | null = null
    if (fs.existsSync(tmpPath)) {
      filePath = tmpPath
    } else if (fs.existsSync(publicPath)) {
      filePath = publicPath
    }

    if (!filePath) {
      return NextResponse.json({ error: 'Datei nicht gefunden' }, { status: 404 })
    }

    const data = await readFile(filePath)
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `inline; filename="${filename}"`
      }
    })
  } catch (error) {
    console.error('Error reading file:', error)
    return NextResponse.json({ error: 'Fehler beim Laden der Datei' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')

    if (!filename) {
      return NextResponse.json(
        { error: 'Dateiname fehlt' },
        { status: 400 }
      )
    }

    // Security check - prevent directory traversal
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: 'Ungültiger Dateiname' },
        { status: 400 }
      )
    }

    const { unlink } = await import('fs/promises')
    // Try removing from /tmp first (Vercel), then from public (local)
    const tmpPath = path.join('/tmp', 'uploads', 'glb', filename)
    const publicPath = path.join(process.cwd(), 'public', 'uploads', 'glb', filename)

    if (fs.existsSync(tmpPath)) {
      await unlink(tmpPath)
    } else if (fs.existsSync(publicPath)) {
      await unlink(publicPath)
    }

    return NextResponse.json({
      success: true,
      message: 'Datei erfolgreich gelöscht'
    })
  } catch (error) {
    console.error('Error deleting file:', error)
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Datei' },
      { status: 500 }
    )
  }
}
