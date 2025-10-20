import React from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Connection, NodeTypes, NodeMouseHandler,
  applyNodeChanges, NodeChange, useReactFlow, EdgeTypes, OnEdgeClick, OnEdgeMouseEnter, OnEdgeMouseLeave
} from 'reactflow'

import NodeCard from './components/NodeCard'
import ThickEdge from './components/ThickEdge'
import { useGraphStore } from './store/useGraphStore'
import type { DebateNode, DebateEdge } from './graph/types'
import { computeLayout } from './graph/layout'
import './styles.css'

const nodeTypes: NodeTypes = { nodeCard: NodeCard }
const edgeTypes: EdgeTypes = { thick: ThickEdge }

type FormType = 'Thesis' | 'Argument' | 'Counter' | 'Evidence' | 'Agreement'

function buildChildrenPairs(edges: DebateEdge[]) {
  const pairs: Array<[string, string]> = []
  edges.forEach(e => {
    const kind = (e.data as any)?.kind
    if (kind === 'supports') pairs.push([e.source, e.target])
    else if (kind === 'evidence-of' || kind === 'agrees-with') pairs.push([e.target, e.source])
    else if (kind === 'attacks') pairs.push([e.target, e.source])
  })
  return pairs
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

function miniColor(kind?: string) {
  switch (kind) {
    case 'Thesis': return '#0ea5e9'
    case 'Argument': return '#ffffff'
    case 'Counter': return '#ef4444'
    case 'Evidence': return '#f59e0b'
    case 'Agreement': return '#06b6d4'
    default: return '#94a3b8'
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

function ClickableMiniMap(props: { nodes: DebateNode[] }) {
  const ref = React.useRef<HTMLDivElement | null>(null)
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

  const [query, setQuery] = React.useState('')
  const [showOnlyMatches, setShowOnlyMatches] = React.useState(false)

  React.useEffect(() => {
    store.setAllCollapsed(true)
    setTimeout(() => { syncFromStore() }, 0)
  }, [])

  const [participantId, setParticipantId] = React.useState<string>('A')
  const [formType, setFormType] = React.useState<FormType>('Argument')
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [targetId, setTargetId] = React.useState<string>('')
  const [parentId, setParentId] = React.useState<string>('')

  const sameParticipantTheses = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Thesis' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgs = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Argument' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const opponentArgOrCounter = React.useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter') && n.data.participantId !== participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgOrCounter = React.useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter') && n.data.participantId === participantId),
    [store.nodes, participantId]
  )

  const [selectedId, setSelectedId] = React.useState<string>('')
  const selectedNode = React.useMemo(() => store.nodes.find(n => n.id === selectedId), [store.nodes, selectedId])

  const syncFromStore = () => { setNodes(store.nodes.map(n => ({ ...n }))); setEdges(store.edges.map(e => ({ ...e }))) }

  const onConnect = React.useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, type: 'thick', label: 'link' }, eds))
  }, [setEdges])

  // Single click selects
  const onNodeClick: NodeMouseHandler = (_, n) => setSelectedId(n.id)
  const onPaneClick = () => setSelectedId('')

  // Double click collapses/expands (children only)
  const onNodeDoubleClick: NodeMouseHandler = async (_, n) => {
    const node = store.nodes.find(x => x.id === n.id)
    if (!node) return
    store.updateNode(n.id, { collapsed: !node.data.collapsed })
    syncFromStore()
    await relayout()
  }

  const doAdd = async () => {
    try {
      if (formType === 'Thesis') store.addThesis(participantId, title || 'New Thesis', body)
      else if (formType === 'Argument') store.addArgument(participantId, title || 'New Argument', body, parentId || undefined)
      else if (formType === 'Counter') { if (!targetId) throw new Error('Choose an opponent Argument or Counter to counter'); store.addCounter(participantId, targetId, title || 'New Counter', body) }
      else if (formType === 'Evidence') { if (!targetId) throw new Error('Choose an Argument/Counter to support'); store.addEvidence(participantId, targetId, title || 'Evidence', body) }
      else if (formType === 'Agreement') { if (!targetId) throw new Error('Choose an opponent Argument or Counter to agree with'); store.addAgreement(participantId, targetId, title || 'Agreement', body) }
      setTitle(''); setBody(''); setTargetId(''); setParentId('')
      syncFromStore(); await relayout()
    } catch (e) { alert((e as any).message || String(e)) }
  }

  // Visible graph (respects collapsed + search filter)
  const collapsedIds = React.useMemo(() => store.nodes.filter(n => n.data.collapsed).map(n => n.id), [store.nodes])
  const allPairs = React.useMemo(() => buildChildrenPairs(store.edges as any), [store.edges])

  const childrenMapForCollapse = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [p,c] of allPairs) {
      if (!m.has(p)) m.set(p, [])
      m.get(p)!.push(c)
    }
    return m
  }, [allPairs])
  function getDesc(closed: string[]) {
    const seen = new Set<string>(); const stack = [...closed]
    while (stack.length) {
      const id = stack.pop()!; const kids = childrenMapForCollapse.get(id) || []
      for (const k of kids) { if (!seen.has(k)) { seen.add(k); stack.push(k) } }
    }
    return seen
  }
  const hiddenDueToCollapse = React.useMemo(() => getDesc(collapsedIds), [collapsedIds, childrenMapForCollapse])

  // Search filter
  const searchTerms = React.useMemo(() => normalizeTerms(query), [query])
  const matchedIds = React.useMemo(() => new Set(store.nodes.filter(n => matches(n, searchTerms)).map(n => n.id)), [store.nodes, searchTerms])

  const baseVisible = React.useMemo(
    () => nodes.filter(n => !hiddenDueToCollapse.has(n.id)),
    [nodes, hiddenDueToCollapse]
  )
  const visibleNodesForLayout = React.useMemo(() => {
    if (!showOnlyMatches) return baseVisible
    return baseVisible.filter(n => matchedIds.has(n.id))
  }, [baseVisible, showOnlyMatches, matchedIds])

  const visibleEdgesForLayout = React.useMemo(() => {
    return edges.filter(e => {
      const sHidden = hiddenDueToCollapse.has(e.source)
      const tHidden = hiddenDueToCollapse.has(e.target)
      if (sHidden || tHidden) return false
      if (showOnlyMatches && (!matchedIds.has(e.source) || !matchedIds.has(e.target))) return false
      return true
    })
  }, [edges, hiddenDueToCollapse, showOnlyMatches, matchedIds])

  // Edge interactivity
  const [activeEdgeId, setActiveEdgeId] = React.useState<string>('')
  const [hoverEdgeId, setHoverEdgeId] = React.useState<string>('')
  const onEdgeClick: OnEdgeClick = (_, edge) => setActiveEdgeId(edge.id)
  const onEdgeMouseEnter: OnEdgeMouseEnter = (_, edge) => setHoverEdgeId(edge.id)
  const onEdgeMouseLeave: OnEdgeMouseLeave = () => setHoverEdgeId('')

  const activeEdge = React.useMemo(
    () => visibleEdgesForLayout.find(e => e.id === activeEdgeId) || visibleEdgesForLayout.find(e => e.id === hoverEdgeId),
    [visibleEdgesForLayout, activeEdgeId, hoverEdgeId]
  )
  const activeNodeIds = React.useMemo(() => {
    if (!activeEdge) return new Set<string>()
    return new Set([activeEdge.source, activeEdge.target])
  }, [activeEdge])

  const renderNodes = React.useMemo(() => {
    return visibleNodesForLayout.map(n => ({
      ...n,
      data: {
        ...n.data,
        hit: matchedIds.has(n.id),
        edgeActive: activeNodeIds.has(n.id),
        searchTerms
      }
    }))
  }, [visibleNodesForLayout, matchedIds, searchTerms, activeNodeIds])

  const renderEdges = React.useMemo(() => {
    return visibleEdgesForLayout.map(e => ({
      ...e,
      type: 'thick',
      data: { ...(e.data || {}), active: e.id === activeEdgeId || e.id === hoverEdgeId }
    }))
  }, [visibleEdgesForLayout, activeEdgeId, hoverEdgeId])

  const relayout = React.useCallback(async () => {
    const prevPos = new Map(nodes.map(n => [n.id, n.position]))
    const layout = computeLayout(visibleNodesForLayout, visibleEdgesForLayout)
    const firstThesis = visibleNodesForLayout.find(n => n.data.kind === 'Thesis') || visibleNodesForLayout[0]
    let dx = 0
    if (firstThesis) {
      const prev = prevPos.get(firstThesis.id)
      const next = layout.get(firstThesis.id)
      if (prev && next) dx = prev.x - next.x
    }
    setNodes(nds => nds.map(n => {
      const p = layout.get(n.id)
      if (!p) return n
      return { ...n, position: { x: p.x + dx, y: p.y } }
    }))
  }, [visibleNodesForLayout, visibleEdgesForLayout, setNodes, nodes])

  const handleNodesChange = React.useCallback((changes: NodeChange[]) => {
    const pairs = buildChildrenPairs(visibleEdgesForLayout as any)
    const childMap = new Map<string, string[]>()
    for (const [p,c] of pairs) {
      if (!childMap.has(p)) childMap.set(p, [])
      childMap.get(p)!.push(c)
    }
    const pos = new Map(nodes.map(n => [n.id, n.position]))
    const augmented: NodeChange[] = [...changes]
    function getDesc(startIds: string[]) {
      const seen = new Set<string>(); const stack = [...startIds]
      while (stack.length) {
        const id = stack.pop()!; const kids = childMap.get(id) || []
        for (const k of kids) { if (!seen.has(k)) { seen.add(k); stack.push(k) } }
      }
      return seen
    }
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position && ch.dragging) {
        const old = pos.get(ch.id)
        if (!old) continue
        const dx = ch.position.x - old.x
        const dy = ch.position.y - old.y
        if (!dx && !dy) continue
        const descendants = Array.from(getDesc([ch.id]))
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
  }, [nodes, setNodes, visibleEdgesForLayout])

  const collapseSignature = React.useMemo(
    () => store.nodes.map(n => (n.data.collapsed ? n.id : '')).join('|'),
    [store.nodes]
  )
  React.useEffect(() => {
    syncFromStore()
    const t = setTimeout(() => { relayout() }, 0)
    return () => clearTimeout(t)
  }, [collapseSignature])

  const expandAll = async () => { store.setAllCollapsed(false); syncFromStore(); await relayout() }
  const collapseAll = async () => { store.setAllCollapsed(true); syncFromStore(); await relayout() }

  const extentMargin = 800
  const extent = React.useMemo(() => {
    const { minX, minY, maxX, maxY } = boundsFor(renderNodes)
    return [[minX - extentMargin, minY - extentMargin], [maxX + extentMargin, maxY + extentMargin]] as [[number, number], [number, number]]
  }, [renderNodes])

  const [editTitle, setEditTitle] = React.useState('')
  const [editBody, setEditBody] = React.useState('')
  const [editParticipant, setEditParticipant] = React.useState<string>('')
  React.useEffect(() => {
    const sn = store.nodes.find(n => n.id === selectedId)
    if (sn) { setEditTitle(sn.data.title || ''); setEditBody(sn.data.body || ''); setEditParticipant(sn.data.participantId) }
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

  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const doExport = () => {
    try {
      const snap = store.getSnapshot()
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      a.href = url; a.download = `debate-map-${ts}.json`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { alert('Failed to export: ' + ((e as any)?.message || String(e))) }
  }
  const handleImportedFile = async (file: File) => {
    try { const text = await file.text(); const parsed = JSON.parse(text); store.loadSnapshot(parsed); syncFromStore(); await relayout() }
    catch (e) { alert('Failed to load file: ' + ((e as any)?.message || String(e))) }
  }

  const [addOpen, setAddOpen] = React.useState(false)

  const parentMap = React.useMemo(() => {
    const pairs = buildChildrenPairs(visibleEdgesForLayout as any)
    const parents = new Map<string, string[]>()
    for (const [p, c] of pairs) {
      if (!parents.has(c)) parents.set(c, [])
      parents.get(c)!.push(p)
    }
    return parents
  }, [visibleEdgesForLayout])

  const parentNodes = React.useMemo(() => {
    if (!selectedId) return []
    const ids = parentMap.get(selectedId) || []
    return store.nodes.filter(n => ids.includes(n.id))
  }, [selectedId, parentMap, store.nodes])
  const childNodes = React.useMemo(() => {
    if (!selectedId) return []
    const pairs = buildChildrenPairs(visibleEdgesForLayout as any)
    const children = pairs.filter(([p,_]) => p === selectedId).map(([_,c]) => c)
    return store.nodes.filter(n => children.includes(n.id))
  }, [selectedId, visibleEdgesForLayout, store.nodes])

  return (
    <div className="app">
      <div className="sidebar">

        <fieldset>
          <legend>Save / Load</legend>
          <div className="toolbar">
            <button onClick={doExport}>Save (Export JSON)</button>
            <button className="secondary" onClick={() => fileInputRef.current?.click()}>Load (Import JSON)</button>
          </div>
          <input type="file" accept="application/json" ref={fileInputRef} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { handleImportedFile(f) }; e.currentTarget.value = '' }} />
        </fieldset>

        <fieldset>
          <legend>View</legend>
          <div className="toolbar">
            <button className="secondary" onClick={collapseAll}>Collapse all</button>
            <button className="secondary" onClick={async () => await (store.setAllCollapsed(false), syncFromStore(), relayout())}>Expand all</button>
            <button className="secondary" onClick={async () => { await relayout() }}>Auto-layout</button>
          </div>
          <div className="small">Tip: single-click selects; double-click collapses/expands children.</div>
        </fieldset>

        <fieldset>
          <legend>Search</legend>
          <input placeholder="Find terms…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="row" style={{ marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showOnlyMatches} onChange={e => setShowOnlyMatches(e.target.checked)} />
              Show only matches
            </label>
            <div className="small" style={{ marginLeft: 'auto' }}>{matchedIds.size} match{matchedIds.size === 1 ? '' : 'es'}</div>
          </div>
        </fieldset>

        <fieldset className="collapsible">
          <legend className="collapsible-title" onClick={() => setAddOpen(v => !v)} style={{ cursor: 'pointer' }}>
            {addOpen ? '▼' : '▶'} Add Item
          </legend>
          {addOpen && (
            <div>
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
              </div>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Selected Statement</legend>
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
            </>
          ) : (
            <div className="small">No statement selected. Click any statement card in the canvas to edit it.</div>
          )}
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
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.02}
          translateExtent={extent}
          nodeExtent={extent}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onEdgeClick={onEdgeClick}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
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
