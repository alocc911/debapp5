import React from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useGraphStore } from '../store/useGraphStore'

type Data = {
  id: string
  title: string
  body?: string
  kind: 'Thesis' | 'Argument' | 'Counter' | 'Evidence' | 'Agreement' | 'Argument Summary'
  participantId: string
  collapsed?: boolean
  hit?: boolean
  edgeActive?: boolean
  dimmed?: boolean
  searchTerms?: string[]
}

const PALETTE = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#E69F00',
  '#56B4E9',
  '#CC79A7',
  '#F0E442',
  '#999999',
]

function participantColor(participantId: string, ids: string[]) {
  const idx = Math.max(0, ids.indexOf(participantId))
  return PALETTE[idx % PALETTE.length]
}

function kindColor(kind: Data['kind']) {
  switch (kind) {
    case 'Thesis': return '#60a5fa'
    case 'Argument': return '#a78bfa'
    case 'Argument Summary': return '#86efac' // green tint
    case 'Counter': return '#f472b6'
    case 'Evidence': return '#f59e0b'
    case 'Agreement': return '#22d3ee'
    default: return '#94a3b8'
  }
}

function kindBadgeClass(kind: Data['kind']) {
  switch (kind) {
    case 'Thesis': return 'badge thesis'
    case 'Argument': return 'badge argument'
    case 'Argument Summary': return 'badge summary'
    case 'Counter': return 'badge counter'
    case 'Evidence': return 'badge evidence'
    case 'Agreement': return 'badge agreement'
  }
}

function highlight(text: string, terms?: string[]) {
  if (!terms || !terms.length) return <>{text}</>
  try {
    const lower = text.toLowerCase()
    const ranges: Array<[number, number]> = []
    for (const t of terms) {
      if (!t) continue
      let i = 0
      while (true) {
        const pos = lower.indexOf(t.toLowerCase(), i)
        if (pos === -1) break
        ranges.push([pos, pos + t.length])
        i = pos + t.length
      }
    }
    if (!ranges.length) return <>{text}</>
    ranges.sort((a, b) => a[0] - b[0])
    const merged: Array<[number, number]> = []
    for (const [s,e] of ranges) {
      if (!merged.length || s > merged[merged.length-1][1]) merged.push([s,e])
      else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], e)
    }
    const out: React.ReactNode[] = []
    let lastIndex = 0
    merged.forEach(([start, end], idx) => {
      if (start > lastIndex) out.push(<span key={idx+'-t'}>{text.slice(lastIndex, start)}</span>)
      out.push(<mark key={idx+'-m'}>{text.slice(start, end)}</mark>)
      lastIndex = end
    })
    if (lastIndex < text.length) out.push(<span key={lastIndex + '-r'}>{text.slice(lastIndex)}</span>)
    return <>{out}</>
  } catch {
    return <>{text}</>
  }
}

export default function NodeCard({ id, data }: NodeProps<Data>) {
  const store = useGraphStore()
  const participants = store.participants
  const participantIds = participants.map(p => p.id)
  const participant = participants.find(p => p.id === data.participantId)
  const speakerName = participant?.name || data.participantId

  const speakerCol = participantColor(data.participantId, participantIds)
  const kindCol = kindColor(data.kind)

  const borderStyle: React.CSSProperties = {
    borderTop: `8px solid ${speakerCol}`,
    borderRight: `8px solid ${speakerCol}`,
    borderBottom: `8px solid ${kindCol}`,
    borderLeft: `8px solid ${kindCol}`,
    opacity: data.dimmed && !data.edgeActive ? 0.25 : 1
  }

  return (
    <div className={`node-card ${data.edgeActive ? 'edge-on' : ''} ${data.dimmed ? 'dimmed' : ''}`} style={borderStyle}>
      <Handle type="target" position={Position.Top} style={{ opacity: .0, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: .0, width: 10, height: 10 }} />

      <div className="node-meta">
        {/* type badge first (left), then speaker */}
        <span className={kindBadgeClass(data.kind)}>{data.kind}</span>
        <span className="speaker-badge" style={{ background: speakerCol }}>{speakerName}</span>
        {data.collapsed && <span className="small" style={{ marginLeft: 'auto', opacity: .7 }}>(collapsed)</span>}
        {data.hit && <span className="small" style={{ marginLeft: 'auto', color: '#b45309', fontWeight: 700 }}>match</span>}
      </div>

      <h3 className={data.kind === 'Argument Summary' ? 'summary' : undefined}>
        {highlight(data.title || 'Untitled', data.searchTerms)}
      </h3>
      {data.body && <p>{highlight(data.body, data.searchTerms)}</p>}
    </div>
  )
}
