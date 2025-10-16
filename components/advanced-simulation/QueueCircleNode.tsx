'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import Link from 'next/link'
import { Database } from 'lucide-react'

interface QueueCircleNodeProps {
  data: {
    queueType?: 'preAcceptance' | 'preInspection' | 'postInspection'
    label?: string
  }
  id: string
}

export const QueueCircleNode = memo(({ data, id }: QueueCircleNodeProps) => {
  const hasQueue = !!data.queueType

  if (!hasQueue) {
    // Default circle without queue functionality
    return (
      <>
        <Handle type="target" position={Position.Left} />
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {data.label || ''}
        </div>
        <Handle type="source" position={Position.Right} />
      </>
    )
  }

  // Queue-enabled circle with link
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Link
        href={`/simulation/queues?highlight=${data.queueType}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full"
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
          }}
          className="hover:scale-110 hover:shadow-lg"
          title={`Click to view ${data.queueType} queue`}
        >
          <Database className="w-4 h-4 text-blue-700" />
        </div>
      </Link>
      <Handle type="source" position={Position.Right} />
    </>
  )
})

QueueCircleNode.displayName = 'QueueCircleNode'
