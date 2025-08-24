import * as joint from '@joint/plus'

interface GraphCell {
  id: string
  type: string
  attrs?: any
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  source?: { id: string; port?: string } | string
  target?: { id: string; port?: string } | string
  baugruppentyp?: { id: string; bezeichnung: string }
  [key: string]: any
}

interface GraphData {
  cells: GraphCell[]
}

// Create a circular shape for process nodes
function createProcessShape(
  id: string,
  label: string,
  x: number,
  y: number,
  color: string,
  baugruppentyp?: { id: string; bezeichnung: string },
  processType?: 'demontage' | 'remontage'
): GraphCell {
  return {
    id,
    type: 'standard.Circle',
    position: { x, y },
    size: { width: 120, height: 120 },
    attrs: {
      body: {
        fill: color,
        stroke: '#525252',
        strokeWidth: 2,
        fillOpacity: 0.8
      },
      label: {
        text: label,
        fill: '#000000',
        fontSize: 12,
        fontWeight: 'bold',
        textWrap: {
          width: 100,
          height: 100,
          ellipsis: true
        }
      }
    },
    baugruppentyp,
    processType,
    ports: {
      groups: {
        'in': {
          position: { name: 'left' },
          attrs: {
            portBody: {
              magnet: 'passive',
              r: 6,
              fill: '#ffffff',
              stroke: '#525252',
              strokeWidth: 2
            }
          },
          markup: [{
            tagName: 'circle',
            selector: 'portBody'
          }]
        },
        'out': {
          position: { name: 'right' },
          attrs: {
            portBody: {
              magnet: true,
              r: 6,
              fill: '#ffffff',
              stroke: '#525252',
              strokeWidth: 2
            }
          },
          markup: [{
            tagName: 'circle',
            selector: 'portBody'
          }]
        }
      },
      items: [
        { id: 'in', group: 'in' },
        { id: 'out', group: 'out' }
      ]
    }
  }
}

// Create a link between process nodes
function createProcessLink(source: string, target: string, sourcePort = 'out', targetPort = 'in'): GraphCell {
  return {
    id: `${source}-${target}`,
    type: 'standard.Link',
    source: { id: source, port: sourcePort },
    target: { id: target, port: targetPort },
    attrs: {
      line: {
        stroke: '#525252',
        strokeWidth: 2,
        targetMarker: {
          name: 'block',
          size: 8
        }
      }
    }
  }
}

/**
 * Generate process graph from product structure graph
 */
export function generateProcessGraph(productGraph: GraphData | null): GraphData {
  if (!productGraph || !productGraph.cells || productGraph.cells.length === 0) {
    return { cells: [] }
  }

  const newCells: GraphCell[] = []
  const demontageShapes = new Map<string, GraphCell>()
  const remontageShapes = new Map<string, GraphCell>()
  
  // Extract shapes and links from product graph
  const originalShapes = productGraph.cells.filter(cell => !cell.source && !cell.target)
  const originalLinks = productGraph.cells.filter(cell => cell.source && cell.target)
  
  // Build adjacency lists for the graph structure
  const outgoingLinks = new Map<string, Set<string>>() // shape -> shapes it connects to
  const incomingLinks = new Map<string, Set<string>>() // shape -> shapes that connect to it
  
  originalLinks.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    
    if (!outgoingLinks.has(sourceId)) {
      outgoingLinks.set(sourceId, new Set())
    }
    outgoingLinks.get(sourceId)!.add(targetId)
    
    if (!incomingLinks.has(targetId)) {
      incomingLinks.set(targetId, new Set())
    }
    incomingLinks.get(targetId)!.add(sourceId)
  })
  
  // Step 1: Create Demontage shapes (light gray) with same positioning as original
  const demontageColor = '#e5e5e5' // Light gray
  const HORIZONTAL_GAP = 10 // Gap between demontage and remontage phases
  
  // Calculate bounding box of original shapes for positioning
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  
  originalShapes.forEach(shape => {
    if (shape.position) {
      minX = Math.min(minX, shape.position.x)
      minY = Math.min(minY, shape.position.y)
      maxX = Math.max(maxX, shape.position.x + (shape.size?.width || 120))
      maxY = Math.max(maxY, shape.position.y + (shape.size?.height || 80))
    }
  })
  
  // If no positions found, use defaults
  if (minX === Infinity) {
    minX = 200
    minY = 100
    maxX = 500
    maxY = 400
  }
  
  const demontageBBox = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
  
  originalShapes.forEach(shape => {
    const demontageId = `demontage-${shape.id}`
    const label = shape.baugruppentyp 
      ? `Demontage-${shape.baugruppentyp.bezeichnung}`
      : `Demontage-${shape.id}`
    
    // Use same position as original shape
    const x = shape.position?.x || 200
    const y = shape.position?.y || 100
    
    const demontageShape = createProcessShape(
      demontageId,
      label,
      x,
      y,
      demontageColor,
      shape.baugruppentyp,
      'demontage'
    )
    
    demontageShapes.set(shape.id, demontageShape)
    newCells.push(demontageShape)
  })
  
  // Step 2: Create Remontage shapes (dark gray) - mirror vertically at right edge of demontage bbox
  const remontageColor = '#9ca3af' // Dark gray
  const mirrorX = demontageBBox.x + demontageBBox.width + HORIZONTAL_GAP
  
  originalShapes.forEach(shape => {
    const remontageId = `remontage-${shape.id}`
    const label = shape.baugruppentyp 
      ? `Remontage-${shape.baugruppentyp.bezeichnung}`
      : `Remontage-${shape.id}`
    
    // Mirror position: reflect X coordinate around the mirror line
    const originalX = shape.position?.x || 200
    const distanceFromLeft = originalX - demontageBBox.x
    // Mirror the position: new X = mirrorX + (bbox.width - distance from left)
    const mirroredX = mirrorX + (demontageBBox.width - distanceFromLeft)
    const y = shape.position?.y || 100 // Keep Y position the same
    
    const remontageShape = createProcessShape(
      remontageId,
      label,
      mirroredX,
      y,
      remontageColor,
      shape.baugruppentyp,
      'remontage'
    )
    
    remontageShapes.set(shape.id, remontageShape)
    newCells.push(remontageShape)
  })
  
  // Calculate remontage bbox for positioning Qualitätsprüfung
  const remontageBBox = {
    x: mirrorX,
    y: demontageBBox.y,
    width: demontageBBox.width,
    height: demontageBBox.height
  }
  
  // Step 3: Create links within demontage subgraph (copy original structure)
  originalLinks.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    
    const demontageSource = demontageShapes.get(sourceId)
    const demontageTarget = demontageShapes.get(targetId)
    
    if (demontageSource && demontageTarget) {
      newCells.push(createProcessLink(demontageSource.id, demontageTarget.id))
    }
  })
  
  // Step 4: Create inverted links within remontage subgraph
  originalLinks.forEach(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id
    const targetId = typeof link.target === 'string' ? link.target : link.target.id
    
    const remontageSource = remontageShapes.get(sourceId)
    const remontageTarget = remontageShapes.get(targetId)
    
    if (remontageSource && remontageTarget) {
      // Invert the connection: target becomes source
      newCells.push(createProcessLink(remontageTarget.id, remontageSource.id))
    }
  })
  
  // Step 5: Connect demontage leaves to remontage roots
  originalShapes.forEach(shape => {
    const shapeId = shape.id
    const hasOutgoing = outgoingLinks.has(shapeId) && outgoingLinks.get(shapeId)!.size > 0
    
    // If shape has no outgoing links in original (it's a leaf), connect to its remontage counterpart
    if (!hasOutgoing) {
      const demontageShape = demontageShapes.get(shapeId)
      const remontageShape = remontageShapes.get(shapeId)
      
      if (demontageShape && remontageShape) {
        newCells.push(createProcessLink(demontageShape.id, remontageShape.id))
      }
    }
  })
  
  // Step 6: Add Inspektion at the beginning (green) - centered vertically on demontage bbox
  const inspektionId = 'inspektion'
  const PHASE_GAP = 100 // Gap between phases
  
  const inspektionShape = createProcessShape(
    inspektionId,
    'Inspektion',
    demontageBBox.x - PHASE_GAP - 120, // Position left of demontage phase (120 is shape width)
    demontageBBox.y + demontageBBox.height / 2 - 60, // Center vertically (60 is half of shape height)
    '#10b981' // Green
  )
  newCells.push(inspektionShape)
  
  // Connect Inspektion to all demontage shapes with no incoming links
  originalShapes.forEach(shape => {
    const shapeId = shape.id
    const hasIncoming = incomingLinks.has(shapeId) && incomingLinks.get(shapeId)!.size > 0
    
    if (!hasIncoming) {
      const demontageShape = demontageShapes.get(shapeId)
      if (demontageShape) {
        newCells.push(createProcessLink(inspektionId, demontageShape.id))
      }
    }
  })
  
  // Step 7: Add Qualitätsprüfung at the end (green) - centered vertically on remontage bbox
  const qualitaetspruefungId = 'qualitaetspruefung'
  const qualitaetspruefungShape = createProcessShape(
    qualitaetspruefungId,
    'Qualitätsprüfung',
    remontageBBox.x + remontageBBox.width + PHASE_GAP + 120, // Position right of remontage phase with PHASE_GAP. (120 is shape width)
    remontageBBox.y + remontageBBox.height / 2 - 60, // Center vertically (60 is half of shape height)
    '#10b981' // Green
  )
  newCells.push(qualitaetspruefungShape)
  
  // Connect all remontage shapes with no outgoing links (in inverted structure) to Qualitätsprüfung
  originalShapes.forEach(shape => {
    const shapeId = shape.id
    const hasIncoming = incomingLinks.has(shapeId) && incomingLinks.get(shapeId)!.size > 0
    
    // In remontage, shapes that originally had no incoming become the final nodes
    if (!hasIncoming) {
      const remontageShape = remontageShapes.get(shapeId)
      if (remontageShape) {
        newCells.push(createProcessLink(remontageShape.id, qualitaetspruefungId))
      }
    }
  })
  
  return { cells: newCells }
}

/**
 * Layout the process graph for better visualization
 */
export function layoutProcessGraph(graph: joint.dia.Graph): void {
  // This function can be used to apply automatic layout if needed
  // For now, we're using manual positioning in generateProcessGraph
}