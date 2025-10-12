/**
 * Utility functions for transforming product graphs to order-specific graphs
 */

import { Baugruppe } from '@prisma/client'

// Define variant types: product variant vs. component variant
type VariantenTyp = 'basic' | 'premium'
type BaugruppeVariantenTyp = 'basic' | 'premium' | 'basicAndPremium'

interface GraphCell {
  id: string
  type: string
  attrs?: any
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  source?: { id: string; port?: string }
  target?: { id: string; port?: string }
  baugruppentyp?: { id: string; bezeichnung: string }
  baugruppe?: { id: string; bezeichnung: string; artikelnummer: string }
  [key: string]: any
}

interface GraphData {
  cells: GraphCell[]
}

interface BaugruppeWithRelations extends Baugruppe {
  baugruppentyp?: {
    id: string
    bezeichnung: string
  } | null
}

/**
 * Get a random condition value between 0 and 100
 */
export function getRandomZustand(): number {
  return Math.floor(Math.random() * 101) // 0 to 100 inclusive
}

/**
 * Get a constrained random condition value that helps achieve a target average
 * @param currentAverage Current average of all generated values
 * @param targetAverage Target average to achieve
 * @param count Number of values already generated
 * @param remaining Number of values still to generate
 */
export function getConstrainedZustand(
  currentSum: number,
  targetAverage: number,
  count: number,
  remaining: number
): number {
  if (remaining === 0) {
    // For the last item, ensure we don't exceed bounds
    const targetSum = targetAverage * (count + 1)
    const neededValue = targetSum - currentSum
    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, Math.round(neededValue)))
  }
  
  // Calculate what average we need for remaining items
  const targetSum = targetAverage * (count + remaining + 1)
  const neededSum = targetSum - currentSum
  const neededAverage = neededSum / (remaining + 1)
  
  // Ensure neededAverage is within valid bounds
  const clampedNeededAverage = Math.max(0, Math.min(100, neededAverage))
  
  // Add some randomness but bias towards the needed average
  // Use a range of ±20 from the needed average, but strictly within 0-100
  const min = Math.max(0, Math.floor(clampedNeededAverage - 20))
  const max = Math.min(100, Math.ceil(clampedNeededAverage + 20))
  
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Check if a Baugruppe is compatible with a product variant type
 */
export function isBaugruppeCompatibleWithVariant(
  baugruppeVariantenTyp: string | BaugruppeVariantenTyp,
  produktvarianteTyp: VariantenTyp
): boolean {
  if (baugruppeVariantenTyp === 'basicAndPremium') {
    return true // Compatible with both
  }
  return baugruppeVariantenTyp === produktvarianteTyp
}

/**
 * Find compatible Baugruppen for a given Baugruppentyp and variant type
 */
export function findCompatibleBaugruppen(
  baugruppen: BaugruppeWithRelations[],
  baugruppentypId: string,
  variantenTyp: VariantenTyp
): BaugruppeWithRelations[] {
  return baugruppen.filter(bg => 
    bg.baugruppentypId === baugruppentypId &&
    isBaugruppeCompatibleWithVariant(bg.variantenTyp, variantenTyp)
  )
}

/**
 * Get a random element from an array
 */
function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Find a compatible replacement Baugruppe for reassemblies
 * @param currentBaugruppe The current Baugruppe that needs replacement
 * @param allBaugruppen All available Baugruppen in the factory
 * @param variantenTyp The variant type of the order (basic or premium)
 * @returns A randomly selected compatible replacement Baugruppe or undefined
 */
export function findCompatibleReplacementBaugruppe(
  currentBaugruppe: BaugruppeWithRelations,
  allBaugruppen: BaugruppeWithRelations[],
  variantenTyp: VariantenTyp
): BaugruppeWithRelations | undefined {
  // Filter for compatible replacement Baugruppen
  const compatibleBaugruppen = allBaugruppen.filter(bg => {
    // Must be of the same Baugruppentyp
    if (bg.baugruppentypId !== currentBaugruppe.baugruppentypId) return false
    
    // Must be compatible with the variant type
    if (!isBaugruppeCompatibleWithVariant(bg.variantenTyp, variantenTyp)) return false
    
    return true
  })
  
  // If there are other compatible Baugruppen, prefer those
  const otherCompatibleBaugruppen = compatibleBaugruppen.filter(bg => bg.id !== currentBaugruppe.id)
  
  // Use other Baugruppen if available, otherwise allow the same Baugruppe
  const candidateBaugruppen = otherCompatibleBaugruppen.length > 0 
    ? otherCompatibleBaugruppen 
    : compatibleBaugruppen
  
  // Return a random compatible Baugruppe
  return getRandomElement(candidateBaugruppen)
}

/**
 * Transform a product graph to an order-specific graph
 * Replaces Baugruppentypen with compatible Baugruppen
 */
export function transformProductGraphToOrderGraph(
  productGraph: GraphData,
  baugruppen: BaugruppeWithRelations[],
  variantenTyp: VariantenTyp,
  constrainedZustandValues?: number[]
): {
  graph: GraphData
  selectedBaugruppen: Array<{ baugruppeId: string; zustand: number }>
  removedNodes: string[]
} {
  if (!productGraph || !productGraph.cells) {
    return { 
      graph: { cells: [] }, 
      selectedBaugruppen: [],
      removedNodes: []
    }
  }

  const newCells: GraphCell[] = []
  const selectedBaugruppen: Array<{ baugruppeId: string; zustand: number }> = []
  const nodesToRemove = new Set<string>()
  const nodeReplacements = new Map<string, string>() // old node id -> new node id
  const removedNodes: string[] = []
  let zustandIndex = 0 // Track which constrained value to use next

  // First pass: Process shapes and determine which to replace or remove
  productGraph.cells.forEach(cell => {
    // Skip links in first pass
    if (cell.source || cell.target) {
      return
    }

    // Process shapes with Baugruppentyp
    if (cell.baugruppentyp) {
      const compatibleBaugruppen = findCompatibleBaugruppen(
        baugruppen,
        cell.baugruppentyp.id,
        variantenTyp
      )

      if (compatibleBaugruppen.length > 0) {
        // Replace with random compatible Baugruppe
        const selectedBaugruppe = getRandomElement(compatibleBaugruppen)!
        // Use constrained zustand value if available, otherwise random
        const zustand = constrainedZustandValues && zustandIndex < constrainedZustandValues.length
          ? constrainedZustandValues[zustandIndex++]
          : getRandomZustand()

        // Create new cell with Baugruppe instead of Baugruppentyp
        const newCell: GraphCell = {
          ...cell,
          baugruppe: {
            id: selectedBaugruppe.id,
            bezeichnung: selectedBaugruppe.bezeichnung,
            artikelnummer: selectedBaugruppe.artikelnummer
          },
          // Remove baugruppentyp
          baugruppentyp: undefined,
          // Update label
          attrs: {
            ...cell.attrs,
            label: {
              ...cell.attrs?.label,
              text: selectedBaugruppe.bezeichnung
            }
          }
        }

        newCells.push(newCell)
        selectedBaugruppen.push({
          baugruppeId: selectedBaugruppe.id,
          zustand
        })

        // Keep same node ID for link preservation
        nodeReplacements.set(cell.id, cell.id)
      } else {
        // No compatible Baugruppe found - mark for removal
        nodesToRemove.add(cell.id)
        removedNodes.push(cell.id)
      }
    } else {
      // Keep other shapes as-is
      newCells.push(cell)
    }
  })

  // Build adjacency lists for the graph
  const incomingLinks = new Map<string, Set<string>>() // node -> set of nodes that connect TO it
  const outgoingLinks = new Map<string, Set<string>>() // node -> set of nodes it connects TO
  
  // Build the adjacency lists from all links
  productGraph.cells.forEach(cell => {
    if (cell.source && cell.target) {
      // Extract node IDs (handle both direct ID and port-based connections)
      const sourceId = typeof cell.source === 'string' ? cell.source : cell.source.id
      const targetId = typeof cell.target === 'string' ? cell.target : cell.target.id
      
      // Add to outgoing links
      if (!outgoingLinks.has(sourceId)) {
        outgoingLinks.set(sourceId, new Set())
      }
      outgoingLinks.get(sourceId)!.add(targetId)
      
      // Add to incoming links
      if (!incomingLinks.has(targetId)) {
        incomingLinks.set(targetId, new Set())
      }
      incomingLinks.get(targetId)!.add(sourceId)
    }
  })

  // Second pass: Process links and handle removed nodes
  const processedLinks = new Set<string>()
  
  // For each removed node, connect its predecessors to its successors
  nodesToRemove.forEach(removedNodeId => {
    const predecessors = incomingLinks.get(removedNodeId) || new Set()
    const successors = outgoingLinks.get(removedNodeId) || new Set()
    
    // Create new links between all predecessors and successors
    predecessors.forEach(predId => {
      // Skip if predecessor is also being removed
      if (nodesToRemove.has(predId)) return
      
      successors.forEach(succId => {
        // Skip if successor is also being removed
        if (nodesToRemove.has(succId)) return
        
        const linkKey = `${predId}-${succId}`
        if (!processedLinks.has(linkKey)) {
          newCells.push({
            id: `${predId}-${succId}-reconnected`,
            type: 'standard.Link',
            source: { 
              id: predId,
              port: 'out'  // Connect from the 'out' port
            },
            target: { 
              id: succId,
              port: 'in'   // Connect to the 'in' port
            },
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
          })
          processedLinks.add(linkKey)
        }
      })
    })
  })
  
  // Add all original links that don't involve removed nodes
  productGraph.cells.forEach(cell => {
    if (cell.source && cell.target) {
      // Extract node IDs (handle both direct ID and port-based connections)
      const sourceId = typeof cell.source === 'string' ? cell.source : cell.source.id
      const targetId = typeof cell.target === 'string' ? cell.target : cell.target.id
      const linkKey = `${sourceId}-${targetId}`
      
      // Keep link if neither source nor target is removed
      if (!nodesToRemove.has(sourceId) && !nodesToRemove.has(targetId)) {
        if (!processedLinks.has(linkKey)) {
          newCells.push(cell)
          processedLinks.add(linkKey)
        }
      }
    }
  })

  return {
    graph: { cells: newCells },
    selectedBaugruppen,
    removedNodes
  }
}

/**
 * Create a graph data structure for a product variant based on the product graph
 */
export function createOrderGraphFromProduct(
  produkt: {
    graphData: any
    baugruppentypen?: Array<{ id: string; bezeichnung: string }>
  },
  baugruppen: BaugruppeWithRelations[],
  variantenTyp: VariantenTyp,
  constrainedZustandValues?: number[]
): {
  graphData: any
  baugruppenInstances: Array<{ baugruppeId: string; zustand: number }>
} {
  const productGraph = produkt.graphData as GraphData

  const { graph, selectedBaugruppen } = transformProductGraphToOrderGraph(
    productGraph,
    baugruppen,
    variantenTyp,
    constrainedZustandValues
  )

  return {
    graphData: graph,
    baugruppenInstances: selectedBaugruppen
  }
}

/**
 * Transform a process graph to order-specific process graph with proper coloring
 * @param level - 'baugruppen' replaces Baugruppentypen with BaugruppenInstances, 'baugruppentypen' keeps original
 */
export function transformProcessGraphToOrderGraph(
  processGraph: GraphData,
  baugruppenInstances: Array<{
    id: string
    zustand: number
    reAssemblyTyp?: any
    baugruppe: {
      id: string
      bezeichnung: string
      artikelnummer: string
      variantenTyp: string
      baugruppentyp?: {
        id: string
        bezeichnung: string
      } | null
    }
    austauschBaugruppe?: {
      id: string
      bezeichnung: string
      artikelnummer: string
      variantenTyp: string
      baugruppentyp?: {
        bezeichnung: string
      } | null
    } | null
  }>,
  level: 'baugruppen' | 'baugruppentypen' = 'baugruppen'
): GraphData {
  if (!processGraph || !processGraph.cells || processGraph.cells.length === 0) {
    return { cells: [] }
  }

  const newCells: GraphCell[] = []
  
  // Create mapping from baugruppentyp to baugruppeninstance
  const baugruppentypToInstance = new Map<string, typeof baugruppenInstances[0]>()
  baugruppenInstances.forEach(instance => {
    if (instance.baugruppe.baugruppentyp) {
      baugruppentypToInstance.set(instance.baugruppe.baugruppentyp.id, instance)
    }
  })

  // Process each cell
  processGraph.cells.forEach(cell => {
    // Handle links - copy as is
    if (cell.source || cell.target) {
      newCells.push({
        ...cell,
        attrs: {
          ...cell.attrs,
          line: {
            ...cell.attrs?.line,
            stroke: '#000000',
            strokeWidth: 2
          }
        }
      })
      return
    }

    // Handle shapes
    const newCell: GraphCell = { ...cell }
    
    // Default colors (will be overridden based on context)
    newCell.attrs = {
      ...cell.attrs,
      body: {
        ...cell.attrs?.body,
        fill: '#1a48a5',
        fillOpacity: 1,
        stroke: '#1a48a5',
        strokeWidth: 2
      },
      label: {
        ...cell.attrs?.label,
        fill: '#ffffff',
        fontSize: 12,
        fontWeight: 'bold'
      }
    }

    // If this shape has a baugruppentyp
    if (cell.baugruppentyp) {
      const instance = baugruppentypToInstance.get(cell.baugruppentyp.id)
      
      if (instance) {
        if (level === 'baugruppen') {
          // Remove baugruppentyp and add baugruppeninstance reference
          delete newCell.baugruppentyp
          
          newCell.baugruppenInstance = {
            id: instance.id,
            baugruppeId: instance.baugruppe.id,
            bezeichnung: instance.baugruppe.bezeichnung,
            artikelnummer: instance.baugruppe.artikelnummer,
            zustand: instance.zustand,
            reAssemblyTyp: instance.reAssemblyTyp
          }
          
          // Update label based on processType
          const processType = (cell as any).processType
          if (processType === 'demontage') {
            newCell.attrs.label.text = `Demontage-${instance.baugruppe.bezeichnung}`
          } else if (processType === 'remontage') {
            newCell.attrs.label.text = `Remontage-${instance.baugruppe.bezeichnung}`
          }
        } else {
          // For baugruppentypen level, keep the baugruppentyp but add instance info for coloring
          newCell.baugruppenInstance = {
            id: instance.id,
            reAssemblyTyp: instance.reAssemblyTyp
          }
        }
      }
    }
    
    // Special handling for Inspektion and Qualitätsprüfung
    if (cell.id === 'inspektion' || cell.id === 'qualitaetspruefung') {
      newCell.attrs.body.fill = '#1a48a5'
      newCell.attrs.label.fill = '#ffffff'
    }
    
    newCells.push(newCell)
  })

  return { cells: newCells }
}


/**
 * Generate all possible sequences through the process graph
 * to demontage and remontage all ReAssembly components
 * @param level - 'baugruppen' uses Baugruppen names, 'baugruppentypen' uses Baugruppentyp names
 */
export function generateProcessSequences(
  processGraph: GraphData,
  baugruppenInstances: Array<{
    id: string
    reAssemblyTyp?: string | null
    baugruppe: {
      bezeichnung: string
      baugruppentyp?: {
        bezeichnung: string
      } | null
    }
  }>,
  level: 'baugruppen' | 'baugruppentypen' = 'baugruppen'
): { sequences: Array<{ id: string; steps: string[]; totalSteps: number; demontageSteps: number; remontageSteps: number }> } {
  if (!processGraph || !processGraph.cells || processGraph.cells.length === 0) {
    return { sequences: [] }
  }

  // Build graph structure
  const nodes = new Map<string, any>()
  const edges = new Map<string, Set<string>>() // source -> targets
  const reverseEdges = new Map<string, Set<string>>() // target -> sources
  const demontageNodes = new Map<string, any>()
  const remontageNodes = new Map<string, any>()
  const reassemblyDemontageNodes = new Set<string>()
  
  // Process all cells
  processGraph.cells.forEach(cell => {
    if (!cell.source && !cell.target) {
      // It's a node
      nodes.set(cell.id, cell)
      
      // Categorize by process type
      if ((cell as any).processType === 'demontage') {
        demontageNodes.set(cell.id, cell)
        
        // Check if this is a reassembly node
        if (cell.baugruppenInstance && baugruppenInstances) {
          const instance = baugruppenInstances.find(
            bi => bi.id === cell.baugruppenInstance.id
          )
          if (instance && instance.reAssemblyTyp) {
            reassemblyDemontageNodes.add(cell.id)
          }
        }
      } else if ((cell as any).processType === 'remontage') {
        remontageNodes.set(cell.id, cell)
      }
    } else if (cell.source && cell.target) {
      // It's an edge
      const sourceId = typeof cell.source === 'object' ? cell.source.id : cell.source
      const targetId = typeof cell.target === 'object' ? cell.target.id : cell.target
      
      if (!edges.has(sourceId)) {
        edges.set(sourceId, new Set())
      }
      edges.get(sourceId)!.add(targetId)
      
      if (!reverseEdges.has(targetId)) {
        reverseEdges.set(targetId, new Set())
      }
      reverseEdges.get(targetId)!.add(sourceId)
    }
  })
  
  // Find all nodes that MUST be visited (predecessors of reassembly nodes)
  const requiredDemontageNodes = new Set<string>()
  
  // Add all reassembly nodes as required
  reassemblyDemontageNodes.forEach(nodeId => {
    requiredDemontageNodes.add(nodeId)
  })
  
  // Find all predecessors of reassembly nodes (these must be demontaged)
  function findAllPredecessors(nodeId: string, visited: Set<string> = new Set()): Set<string> {
    if (visited.has(nodeId)) return visited
    visited.add(nodeId)
    
    const predecessors = reverseEdges.get(nodeId) || new Set()
    predecessors.forEach(pred => {
      if (demontageNodes.has(pred) && !visited.has(pred)) {
        findAllPredecessors(pred, visited)
      }
    })
    
    return visited
  }
  
  // Collect all required predecessors for each reassembly node
  reassemblyDemontageNodes.forEach(reassemblyId => {
    const allPredecessors = findAllPredecessors(reassemblyId)
    allPredecessors.forEach(pred => {
      if (pred !== 'inspektion') { // Don't add Inspektion to required nodes
        requiredDemontageNodes.add(pred)
      }
    })
  })
  
  // Find all valid demontage sequences using DFS with backtracking
  const sequences: string[][] = []
  const sequenceHashes = new Set<string>() // Track unique sequences to avoid duplicates
  const maxSequences = 100 // Limit to prevent performance issues
  
  // Helper function to create a hash of a sequence for duplicate detection
  function getSequenceHash(path: string[]): string {
    return path.join('->')
  }
  
  function findDemontageSequences(
    current: string,
    visited: Set<string>,
    path: string[],
    remainingReassembly: Set<string>
  ) {
    // Stop if we've found enough sequences
    if (sequences.length >= maxSequences) {
      return
    }
    
    // If all reassembly nodes are visited, we have a valid sequence
    if (remainingReassembly.size === 0) {
      const sequenceHash = getSequenceHash(path)
      // Only add if this sequence is unique
      if (!sequenceHashes.has(sequenceHash)) {
        sequenceHashes.add(sequenceHash)
        sequences.push([...path])
      }
      return
    }
    
    // Get possible next nodes
    const nextNodes = edges.get(current) || new Set()
    
    // First, try to visit unvisited nodes directly accessible from current
    for (const next of nextNodes) {
      // Skip if not a demontage node
      if (!demontageNodes.has(next)) {
        continue
      }
      
      // Skip if this node is not required (not a predecessor of any reassembly node)
      if (!requiredDemontageNodes.has(next)) {
        continue
      }
      
      // Check if all predecessors have been visited
      const predecessors = reverseEdges.get(next) || new Set()
      let canVisit = true
      for (const pred of predecessors) {
        if (demontageNodes.has(pred) && requiredDemontageNodes.has(pred) && !visited.has(pred)) {
          canVisit = false
          break
        }
      }
      
      if (canVisit && !visited.has(next)) {
        // Visit this node
        visited.add(next)
        path.push(next)
        
        // Update remaining reassembly nodes
        const newRemaining = new Set(remainingReassembly)
        if (reassemblyDemontageNodes.has(next)) {
          newRemaining.delete(next)
        }
        
        // Recursively explore
        findDemontageSequences(next, visited, path, newRemaining)
        
        // Backtrack
        path.pop()
        visited.delete(next)
      }
    }
    
    // If we still have remaining reassembly nodes and can't reach them directly,
    // we need to explore from already visited nodes (without re-demontaging them)
    if (remainingReassembly.size > 0) {
      // Try to continue from any visited node that has unexplored paths
      for (const visitedNode of visited) {
        if (visitedNode === current) continue // Skip current node
        
        const visitedNextNodes = edges.get(visitedNode) || new Set()
        
        for (const next of visitedNextNodes) {
          // Skip if not a demontage node
          if (!demontageNodes.has(next)) {
            continue
          }
          
          // Skip if this node is not required
          if (!requiredDemontageNodes.has(next)) {
            continue
          }
          
          // Check if all predecessors have been visited
          const predecessors = reverseEdges.get(next) || new Set()
          let canVisit = true
          for (const pred of predecessors) {
            if (demontageNodes.has(pred) && requiredDemontageNodes.has(pred) && !visited.has(pred)) {
              canVisit = false
              break
            }
          }
          
          if (canVisit && !visited.has(next)) {
            // We can reach this unvisited node from a previously visited node
            // This represents "going back" to that visited node without re-demontaging
            visited.add(next)
            path.push(next)
            
            // Update remaining reassembly nodes
            const newRemaining = new Set(remainingReassembly)
            if (reassemblyDemontageNodes.has(next)) {
              newRemaining.delete(next)
            }
            
            // Recursively explore from this new node
            findDemontageSequences(next, visited, path, newRemaining)
            
            // Backtrack
            path.pop()
            visited.delete(next)
          }
        }
      }
    }
  }
  
  // Start DFS from Inspektion
  const visited = new Set<string>(['inspektion'])
  findDemontageSequences('inspektion', visited, ['inspektion'], reassemblyDemontageNodes)
  
  // Generate all possible remontage sequences (reverse of all demontage sequences)
  const allDemontageSequences = sequences.map(seq => seq.slice(1)) // Remove Inspektion from each
  const allRemontageOptions: string[][] = []
  
  // Create reverse of each demontage sequence as a remontage option
  allDemontageSequences.forEach(demontageSeq => {
    const remontageSeq = [...demontageSeq].reverse()
    allRemontageOptions.push(remontageSeq)
  })
  
  // Create cartesian product: each demontage can be paired with each remontage option
  const finalSequences: Array<{ id: string; steps: string[]; totalSteps: number; demontageSteps: number; remontageSteps: number }> = []
  let sequenceCounter = 0
  
  allDemontageSequences.forEach((demontageOnly, demontageIndex) => {
    allRemontageOptions.forEach((remontageOption, remontageIndex) => {
      // For remontage, we only need to remontage the ReAssembly nodes and their successors
      // Find which nodes need to be remontaged
      const remontageRequired = new Set<string>()
      
      // Add all reassembly nodes from the remontage option (they need to be remontaged)
      remontageOption.forEach(nodeId => {
        if (reassemblyDemontageNodes.has(nodeId)) {
          remontageRequired.add(nodeId)
        }
      })
      
      // Find all successors of reassembly nodes in the remontage graph
      function findAllSuccessors(nodeId: string, visited: Set<string> = new Set()): Set<string> {
        const remontageId = nodeId.replace('demontage-', 'remontage-')
        if (visited.has(remontageId)) return visited
        visited.add(remontageId)
        
        const successors = edges.get(remontageId) || new Set()
        successors.forEach(succ => {
          if (remontageNodes.has(succ) && !visited.has(succ)) {
            findAllSuccessors(succ.replace('remontage-', 'demontage-'), visited)
          }
        })
        
        return visited
      }
      
      // Collect all required remontage nodes
      const remontageNodeIds = new Set<string>()
      remontageRequired.forEach(demontageNodeId => {
        const remontageId = demontageNodeId.replace('demontage-', 'remontage-')
        if (remontageNodes.has(remontageId)) {
          remontageNodeIds.add(demontageNodeId)
          // Also add all successors in remontage graph
          const successors = findAllSuccessors(demontageNodeId)
          successors.forEach(succId => {
            const demontageEquivalent = succId.replace('remontage-', 'demontage-')
            if (remontageOption.includes(demontageEquivalent)) {
              remontageNodeIds.add(demontageEquivalent)
            }
          })
        }
      })
      
      // Create remontage sequence from only the required nodes (already in correct order from remontageOption)
      const remontageSeq = remontageOption.filter(nodeId => remontageNodeIds.has(nodeId))
      
      // Map node IDs to readable names
      const steps: string[] = []
      
      // Add Inspektion
      steps.push('I')
      
      // Add demontage steps
      demontageOnly.forEach(nodeId => {
        const node = nodes.get(nodeId)
        if (node && node.attrs && node.attrs.label && node.attrs.label.text) {
          // Extract the name without "Demontage-" prefix
          let label = node.attrs.label.text.replace('Demontage-', '')
          
          // For baugruppentypen level, use the baugruppentyp name if available
          if (level === 'baugruppentypen' && node.baugruppentyp) {
            label = node.baugruppentyp.bezeichnung
          } else if (level === 'baugruppentypen' && node.baugruppenInstance) {
            // Find the baugruppentyp from the instance
            const instance = baugruppenInstances.find(bi => bi.id === node.baugruppenInstance.id)
            if (instance && instance.baugruppe.baugruppentyp) {
              label = instance.baugruppe.baugruppentyp.bezeichnung
            }
          }
          
          steps.push(label)
        } else {
          steps.push(nodeId)
        }
      })
      
      // Add separator
      steps.push('×')
      
      // Add remontage steps
      remontageSeq.forEach(nodeId => {
        // Find corresponding remontage node
        const demontageNode = nodes.get(nodeId)
        if (demontageNode) {
          // Convert demontage ID to remontage ID
          const remontageId = nodeId.replace('demontage-', 'remontage-')
          const remontageNode = nodes.get(remontageId)
          
          if (remontageNode && remontageNode.attrs && remontageNode.attrs.label && remontageNode.attrs.label.text) {
            // Extract the name without "Remontage-" prefix
            let label = remontageNode.attrs.label.text.replace('Remontage-', '')
            
            // For baugruppentypen level, use the baugruppentyp name if available
            if (level === 'baugruppentypen' && remontageNode.baugruppentyp) {
              label = remontageNode.baugruppentyp.bezeichnung
            } else if (level === 'baugruppentypen' && remontageNode.baugruppenInstance) {
              // Find the baugruppentyp from the instance
              const instance = baugruppenInstances.find(bi => bi.id === remontageNode.baugruppenInstance.id)
              if (instance && instance.baugruppe.baugruppentyp) {
                label = instance.baugruppe.baugruppentyp.bezeichnung
              }
            }
            
            steps.push(label)
          } else if (demontageNode.attrs && demontageNode.attrs.label && demontageNode.attrs.label.text) {
            // Fallback: use demontage label
            let label = demontageNode.attrs.label.text.replace('Demontage-', '')
            
            // For baugruppentypen level, use the baugruppentyp name if available
            if (level === 'baugruppentypen' && demontageNode.baugruppentyp) {
              label = demontageNode.baugruppentyp.bezeichnung
            } else if (level === 'baugruppentypen' && demontageNode.baugruppenInstance) {
              // Find the baugruppentyp from the instance
              const instance = baugruppenInstances.find(bi => bi.id === demontageNode.baugruppenInstance.id)
              if (instance && instance.baugruppe.baugruppentyp) {
                label = instance.baugruppe.baugruppentyp.bezeichnung
              }
            }
            
            steps.push(label)
          } else {
            steps.push(nodeId)
          }
        }
      })
      
      // Add Qualitätsprüfung
      steps.push('Q')
      
      sequenceCounter++
      finalSequences.push({
        id: `seq-${sequenceCounter}`,
        steps: steps,
        totalSteps: steps.length - 1, // Exclude separator
        demontageSteps: demontageOnly.length,
        remontageSteps: remontageSeq.length
      })
    })
  })
  
  return { sequences: finalSequences }
}
