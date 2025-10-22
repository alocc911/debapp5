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
  strengthType?: 'Type 1' | 'Type 2' | 'Type 3' | 'Type 4'
  firstMention?: string            // NEW: optional timestamp shown on card
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

// Add this helper function after other functions but before the component
function renderBody(text: string, terms?: string[], onLinkClick?: (id: string) => void) {
  if (!text) return null;
  const parts = text.split(/(\[\[[^\]]+\]\])/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      const [id, label] = inner.split('|');
      return (
        <button 
          key={i}
          className="node-link"
          onClick={(e) => {
            e.stopPropagation();
            onLinkClick?.(id);
          }}
        >
          {label || id}
        </button>
      );
    }
    return highlight(part, terms);
  });
}

export default function NodeCard({ id, data }: NodeProps<Data>) {
  const store = useGraphStore()
  // Add state for inline editing
  const [isEditingBody, setIsEditingBody] = React.useState(false)
  const [editBodyText, setEditBodyText] = React.useState(data.body || '')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const bodyRef = React.useRef<HTMLParagraphElement>(null);
  const [bodyHeight, setBodyHeight] = React.useState<number>(0);

  // Add effect to capture initial body height
  React.useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.offsetHeight);
    }
  }, [data.body]);

  const participants = store.participants
  const participantIds = participants.map(p => p.id)
  const participant = participants.find(p => p.id === data.participantId)
  const speakerName = participant?.name || data.participantId

  // NEW: reattach highlight state from store
  const eligibleTargets = store.eligibleAttachTargets || []
  const reparentSelectedId = store.reparentTargetId || ''
  const isEligible = eligibleTargets.includes(id)
  const isAttachSelected = reparentSelectedId === id

  const speakerCol = participantColor(data.participantId, participantIds)
  const kindCol = kindColor(data.kind)

  const borderStyle: React.CSSProperties = {
    borderTop: `8px solid ${speakerCol}`,
    borderRight: `8px solid ${speakerCol}`,
    borderBottom: `8px solid ${kindCol}`,
    borderLeft: `8px solid ${kindCol}`,
    opacity: data.dimmed && !data.edgeActive ? 0.25 : 1
  }

  // When this node is clicked while there is an active selection elsewhere and
  // this node is eligible, interpret the click as "select this as reparent/target".
  const onMouseDown = (e: React.MouseEvent) => {
    if (isEligible) {
      e.stopPropagation()
      e.preventDefault()
      store.setReparentTargetId(id)

      // Get the currently open dropdown and programmatically select this value
      const activeForm = document.activeElement as HTMLSelectElement
      if (activeForm?.tagName === 'SELECT') {
        activeForm.value = id
        // Trigger change event
        activeForm.dispatchEvent(new Event('change', { bubbles: true }))
        // Keep focus
        setTimeout(() => activeForm.focus(), 0)
      }
      return
    }
    // otherwise let React Flow/App handle selection as usual
  }

  const handleLinkClick = (targetId: string) => {
    store.setSelectedNodeId(targetId);
    store.setLinkHighlight({ sourceId: id, targetId });
  };

  const copyLinkText = (id: string) => {
    const template = `[[${id}|${data.title || 'Untitled'}]]`;
    navigator.clipboard.writeText(template);
  };

  // Add effect to handle deselection
  React.useEffect(() => {
    if (isEditingBody && store.selectedNodeId !== id) {
      handleBodySave();
    }
  }, [store.selectedNodeId]);

  const handleBodyDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditingBody) {
      setIsEditingBody(true);
      setEditBodyText(data.body || '');
      // Focus and select all text after render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.select();
        }
      }, 0);
    }
  };

  const handleBodySave = () => {
    store.updateNode(id, { body: editBodyText });
    setIsEditingBody(false);
  };

  const handleBottomClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.updateNode(id, { 
      collapsed: !data.collapsed,
      selfCollapsed: false 
    });
  };

  return (
    <div
      className={`node-card ${data.edgeActive ? 'edge-on' : ''} ${data.dimmed ? 'dimmed' : ''} 
        ${isEligible ? 'eligible-target' : ''} ${isAttachSelected ? 'eligible-selected' : ''}`}
      style={borderStyle}
      onMouseDown={onMouseDown}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: .0, width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: .0, width: 10, height: 10 }} />

      <div className="node-meta">
        {/* type badge first (left), then speaker */}
        <span className={kindBadgeClass(data.kind)}>{data.kind}</span>
        <span className="speaker-badge" style={{ background: speakerCol }}>{speakerName}</span>
        
        {(data.kind === 'Argument' || data.kind === 'Counter' || data.kind === 'Evidence') && data.strengthType && (
          <span
            className={`strength-badge ${'strength-' + data.strengthType.replace(/\s+/g,'').toLowerCase()}`}
            title={data.strengthType}
          >
            {data.strengthType}
          </span>
        )}
        {data.collapsed && <span className="small" style={{ marginLeft: 'auto', opacity: .7 }}>(collapsed)</span>}
        {data.hit && <span className="small" style={{ marginLeft: 'auto', color: '#b45309', fontWeight: 700 }}>match</span>}
        {/* Add nodeId display after badges */}
        {store.selectedNodeId === id && (
          <span 
            className="id-badge" 
            onClick={(e) => {
              e.stopPropagation();
              copyLinkText(id);
            }}
            title="Click to copy link template"
            style={{ cursor: 'pointer' }}
          >
            Copy Link
          </span>
        )}
      </div>

      <h3 className={data.kind === 'Argument Summary' ? 'summary' : undefined}>
        {highlight(data.title || 'Untitled', data.searchTerms)}
      </h3>

      {/* NEW: first mention pill (optional) */}
      {data.firstMention && (
        <div className="first-mention" title="First time this statement was mentioned">
          First mention: {data.firstMention}
        </div>
      )}

      {data.body && !isEditingBody && (
        <p 
          ref={bodyRef}
          className="body-text" 
          style={{ 
            whiteSpace: 'pre-line',
            minHeight: '80px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}
          onDoubleClick={handleBodyDoubleClick}
        >
          {renderBody(data.body, data.searchTerms, handleLinkClick)}
        </p>
      )}
      
      {isEditingBody && (
        <div className="inline-edit-container">
          <textarea
            ref={textareaRef}
            value={editBodyText}
            onChange={e => setEditBodyText(e.target.value)}
            className="inline-edit-textarea"
            style={{
              height: Math.max(bodyHeight, 80),
              maxHeight: '300px',
              width: '100%',
              resize: 'none',
              overflowY: 'auto'
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setIsEditingBody(false);
                setEditBodyText(data.body || '');
              }
            }}
          />
          <div className="edit-buttons">
            <button 
              className="secondary"
              onClick={() => {
                setIsEditingBody(false);
                setEditBodyText(data.body || '');
              }}
            >
              Cancel
            </button>
            <button onClick={handleBodySave}>Save</button>
          </div>
        </div>
      )}

      <div 
        className="collapse-region bottom"
        onClick={handleBottomClick}
        title="Click to collapse/expand children"
      />
    </div>
  )
}
