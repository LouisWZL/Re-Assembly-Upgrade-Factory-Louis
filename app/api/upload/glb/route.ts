import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
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
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'glb')
    const filePath = path.join(uploadDir, uniqueFilename)

    // Save file
    await writeFile(filePath, buffer)

    // Return the public URL
    const publicUrl = `/uploads/glb/${uniqueFilename}`

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: uniqueFilename
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: 'Fehler beim Hochladen der Datei' },
      { status: 500 }
    )
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
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'glb', filename)
    
    await unlink(filePath)

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