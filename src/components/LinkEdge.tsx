import React from 'react'
import { BaseEdge, getBezierPath, EdgeProps } from 'reactflow'

export default function LinkEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })

  const active = data?.active
  const dimmed = data?.dimmed

  const stroke = active ? '#0ea5e9' : '#64748b'
  const opacity = dimmed ? 0.25 : 1
  const width = active ? 5 : 3

  return (
    <BaseEdge id={id} path={path} style={{ stroke, strokeWidth: width, opacity, strokeDasharray: '6 6' }} />
  )
}
