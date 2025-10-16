'use client'

import React from 'react'
import { Handle, Position } from '@xyflow/react'

type SlotState = { flex: boolean; specialization?: string | null; busy?: boolean }

export type PhaseNodeData = {
  title: string
  queue: number
  totalSlots: number
  busySlots: number
  slots: SlotState[]
}

export function PhaseNode({ data }: { data: PhaseNodeData }) {
  const { title, queue, totalSlots, busySlots, slots } = data
  const util = totalSlots > 0 ? Math.round((busySlots / totalSlots) * 100) : 0

  // Determine if this is a Demontage or Montage node for blue background
  const isDemontageOrMontage = title === 'Demontage' || title === 'Montage'
  const bgColor = isDemontageOrMontage ? 'bg-blue-50' : 'bg-white'

  return (
    <div
      className={`rounded-md shadow-sm ${bgColor} p-3 w-[240px]`}
      style={{
        border: isDemontageOrMontage ? '2px solid #1e40af' : '2px solid #e5e7eb'
      }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border">
          Queue: {queue}
        </div>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-gray-700">
          <span>Auslastung</span>
          <span>{busySlots}/{totalSlots} ({util}%)</span>
        </div>
        <div className="h-2 bg-gray-200 rounded mt-1 overflow-hidden">
          <div className="h-2 bg-blue-600" style={{ width: `${util}%` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1">
        {slots && slots.length > 0 ? (
          slots.map((s, i) => (
            <div
              key={i}
              className={`text-[10px] leading-4 text-center rounded border px-1 py-0.5 truncate ${
                s.busy ? (s.flex ? 'bg-blue-600 text-white border-blue-700' : 'bg-emerald-600 text-white border-emerald-700')
                        : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
              title={s.specialization || (s.flex ? 'flex' : 'rigid')}
            >
              {s.flex ? 'F' : 'R'}
            </div>
          ))
        ) : (
          <div className="col-span-6 text-xs text-gray-500">Keine Slots</div>
        )}
      </div>
    </div>
  )
}

