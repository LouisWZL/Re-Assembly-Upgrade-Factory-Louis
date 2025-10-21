import { spawn } from 'child_process'
import path from 'path'

interface RunOptions<TInput> {
  script: string
  payload: TInput
  timeoutMs?: number
}

export async function runPythonOperator<TInput, TOutput>({
  script,
  payload,
  timeoutMs = 30_000,
}: RunOptions<TInput>): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    try {
      const scriptPath = path.isAbsolute(script) ? script : path.join(process.cwd(), script)
      const py = spawn('python3', [scriptPath], { timeout: timeoutMs })

      const input = JSON.stringify(payload)
      let stdout = ''
      let stderr = ''

      py.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      py.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      py.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python exited with code ${code}: ${stderr}`))
          return
        }
        try {
          const parsed = JSON.parse(stdout)
          resolve(parsed as TOutput)
        } catch (error) {
          reject(new Error(`Failed to parse Python output: ${(error as Error).message}`))
        }
      })

      py.on('error', (error) => {
        reject(error)
      })

      py.stdin.write(input)
      py.stdin.end()
    } catch (error) {
      reject(error)
    }
  })
}
