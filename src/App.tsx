import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Connection, NodeTypes, NodeMouseHandler,
  applyNodeChanges, NodeChange, useReactFlow
} from 'reactflow'

import NodeCard from './components/NodeCard'
import { useGraphStore } from './store/useGraphStore'
import type { DebateNode, DebateEdge } from './graph/types'
import { elkLayout } from './graph/layout'
import './styles.css'

const nodeTypes: NodeTypes = { nodeCard: NodeCard }

type FormType = 'Thesis' | 'Argument' | 'Counter' | 'Evidence' | 'Agreement'

function buildChildrenMap(nodes: DebateNode[], edges: DebateEdge[]) {
  const map = new Map<string, string[]>()
  const push = (p: string, c: string) => { if (!map.has(p)) map.set(p, []); map.get(p)!.push(c) }
  edges.forEach(e => {
    const kind = (e.data as any)?.kind
    if (kind === 'supports') push(e.source, e.target)
    else if (kind === 'evidence-of' || kind === 'agrees-with') push(e.target, e.source)
    else if (kind === 'attacks') push(e.target, e.source)
  })
  return map
}

function getDescendants(startIds: string[], childrenMap: Map<string, string[]>) {
  const seen = new Set<string>(); const stack = [...startIds]
  while (stack.length) {
    const id = stack.pop()!; const kids = childrenMap.get(id) || []
    for (const k of kids) { if (!seen.has(k)) { seen.add(k); stack.push(k) } }
  }
  return seen
}

function normalizeTerms(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean)
}

function matches(node: DebateNode, terms: string[]): boolean {
  if (terms.length === 0) return false
  const title = (node.data.title || '').toLowerCase()
  const body = (node.data.body || '').toLowerCase()
  return terms.some(t => title.includes(t) || body.includes(t))
}

/** Compute bounding box for nodes (using width/height if available) */
function boundsFor(nodes: DebateNode[]) {
  if (!nodes.length) return { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    const w = (n as any).width ?? 280
    const h = (n as any).height ?? 120
    const x0 = n.position.x
    const y0 = n.position.y
    const x1 = x0 + w
    const y1 = y0 + h
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
  }
  return { minX, minY, maxX, maxY }
}

/** High-contrast minimap color helpers */
function miniColor(kind?: string) {
  switch (kind) {
    case 'Thesis': return '#0ea5e9'    // bright blue
    case 'Argument': return '#ffffff'  // white
    case 'Counter': return '#ef4444'   // red
    case 'Evidence': return '#f59e0b'  // amber
    case 'Agreement': return '#06b6d4' // cyan
    default: return '#94a3b8'          // slate
  }
}
function miniStroke(kind?: string) {
  switch (kind) {
    case 'Thesis': return '#0284c7'
    case 'Argument': return '#cbd5e1'
    case 'Counter': return '#b91c1c'
    case 'Evidence': return '#b45309'
    case 'Agreement': return '#0891b2'
    default: return '#64748b'
  }
}

/** A wrapper that overlays click handling to center the viewport on click */
function ClickableMiniMap(props: { nodes: DebateNode[] }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const { setCenter, getViewport } = useReactFlow()
  const { minX, minY, maxX, maxY } = React.useMemo(() => boundsFor(props.nodes), [props.nodes])

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const cx = e.clientX - r.left
    const cy = e.clientY - r.top
    const rx = Math.min(Math.max(cx / r.width, 0), 1)
    const ry = Math.min(Math.max(cy / r.height, 0), 1)

    const worldX = minX + rx * (maxX - minX)
    const worldY = minY + ry * (maxY - minY)

    const vp = getViewport()
    setCenter(worldX, worldY, { zoom: vp.zoom, duration: 200 })
  }

  return (
    <div ref={ref} className="minimap-wrap" onClick={onClick}>
      <MiniMap
        zoomable
        pannable
        nodeColor={(n) => miniColor((n.data as any)?.kind)}
        nodeStrokeColor={(n) => miniStroke((n.data as any)?.kind)}
        maskColor="rgba(15,23,42,0.4)"
        style={{ width: 200, height: 140 }}
      />
    </div>
  )
}

export default function App() {
  const store = useGraphStore()
  const [nodes, setNodes] = useNodesState<DebateNode>(store.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<DebateEdge>(store.edges)

  // Global search terms
  const [query, setQuery] = useState('')
  const [showOnlyMatches, setShowOnlyMatches] = useState(false)

  // Collapse all nodes on first mount; then sync
  useEffect(() => {
    store.setAllCollapsed(true)
    setTimeout(() => { syncFromStore() }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [participantId, setParticipantId] = useState<string>('A')
  const [formType, setFormType] = useState<FormType>('Argument')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetId, setTargetId] = useState<string>('')
  const [parentId, setParentId] = useState<string>('')

  const sameParticipantTheses = useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Thesis' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgs = useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Argument' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const opponentArgOrCounter = useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter') && n.data.participantId !== participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgOrCounter = useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter') && n.data.participantId === participantId),
    [store.nodes, participantId]
  )

  const [selectedId, setSelectedId] = useState<string>('')
  const selectedNode = useMemo(() => store.nodes.find(n => n.id === selectedId), [store.nodes, selectedId])

  const syncFromStore = () => { setNodes(store.nodes.map(n => ({ ...n }))); setEdges(store.edges.map(e => ({ ...e }))) }

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, type: 'smoothstep', label: 'link' }, eds))
  }, [setEdges])

  const onNodeClick: NodeMouseHandler = (_, n) => setSelectedId(n.id)
  const onPaneClick = () => setSelectedId('')

  const doAdd = async () => {
    try {
      if (formType === 'Thesis') store.addThesis(participantId, title || 'New Thesis', body)
      else if (formType === 'Argument') store.addArgument(participantId, title || 'New Argument', body, parentId || undefined)
      else if (formType === 'Counter') { if (!targetId) throw new Error('Choose an opponent Argument or Counter to counter'); store.addCounter(participantId, targetId, title || 'New Counter', body) }
      else if (formType === 'Evidence') { if (!targetId) throw new Error('Choose an Argument/Counter to support'); store.addEvidence(participantId, targetId, title || 'Evidence', body) }
      else if (formType === 'Agreement') { if (!targetId) throw new Error('Choose an opponent Argument/Counter to agree with'); store.addAgreement(participantId, targetId, title || 'Agreement', body) }
      setTitle(''); setBody(''); setTargetId(''); setParentId('')
      syncFromStore(); await relayout()
    } catch (e: any) { alert(e.message || String(e)) }
  }

  // --- Collapse handling & "final view" (visible) selection ---
  const collapsedIds = useMemo(() => store.nodes.filter(n => n.data.collapsed).map(n => n.id), [store.nodes])
  const childrenMap = useMemo(() => buildChildrenMap(store.nodes as any, store.edges as any), [store.nodes, store.edges])
  const hiddenDueToCollapse = useMemo(() => getDescendants(collapsedIds, childrenMap), [collapsedIds, childrenMap])

  // Search filter
  const searchTerms = useMemo(() => normalizeTerms(query), [query])
  const matchedIds = useMemo(() => new Set(store.nodes.filter(n => matches(n, searchTerms)).map(n => n.id)), [store.nodes, searchTerms])

  // Visible nodes for layout and render
  const baseVisible = useMemo(
    () => nodes.filter(n => !hiddenDueToCollapse.has(n.id)),
    [nodes, hiddenDueToCollapse]
  )
  const visibleNodesForLayout = useMemo(() => {
    if (!showOnlyMatches) return baseVisible
    return baseVisible.filter(n => matchedIds.has(n.id))
  }, [baseVisible, showOnlyMatches, matchedIds])

  const visibleEdgesForLayout = useMemo(
    () => edges.filter(e =>
      !hiddenDueToCollapse.has(e.source) && !hiddenDueToCollapse.has(e.target) &&
      (!showOnlyMatches || (matchedIds.has(e.source) && matchedIds.has(e.target)))
    ),
    [edges, hiddenDueToCollapse, showOnlyMatches, matchedIds]
  )

  // Render nodes with highlighting
  const renderNodes = useMemo(() => {
    return visibleNodesForLayout.map(n => ({
      ...n,
      data: {
        ...n.data,
        hit: matchedIds.has(n.id),
        searchTerms
      }
    }))
  }, [visibleNodesForLayout, matchedIds, searchTerms])
  const renderEdges = useMemo(() => visibleEdgesForLayout, [visibleEdgesForLayout])

  // --- Auto-layout that respects "final view" ---
  const relayout = useCallback(async () => {
    const laid = await elkLayout(visibleNodesForLayout, visibleEdgesForLayout)
    setNodes(nds => nds.map(n => {
      const updated = laid.nodes.find(m => m.id === n.id)
      return updated ? { ...n, position: updated.position } : n
    }))
  }, [visibleNodesForLayout, visibleEdgesForLayout, setNodes])

  // Drag parent -> drag descendants
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const pos = new Map(nodes.map(n => [n.id, n.position]))
    const augmented: NodeChange[] = [...changes]
    const childMap = buildChildrenMap(store.nodes as any, store.edges as any)

    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && ch.dragging) {
        const old = pos.get(ch.id)
        if (!old) continue
        const dx = ch.position.x - old.x
        const dy = ch.position.y - old.y
        if (!dx && !dy) continue

        const descendants = Array.from(getDescendants([ch.id], childMap))
        for (const did of descendants) {
          const dOld = pos.get(did)
          if (!dOld) continue
          augmented.push({
            id: did,
            type: 'position',
            position: { x: dOld.x + dx, y: dOld.y + dy },
            dragging: true
          })
        }
      }
    }

    setNodes(nds => applyNodeChanges(augmented, nds))
  }, [nodes, setNodes, store.nodes, store.edges])

  // Re-flow whenever collapsed state changes
  const collapseSignature = useMemo(
    () => store.nodes.map(n => (n.data.collapsed ? n.id : '')).join('|'),
    [store.nodes]
  )
  useEffect(() => {
    syncFromStore()
    const t = setTimeout(() => { relayout() }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignature])

  // Expand/Collapse all
  const expandAll = async () => { store.setAllCollapsed(false); syncFromStore(); await relayout() }
  const collapseAll = async () => { store.setAllCollapsed(true); syncFromStore(); await relayout() }

  // --- Hard walls: compute translate/node extent around visible nodes ---
  const extentMargin = 800 // px margin around current diagram
  const extent = useMemo<[ [number, number], [number, number] ]>(() => {
    const { minX, minY, maxX, maxY } = boundsFor(visibleNodesForLayout)
    return [[minX - extentMargin, minY - extentMargin], [maxX + extentMargin, maxY + extentMargin]]
  }, [visibleNodesForLayout])

  // --- Edit / Delete panel ---
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editParticipant, setEditParticipant] = useState<string>('')
  useEffect(() => {
    const selectedNode = store.nodes.find(n => n.id === selectedId)
    if (selectedNode) { setEditTitle(selectedNode.data.title || ''); setEditBody(selectedNode.data.body || ''); setEditParticipant(selectedNode.data.participantId) }
    else { setEditTitle(''); setEditBody(''); setEditParticipant('') }
  }, [selectedId, store.nodes])
  const saveEdit = async () => {
    const node = store.nodes.find(n => n.id === selectedId); if (!node) return
    store.updateNode(node.id, { title: editTitle, body: editBody, participantId: editParticipant })
    syncFromStore(); await relayout()
  }
  const deleteSelected = async () => {
    if (!selectedId) return; store.deleteNode(selectedId); setSelectedId(''); syncFromStore(); await relayout()
  }

  // Save / Load
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const doExport = () => {
    try {
      const snap = store.getSnapshot()
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url; a.download = `debate-map-${ts}.json`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e: any) { alert('Failed to export: ' + (e?.message || String(e))) }
  }
  const handleImportedFile = async (file: File) => {
    try { const text = await file.text(); const parsed = JSON.parse(text); store.loadSnapshot(parsed); syncFromStore(); await relayout() }
    catch (e: any) { alert('Failed to load file: ' + (e?.message || String(e))) }
  }
  const doImport = () => { fileInputRef.current?.click() }

  const matchCount = matchedIds.size

  return (
    <div className="app">
      <div className="sidebar">
        <h1>Debate Map</h1>

        <fieldset>
          <legend>Search</legend>
          <input placeholder="Find terms… (e.g., burden proof)" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showOnlyMatches} onChange={e => setShowOnlyMatches(e.target.checked)} />
              Show only matches
            </label>
            <div className="small" style={{ marginLeft: 'auto' }}>{matchCount} match{matchCount === 1 ? '' : 'es'}</div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Debate Participants</legend>
          {store.participants.map(p => (
            <div className="row" key={p.id}>
              <div style={{ width: 40 }}><span className="badge thesis">{p.id}</span></div>
              <input value={p.name} onChange={e => store.setParticipantName(p.id, e.target.value)} />
            </div>
          ))}
          <div className="small">Rename participants here. Defaults are A and B.</div>
        </fieldset>

        <fieldset>
          <legend>Add Item</legend>
          <label>Type</label>
          <select value={formType} onChange={e => setFormType(e.target.value as FormType)}>
            <option>Thesis</option>
            <option>Argument</option>
            <option>Counter</option>
            <option>Evidence</option>
            <option>Agreement</option>
          </select>

          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Debate Participant</label>
              <select value={participantId} onChange={e => setParticipantId(e.target.value as string)}>
                {store.participants.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label>Title</label>
              <input placeholder="Short title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
          </div>

          <label>Body (optional)</label>
          <textarea placeholder="Details / reasoning / citation" value={body} onChange={e => setBody(e.target.value)} />

          {formType === 'Argument' && (
            <>
              <label>Attach under (same participant)</label>
              <select value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">-- choose (optional; will default) --</option>
                {sameParticipantTheses.map(n => (<option key={n.id} value={n.id}>[Thesis] {n.data.title}</option>))}
                {sameParticipantArgs.map(n => (<option key={n.id} value={n.id}>[Argument] {n.data.title}</option>))}
              </select>
            </>
          )}

          {formType === 'Counter' && (
            <>
              <label>Counter target (opponent Argument or Counter)</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}>
                <option value="">-- choose --</option>
                {opponentArgOrCounter.map(n => (
                  <option key={n.id} value={n.id}>[{n.data.kind}] {n.data.title}</option>
                ))}
              </select>
            </>
          )}

          {formType === 'Evidence' && (
            <>
              <label>Evidence target (same participant: Argument or Counter)</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}>
                <option value="">-- choose --</option>
                {sameParticipantArgOrCounter.map(n => (<option key={n.id} value={n.id}>[{n.data.kind}] {n.data.title}</option>))}
              </select>
            </>
          )}

          {formType === 'Agreement' && (
            <>
              <label>Agreement target (opponent: Argument or Counter)</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)}>
                <option value="">-- choose --</option>
                {opponentArgOrCounter.map(n => (<option key={n.id} value={n.id}>[{n.data.kind}] {n.data.title}</option>))}
              </select>
            </>
          )}

          <div className="toolbar">
            <button onClick={doAdd}>Add</button>
            <button className="secondary" onClick={async () => { await relayout() }}>Auto-layout</button>
            <button className="secondary" onClick={syncFromStore}>Sync</button>
          </div>
          <div className="small">Rules: Arguments/Evidence attach to same participant; Counters/Agreements attach to opponent Argument or Counter. Arguments can attach under Thesis or another Argument.</div>
        </fieldset>

        <fieldset>
          <legend>View</legend>
          <div className="toolbar">
            <button className="secondary" onClick={collapseAll}>Collapse all</button>
            <button className="secondary" onClick={expandAll}>Expand all</button>
          </div>
          <div className="small">These apply to the whole map and immediately reflow the layout based on what is visible.</div>
        </fieldset>

        <fieldset>
          <legend>Edit / Delete Selected</legend>
          {selectedNode ? (
            <>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label>Debate Participant</label>
                  <select value={editParticipant} onChange={e => setEditParticipant(e.target.value as string)}>
                    {store.participants.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </div>
                <div style={{ flex: 2 }}>
                  <label>Title</label>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                </div>
              </div>
              <label>Body</label>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} />
              <div className="toolbar">
                <button onClick={saveEdit}>Save</button>
                <button className="secondary" onClick={deleteSelected}>Delete</button>
              </div>
              <div className="small">Tip: click a node to collapse/expand; click empty canvas to deselect.</div>
            </>
          ) : (<div className="small">No node selected. Click a node in the canvas to edit or delete.</div>)}
        </fieldset>

        <fieldset>
          <legend>Save / Load</legend>
          <div className="toolbar">
            <button onClick={doExport}>Save (Export JSON)</button>
            <button className="secondary" onClick={() => fileInputRef.current?.click()}>Load (Import JSON)</button>
          </div>
          <input type="file" accept="application/json" ref={fileInputRef} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { handleImportedFile(f) }; e.currentTarget.value = '' }} />
          <div className="small">Saves a JSON snapshot with participants, nodes, and edges. Load to restore later (nodes start collapsed).</div>
        </fieldset>
      </div>

      <div className="rf-wrapper">
        <ReactFlow
          nodes={renderNodes}
          edges={renderEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.02}
          translateExtent={extent}
          nodeExtent={extent}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
        >
          <MiniMap />
          <ClickableMiniMap nodes={renderNodes} />
          <Controls />
          <Background />
        </ReactFlow>
      </div>
    </div>
  )
}
