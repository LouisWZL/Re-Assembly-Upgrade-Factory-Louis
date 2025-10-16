/**
 * Python Optimization Integration
 *
 * This module will handle calling Python scripts to optimize order sequences.
 * The Python scripts will receive order data and return an optimized sequence.
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface OrderData {
  orderId: string
  customerName: string
  productVariant: string
  processTimes?: any
  possibleSequence?: any
  // Add more fields as needed by Python scripts
}

/**
 * Call a Python optimization script
 * @param scriptPath - Path to the Python script
 * @param orders - Array of orders to optimize
 * @returns Optimized array of order IDs in the sequence they should be processed
 */
export async function callPythonOptimizer(
  scriptPath: string,
  orders: OrderData[]
): Promise<{ success: boolean; orderIds?: string[]; error?: string }> {
  try {
    // Prepare input data for Python script
    const inputData = JSON.stringify({
      orders: orders.map(o => ({
        orderId: o.orderId,
        customerName: o.customerName,
        productVariant: o.productVariant,
        processTimes: o.processTimes,
        possibleSequence: o.possibleSequence
      }))
    })

    // Call Python script
    // The script should:
    // 1. Read JSON from stdin or a temp file
    // 2. Optimize the order sequence
    // 3. Output JSON with optimized order IDs to stdout

    const { stdout, stderr } = await execAsync(
      `python3 "${scriptPath}"`,
      {
        input: inputData,
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      }
    )

    if (stderr) {
      console.error('Python script stderr:', stderr)
    }

    // Parse Python output
    const result = JSON.parse(stdout)

    if (!result.orderIds || !Array.isArray(result.orderIds)) {
      throw new Error('Python script did not return valid orderIds array')
    }

    return {
      success: true,
      orderIds: result.orderIds
    }
  } catch (error) {
    console.error('Error calling Python optimizer:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Example Python script format:
 *
 * ```python
 * import json
 * import sys
 *
 * # Read input
 * input_data = json.loads(sys.stdin.read())
 * orders = input_data['orders']
 *
 * # Optimize sequence (example: sort by customer name)
 * optimized_orders = sorted(orders, key=lambda x: x['customerName'])
 * order_ids = [o['orderId'] for o in optimized_orders]
 *
 * # Output result
 * result = {'orderIds': order_ids}
 * print(json.dumps(result))
 * ```
 */
