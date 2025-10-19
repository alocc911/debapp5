import React from 'react'
import { Handle, Position } from 'reactflow'
import type { DebateNode } from '../graph/types'
import { useGraphStore } from '../store/useGraphStore'

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightParts(text: string, terms: string[]) {
  if (!text) return null
  const clean = (terms || []).filter(t => t.trim().length > 0)
  if (clean.length === 0) return <>{text}</>
  try {
    const pattern = new RegExp(clean.map(escapeRegExp).join('|'), 'ig')
    const out: React.ReactNode[] = []
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (start > lastIndex) out.push(<span key={lastIndex + '-t'}>{text.slice(lastIndex, start)}</span>)
      out.push(<mark key={start + '-m'}>{text.slice(start, end)}</mark>)
      lastIndex = end
    }
    if (lastIndex < text.length) out.push(<span key={lastIndex + '-r'}>{text.slice[lastIndex)}</span>)
    return <>{out}</>
  } catch {
    return <>{text}</>
  }
}

export default function NodeCard(props: { id: string; data: DebateNode['data']; selected?: boolean }) {
  const { id, data } = props
  const participants = useGraphStore(s => s.participants)
  const updateNode = useGraphStore(s => s.updateNode)
  const name = participants.find(p => p.id === data.participantId)?.name ?? data.participantId

  const lc = data.kind.toLowerCase()

  const toggleCollapse = () => updateNode(id, { collapsed: !data.collapsed })

  const classes = ['node-card', lc, data.collapsed ? 'node-collapsed' : '', data.hit ? 'hit' : ''].join(' ')

  return (
    <div className={classes} onClick={toggleCollapse}>
      <div className="node-meta">
        <span className={['badge', lc].join(' ')}>{data.kind}</span>
        <span className="author">Debate Participant: {name}</span>
        {typeof data.relevance === 'number' && (<span className="author">Relevance: {data.relevance}</span>)}
      </div>
      <h3>{highlightParts(data.title || '(untitled)', data.searchTerms || [])}</h3>
      {/* Collapsed now only hides children (handled in App), not the body. */}
      {data.body && <p>{highlightParts(data.body, data.searchTerms || [])}</p>}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
