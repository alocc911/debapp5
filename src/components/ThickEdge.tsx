import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from 'reactflow'

type Kind = 'supports' | 'evidence-of' | 'attacks' | 'agrees-with' | string

function colorFor(kind: Kind) {
  switch (kind) {
    case 'supports': return '#1d4ed8'
    case 'evidence-of': return '#b45309'
    case 'attacks': return '#be185d'
    case 'agrees-with': return '#0e7490'
    default: return '#64748b'
  }
}
function labelFor(kind: Kind) {
  switch (kind) {
    case 'supports': return 'Supports'
    case 'evidence-of': return 'Evidence of'
    case 'attacks': return 'Counter'
    case 'agrees-with': return 'Agrees'
    default: return ''
  }
}

export default function ThickEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props
  const kind: Kind = (data?.kind as Kind) || 'supports'
  const active: boolean = !!data?.active
  const dimmed: boolean = !!data?.dimmed

  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition
  })

  const stroke = colorFor(kind)
  const w = active ? 10 : 5
  const opacity = dimmed && !active ? 0.25 : 1
  const cls = 'edge-path' + (active ? ' active' : '')

  return (
    <g>
      <BaseEdge id={id} path={path}
        style={{ stroke, strokeWidth: w, pointerEvents: 'stroke', opacity }}
        className={cls}
      />
      <EdgeLabelRenderer>
        <div
          className="edge-label"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'auto',
            opacity
          }}
        >
          {labelFor(kind)}
        </div>
      </EdgeLabelRenderer>
    </g>
  )
}
