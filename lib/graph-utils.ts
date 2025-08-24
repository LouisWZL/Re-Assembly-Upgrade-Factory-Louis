/**
 * Utility functions for manipulating JointJS graph JSON data
 */

interface GraphCell {
  id: string
  type: string
  attrs?: any
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  source?: { id: string }
  target?: { id: string }
  baugruppentyp?: { id: string; bezeichnung: string }
  [key: string]: any
}

interface GraphData {
  cells: GraphCell[]
}

/**
 * Extract all Baugruppentyp IDs from a graph
 */
export function extractBaugruppentypenFromGraph(graphData: GraphData): string[] {
  if (!graphData || !graphData.cells) return []
  
  const baugruppentypenIds = new Set<string>()
  
  graphData.cells.forEach(cell => {
    // Only process elements (shapes), not links
    if (!cell.source && !cell.target && cell.baugruppentyp?.id) {
      baugruppentypenIds.add(cell.baugruppentyp.id)
    }
  })
  
  return Array.from(baugruppentypenIds)
}

/**
 * Remove a shape and all its connected links from the graph
 */
export function removeShapeFromGraph(
  graphData: GraphData, 
  baugruppentyId: string
): GraphData {
  if (!graphData || !graphData.cells) return graphData
  
  // Find all shape IDs that have this baugruppentyp
  const shapesToRemove = new Set<string>()
  
  graphData.cells.forEach(cell => {
    if (cell.baugruppentyp?.id === baugruppentyId) {
      shapesToRemove.add(cell.id)
    }
  })
  
  // Filter out shapes and their connected links
  const filteredCells = graphData.cells.filter(cell => {
    // Remove the shape itself
    if (shapesToRemove.has(cell.id)) {
      return false
    }
    
    // Remove links connected to the shape
    if (cell.source && shapesToRemove.has(cell.source.id)) {
      return false
    }
    if (cell.target && shapesToRemove.has(cell.target.id)) {
      return false
    }
    
    return true
  })
  
  return {
    ...graphData,
    cells: filteredCells
  }
}

/**
 * Update the label of shapes with a specific Baugruppentyp ID
 */
export function updateShapeInGraph(
  graphData: GraphData,
  baugruppentyId: string,
  newBezeichnung: string
): GraphData {
  if (!graphData || !graphData.cells) return graphData
  
  const updatedCells = graphData.cells.map(cell => {
    // Only update elements with matching baugruppentyp ID
    if (cell.baugruppentyp?.id === baugruppentyId) {
      return {
        ...cell,
        // Update the baugruppentyp bezeichnung
        baugruppentyp: {
          ...cell.baugruppentyp,
          bezeichnung: newBezeichnung
        },
        // Update the label in attrs if it exists
        attrs: {
          ...cell.attrs,
          label: {
            ...cell.attrs?.label,
            text: newBezeichnung
          }
        }
      }
    }
    return cell
  })
  
  return {
    ...graphData,
    cells: updatedCells
  }
}

/**
 * Check if a graph contains a specific Baugruppentyp
 */
export function graphContainsBaugruppentyp(
  graphData: GraphData,
  baugruppentyId: string
): boolean {
  if (!graphData || !graphData.cells) return false
  
  return graphData.cells.some(cell => 
    cell.baugruppentyp?.id === baugruppentyId
  )
}

/**
 * Get all Baugruppentyp data from a graph
 */
export function getBaugruppentypenFromGraph(graphData: GraphData): Array<{ id: string; bezeichnung: string }> {
  if (!graphData || !graphData.cells) return []
  
  const baugruppentypenMap = new Map<string, { id: string; bezeichnung: string }>()
  
  graphData.cells.forEach(cell => {
    if (!cell.source && !cell.target && cell.baugruppentyp) {
      baugruppentypenMap.set(cell.baugruppentyp.id, cell.baugruppentyp)
    }
  })
  
  return Array.from(baugruppentypenMap.values())
}