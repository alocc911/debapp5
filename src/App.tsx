import React from 'react'
import ReactFlow, {
  Background,
  useNodesState, useEdgesState, addEdge, Connection, NodeTypes,
  applyNodeChanges, NodeChange, EdgeTypes
} from 'reactflow'
import 'reactflow/dist/style.css'

import NodeCard from './components/NodeCard'
import ThickEdge from './components/ThickEdge'
import LinkEdge from './components/LinkEdge'           // dashed edge for Type 2 links
import { useGraphStore } from './store/useGraphStore'
import type { DebateNode, DebateEdge } from './graph/types'
import { computeLayout } from './graph/layout'
import './styles.css'

const nodeTypes: NodeTypes = { nodeCard: NodeCard }
const edgeTypes: EdgeTypes = { thick: ThickEdge, t2: LinkEdge }

type FormType = 'Thesis' | 'Argument' | 'Argument Summary' | 'Counter' | 'Evidence' | 'Agreement'
type StrengthType = 'Type 1' | 'Type 2' | 'Type 3' | 'Type 4'

const PALETTE = ['#0072B2', '#D55E00', '#009E73', '#E69F00', '#56B4E9', '#CC79A7', '#F0E442', '#999999']
const participantColor = (participantId: string, ids: string[]) => {
  const idx = Math.max(0, ids.indexOf(participantId))
  return PALETTE[idx % PALETTE.length]
}

function buildChildrenPairs(edges: DebateEdge[]) {
  const pairs: Array<[string, string]> = []
  edges.forEach(e => {
    const kind = (e.data as any)?.kind
    if (kind === 'supports') pairs.push([e.source, e.target])
    else if (kind === 'evidence-of' || kind === 'agrees-with') pairs.push([e.target, e.source])
    else if (kind === 'attacks') pairs.push([e.target, e.source])
    // t2-link has no parent/child relation
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
    const x0 = n.position.x, y0 = n.position.y
    const x1 = x0 + w, y1 = y0 + h
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
  }
  return { minX, minY, maxX, maxY }
}

function kindColor(kind: string) {
  switch (kind) {
    case 'Thesis': return '#60a5fa'
    case 'Argument': return '#a78bfa'
    case 'Argument Summary': return '#86efac'
    case 'Counter': return '#f472b6'
    case 'Evidence': return '#f59e0b'
    case 'Agreement': return '#22d3ee'
    default: return '#94a3b8'
  }
}
const titleKindLabel = (n: DebateNode) => `${n.data.title || '(Untitled)'} — [${n.data.kind}]`

export default function App() {
  const store = useGraphStore()

  // Add this with other state declarations near the top of the component
  const [attachmentSelectionActive, setAttachmentSelectionActive] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  // loosen the reactflow state generics to avoid mismatched types from the store
  const [nodes, setNodes] = useNodesState<any>(store.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>(store.edges)

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
  const [firstMention, setFirstMention] = React.useState('')
  const [targetId, setTargetId] = React.useState<string>('')
  const [parentId, setParentId] = React.useState<string>('')

  const [addStrength, setAddStrength] = React.useState<StrengthType | ''>('')   // required for Arg/Counter/Evidence
  const [addT2Links, setAddT2Links] = React.useState<string[]>([])              // optional visual links (Type 2)

  const syncFromStore = () => {
    setNodes(store.nodes.map(n => ({ ...n })))
    setEdges(store.edges.map(e => ({ ...e })))
  }

  // ======== participant-scoped node lists ========
  const sameParticipantTheses = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Thesis' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgs = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Argument' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantCounters = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Counter' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantEvidence = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Evidence' && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const sameParticipantArgCounterOrSummary = React.useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Argument Summary') && n.data.participantId === participantId),
    [store.nodes, participantId]
  )
  const opponentArgOrCounter = React.useMemo(
    () => store.nodes.filter(n => (n.data.kind === 'Argument' || n.data.kind === 'Counter') && n.data.participantId !== participantId),
    [store.nodes, participantId]
  )
  const opponentEvidence = React.useMemo(
    () => store.nodes.filter(n => n.data.kind === 'Evidence' && n.data.participantId !== participantId),
    [store.nodes, participantId]
  )

  // Eligible peers for Type 2 links during ADD (same kind & same speaker & strength Type 2)
  const eligibleT2TargetsAdd = React.useMemo(() => {
    if (!(formType === 'Argument' || formType === 'Counter' || formType === 'Evidence')) return []
    if (addStrength !== 'Type 2') return []
    return store.nodes.filter(n =>
      n.data.participantId === participantId &&
      n.data.kind === formType &&
      n.data.strengthType === 'Type 2'
    )
  }, [store.nodes, participantId, formType, addStrength])

  // --- computed eligible id lists for Add-panel dropdown highlighting ---
  const eligibleAddParentIds = React.useMemo(() => {
    // for adding an Argument: same participant Thesis|Argument|Counter|Evidence
    return [
      ...sameParticipantTheses,
      ...sameParticipantArgs,
      ...sameParticipantCounters,
      ...sameParticipantEvidence
    ].map(n => n.id)
  }, [sameParticipantTheses, sameParticipantArgs, sameParticipantCounters, sameParticipantEvidence])

  const eligibleAddSummaryIds = React.useMemo(() => sameParticipantTheses.map(n => n.id), [sameParticipantTheses])
  const eligibleAddCounterTargetIds = React.useMemo(() => [...opponentArgOrCounter, ...opponentEvidence].map(n => n.id), [opponentArgOrCounter, opponentEvidence])
  const eligibleAddEvidenceTargetIds = React.useMemo(() => sameParticipantArgCounterOrSummary.map(n => n.id), [sameParticipantArgCounterOrSummary])
 const [addOpen, setAddOpen] = React.useState(false)

  // clear highlights when Add panel closes
  React.useEffect(() => {
    if (!addOpen) useGraphStore.getState().setEligibleAttachTargets([])
  }, [addOpen])

  // replace local selectedId state with store-backed selectedNodeId
  // const [selectedId, setSelectedId] = React.useState<string>('')
  // const selectedId = store.selectedNodeId
  // const setSelectedId = (id: string) => store.setSelectedNodeId(id)
  // subscribe to selected node id and its setter
  const selectedId = useGraphStore(s => s.selectedNodeId)
  const setSelectedId = useGraphStore(s => s.setSelectedNodeId)

  const selectedNode = React.useMemo(() => store.nodes.find(n => n.id === selectedId), [store.nodes, selectedId])

  const onConnect = React.useCallback((params: Connection) => {
    setEdges(eds => addEdge({ ...params, type: 'thick', label: 'link' }, eds))
  }, [setEdges])

  const onNodeClick = (_evt: any, n: any) => {
    if (attachmentSelectionActive && store.eligibleAttachTargets.includes(n.id)) {
      if (formType === 'Argument' || formType === 'Argument Summary') {
        setParentId(n.id);
      } else if (formType === 'Counter' || formType === 'Evidence') {
        setTargetId(n.id);
      } else if (selectedNode) { // This is for reattachment in edit mode
        setReparentTarget(n.id);
      }
      setAttachmentSelectionActive(false); // Clear selection mode after choosing
      return;
    }
    setSelectedId(n.id);
  }
  const onPaneClick = () => { 
    setSelectedId(''); 
    setActiveEdgeId('');
    setAttachmentSelectionActive(false);
    store.setLinkHighlight(null);
  }

  const [activeEdgeId, setActiveEdgeId] = React.useState<string>('')
  const [hoverEdgeId, setHoverEdgeId] = React.useState<string>('')
  
  const onEdgeClick = (_evt: any, edge: any) => {
    // Check if target node is self-collapsed first
    const targetNode = store.nodes.find(n => n.id === edge.target);
    if (targetNode?.data.selfCollapsed) {
      store.updateNode(edge.target, {
        collapsed: false,
        selfCollapsed: false
      });
    } else {
      setActiveEdgeId(edge.id);
    }
  }

  const onEdgeMouseEnter = (_evt: any, edge: any) => setHoverEdgeId(edge.id)
  const onEdgeMouseLeave = (_evt?: any) => setHoverEdgeId('')

  const doAdd = async () => {
    try {
      if (formType === 'Argument' || formType === 'Counter' || formType === 'Evidence') {
        if (!addStrength) throw new Error('Please select a Type (1–4) for this statement.')
      }

      let newId = ''
      if (formType === 'Thesis') newId = store.addThesis(participantId, title || 'New Thesis', body, firstMention || undefined)
      else if (formType === 'Argument') newId = store.addArgument(participantId, title || 'New Argument', body, parentId || undefined, addStrength as StrengthType, firstMention || undefined)
      else if (formType === 'Argument Summary') {
        if (!parentId) throw new Error('Choose the Thesis this Summary belongs to')
        newId = store.addArgumentSummary(participantId, parentId, title || 'Argument Summary', body, firstMention || undefined)
      }
      else if (formType === 'Counter') {
        if (!targetId) throw new Error('Choose a target to counter')
        newId = store.addCounter(participantId, targetId, title || 'New Counter', body, addStrength as StrengthType, firstMention || undefined)
      }
      else if (formType === 'Evidence') {
        if (!targetId) throw new Error('Choose a target (Argument / Counter / Summary)')
        newId = store.addEvidence(participantId, targetId, title || 'Evidence', body, addStrength as StrengthType, firstMention || undefined)
      }
      else if (formType === 'Agreement') {
        if (!targetId) throw new Error('Choose an opponent Argument or Counter to agree with')
        newId = store.addAgreement(participantId, targetId, title || 'Agreement', body, firstMention || undefined)
      }

      // Add Type 2 peer links (optional, visual only)
      if (newId && addStrength === 'Type 2' && (formType === 'Argument' || formType === 'Counter' || formType === 'Evidence') && addT2Links.length) {
        store.addT2Links(newId, addT2Links)
      }

      setTitle(''); setBody(''); setFirstMention(''); setTargetId(''); setParentId(''); setAddStrength(''); setAddT2Links([])
      syncFromStore(); await relayout()
    } catch (e) { alert((e as any).message || String(e)) }
  }

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

  const searchTerms = React.useMemo(() => normalizeTerms(query), [query])
  const matchedIds = React.useMemo(() => new Set(store.nodes.filter(n => matches(n, searchTerms)).map(n => n.id)), [store.nodes, searchTerms])

  const baseVisible = React.useMemo(
    () => nodes.filter(n => !hiddenDueToCollapse.has(n.id)),
    [nodes, hiddenDueToCollapse]
  )
  const visibleNodesForLayout = baseVisible
  const visibleEdgesForLayout = React.useMemo(() => {
    return edges.filter(e => {
      const sHidden = hiddenDueToCollapse.has(e.source)
      const tHidden = hiddenDueToCollapse.has(e.target)
      if (sHidden || tHidden) return false
      return true
    })
  }, [edges, hiddenDueToCollapse])

  const activeEdge = React.useMemo(
    () => visibleEdgesForLayout.find(e => e.id === activeEdgeId) || visibleEdgesForLayout.find(e => e.id === hoverEdgeId),
    [visibleEdgesForLayout, activeEdgeId, hoverEdgeId]
  )
  const activeNodeIds = React.useMemo(() => {
    if (!activeEdge) return new Set<string>()
    return new Set([activeEdge.source, activeEdge.target])
  }, [activeEdge])

  const renderNodes = React.useMemo(() => {
    const linkHighlight = store.linkHighlight;
    const { participants: activeParticipants, kinds: activeKinds } = store.filters;
    
    return visibleNodesForLayout.map(n => ({
      ...n,
      data: {
        ...n.data,
        hit: matchedIds.has(n.id),
        edgeActive: activeNodeIds.has(n.id),
        searchTerms,
        dimmed: (showOnlyMatches && !matchedIds.has(n.id)) || 
                (attachmentSelectionActive && store.eligibleAttachTargets.length > 0 && 
                 !store.eligibleAttachTargets.includes(n.id) && 
                 n.id !== selectedId) ||
                (linkHighlight && n.id !== linkHighlight.sourceId && n.id !== linkHighlight.targetId) ||
                // Add filter conditions:
                (activeParticipants.size > 0 && !activeParticipants.has(n.data.participantId)) ||
                (activeKinds.size > 0 && !activeKinds.has(n.data.kind))
      }
    }))
  }, [visibleNodesForLayout, matchedIds, searchTerms, activeNodeIds, 
      showOnlyMatches, store.eligibleAttachTargets, selectedId, attachmentSelectionActive,
      store.linkHighlight, store.filters]) // Add filters dependency

  const renderEdges = React.useMemo(() => {
    return visibleEdgesForLayout.map(e => {
      const endpointMatch = matchedIds.has(e.source) || matchedIds.has(e.target)
      const dimmed = showOnlyMatches && !endpointMatch
      const eKind = (e.data as any)?.kind
      const type = eKind === 't2-link' ? 't2' : 'thick'
      return ({
        ...e,
        type,
        data: { ...(e.data || {}), active: e.id === activeEdgeId || e.id === hoverEdgeId, dimmed }
      })
    })
  }, [visibleEdgesForLayout, activeEdgeId, hoverEdgeId, showOnlyMatches, matchedIds])

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
  const [editStrength, setEditStrength] = React.useState<StrengthType | ''>('')
  const [editFirstMention, setEditFirstMention] = React.useState('')
  const [editT2Links, setEditT2Links] = React.useState<string[]>([])

  React.useEffect(() => {
    const sn = store.nodes.find(n => n.id === selectedId)
    if (sn) {
      setEditTitle(sn.data.title || '')
      setEditBody(sn.data.body || '')
      setEditParticipant(sn.data.participantId)
      setEditStrength((sn.data.kind === 'Argument' || sn.data.kind === 'Counter' || sn.data.kind === 'Evidence') ? (sn.data.strengthType || '') : '')
      setEditFirstMention(sn.data.firstMention || '')
      if ((sn.data.kind === 'Argument' || sn.data.kind === 'Counter' || sn.data.kind === 'Evidence') && sn.data.strengthType === 'Type 2') {
        const links = store.edges
          .filter(e => e.data?.kind === 't2-link' && (e.source === sn.id || e.target === sn.id))
          .map(e => e.source === sn.id ? e.target : e.source)
        setEditT2Links(links)
      } else {
        setEditT2Links([])
      }
    } else {
      setEditTitle(''); setEditBody(''); setEditParticipant(''); setEditStrength(''); setEditFirstMention(''); setEditT2Links([])
    }
  }, [selectedId, store.nodes, store.edges])

  const eligibleT2TargetsEdit = React.useMemo(() => {
    const n = selectedNode
    if (!n) return []
    if (!((n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Evidence') && editStrength === 'Type 2')) return []
    return store.nodes.filter(m =>
      m.id !== n.id &&
      m.data.participantId === n.data.participantId &&
      m.data.kind === n.data.kind &&
      m.data.strengthType === 'Type 2'
    )
  }, [store.nodes, selectedNode, editStrength])

  const saveEdit = async () => {
    const node = store.nodes.find(n => n.id === selectedId); if (!node) return
    if ((node.data.kind === 'Argument' || node.data.kind === 'Counter' || node.data.kind === 'Evidence') && !editStrength) {
      alert('Please select a Type (1–4) for this statement.')
      return
    }
    // Update T2 links if Type 2
    if ((node.data.kind === 'Argument' || node.data.kind === 'Counter' || node.data.kind === 'Evidence') && editStrength === 'Type 2') {
      store.setT2Links(node.id, editT2Links)
    } else {
      store.setT2Links(node.id, [])
    }
    store.updateNode(node.id, { title: editTitle, body: editBody, participantId: editParticipant, strengthType: editStrength || undefined, firstMention: editFirstMention || undefined })
    syncFromStore(); await relayout()
  }
  const deleteSelected = async () => {
    if (!selectedId) return; store.deleteNode(selectedId); setSelectedId(''); syncFromStore(); await relayout()
  }

  // ---------- Reparenting (Selected Statement) ----------
  const pairsForGraph = React.useMemo(() => buildChildrenPairs(store.edges as any), [store.edges])
  const childMap = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const [p, c] of pairsForGraph) {
      if (!m.has(p)) m.set(p, [])
      m.get(p)!.push(c)
    }
    return m
  }, [pairsForGraph])

  function descendantsOf(id: string): Set<string> {
    const seen = new Set<string>()
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      const kids = childMap.get(cur) || []
      for (const k of kids) if (!seen.has(k)) { seen.add(k); stack.push(k) }
    }
    return seen
  }

  // Replace local reparentTarget state with store-backed value
  // const [reparentTarget, setReparentTarget] = React.useState<string>('')
  // const reparentTarget = store.reparentTargetId
  // const setReparentTarget = (id: string) => store.setReparentTargetId(id)
  // subscribe to reparent target id and its setter
  const reparentTarget = useGraphStore(s => s.reparentTargetId)
  const setReparentTarget = useGraphStore(s => s.setReparentTargetId)

  // existing computation of eligibleParents (unchanged)...
  const eligibleParents = React.useMemo(() => {
    if (!selectedNode) return []
    const self = selectedNode
    const pid = self.data.participantId

    if (self.data.kind === 'Argument') {
      const desc = descendantsOf(self.id)
      return store.nodes.filter(n =>
        n.id !== self.id &&
        !desc.has(n.id) &&
        n.data.participantId === pid &&
        // allow Thesis | Argument | Counter | Evidence
        (n.data.kind === 'Thesis' || n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Evidence'))
    }
    if (self.data.kind === 'Argument Summary') {
      return store.nodes.filter(n =>
        n.data.kind === 'Thesis' &&
        n.data.participantId === pid &&
        !store.edges.some(e =>
          e.data?.kind === 'supports' &&
          e.source === n.id &&
          store.nodes.find(nn => nn.id === e.target)?.data.kind === 'Argument Summary' &&
          e.target !== self.id
        )
      )
    }
    if (self.data.kind === 'Evidence') {
      return store.nodes.filter(n =>
        n.data.participantId === pid &&
        (n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Argument Summary'))
    }
    if (self.data.kind === 'Counter' || self.data.kind === 'Agreement') {
      return store.nodes.filter(n =>
        n.data.participantId !== pid &&
        // allow opponent Argument | Counter | Evidence
        (n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Evidence'))
    }
    return []
  }, [selectedNode, store.nodes, store.edges, childMap])

  // Sync eligibleParents (ids) into the store so NodeCard can highlight them
  React.useEffect(() => {
    // use selectors for setters so component updates reliably when those store values change
    const setEligible = useGraphStore.getState().setEligibleAttachTargets
    const clearReparent = useGraphStore.getState().setReparentTargetId
    setEligible(eligibleParents.map(n => n.id))
    // if current reparentTarget isn't in eligible list, clear it
    if (reparentTarget && !eligibleParents.find(n => n.id === reparentTarget)) {
      clearReparent('')
    }
  }, [eligibleParents.map(n => n.id).join('|'), reparentTarget]) // keep effect triggered when eligible set or selected target changes

  const doReattach = async () => {
    if (!selectedNode || !reparentTarget) return
    const kind = selectedNode.data.kind
    try {
      if (kind === 'Argument' || kind === 'Argument Summary') {
        store.setSupportsParent(selectedNode.id, reparentTarget)
      } else if (kind === 'Evidence') {
        store.setEdgeTarget(selectedNode.id, 'evidence-of', reparentTarget)
      } else if (kind === 'Counter') {
        store.setEdgeTarget(selectedNode.id, 'attacks', reparentTarget)
      } else if (kind === 'Agreement') {
        store.setEdgeTarget(selectedNode.id, 'agrees-with', reparentTarget)
      } else {
        alert('This statement type cannot be reattached.')
        return
      }
      // Clear both the reparent target and the selection mode
      const clearReparent = useGraphStore.getState().setReparentTargetId
      clearReparent('')
      setAttachmentSelectionActive(false)
      syncFromStore(); await relayout()
    } catch (e) {
      alert((e as any).message || String(e))
    }
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

 
  const [participantsOpen, setParticipantsOpen] = React.useState(false)

  const parentMap = React.useMemo(() => {
    const pairs = buildChildrenPairs(visibleEdgesForLayout as any)
    const parents = new Map<string, string[]>()
    for (const [p, c] of pairs) {
      if (!parents.has(c)) parents.set(c, [])
      parents.get(c)!.push(p)
    }
    return parents
  }, [visibleEdgesForLayout])

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
            <button className="secondary" onClick={async () => { store.setAllCollapsed(true); syncFromStore(); await relayout() }}>Collapse all</button>
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
              Show only matches (dim others)
            </label>
            <div className="small" style={{ marginLeft: 'auto' }}>{matchedIds.size} match{matchedIds.size === 1 ? '' : 'es'}</div>
          </div>
        </fieldset>

        <fieldset className="collapsible">
          <legend className="collapsible-title" onClick={() => setAddOpen(v => !v)} style={{ cursor: 'pointer' }}>
            {addOpen ? '▼' : '▶'} Add Statement
          </legend>
          {addOpen && (
            <div>
              <label>Type</label>
              <select value={formType} onChange={e => setFormType(e.target.value as FormType)}>
                <option>Thesis</option>
                <option>Argument</option>
                <option>Argument Summary</option>
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

              <label>First Mention (optional)</label>
              <input placeholder="e.g., 00:12:34 or 2025-10-20 14:03" value={firstMention} onChange={e => setFirstMention(e.target.value)} />

              {(formType === 'Argument' || formType === 'Counter' || formType === 'Evidence') && (
                <>
                  <label>Statement Type (required)</label>
                  <select value={addStrength} onChange={e => setAddStrength(e.target.value as StrengthType)}>
                    <option value="">-- choose --</option>
                    <option value="Type 1">Type 1</option>
                    <option value="Type 2">Type 2</option>
                    <option value="Type 3">Type 3</option>
                    <option value="Type 4">Type 4</option>
                  </select>
                </>
              )}

              {formType === 'Argument' && (
                <>
                  <label>Attach under (same participant: Thesis, Argument, Counter, or Evidence)</label>
                  <select
                    value={parentId}
                    onChange={e => setParentId(e.target.value)}
                    onFocus={() => {
                      store.setEligibleAttachTargets(eligibleAddParentIds)
                      setAttachmentSelectionActive(true)
                    }}
                    onBlur={() => {
                      // Don't clear eligibleAttachTargets or attachmentSelectionActive on blur
                      // Let it persist until selection is made or cancelled
                    }}
                  >
                    <option value="">-- choose (optional; will default) --</option>
                    {sameParticipantTheses.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                    {sameParticipantArgs.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                    {sameParticipantCounters.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                    {sameParticipantEvidence.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                  </select>
                </>
              )}

              {formType === 'Argument Summary' && (
                <>
                  <label>Attach to Thesis (same participant)</label>
                  <select
                    value={parentId}
                    onChange={e => setParentId(e.target.value)}
                    onFocus={() => {
                      store.setEligibleAttachTargets(eligibleAddSummaryIds)
                      setAttachmentSelectionActive(true)
                    }}
                    onBlur={() => {
                      // Don't clear eligibleAttachTargets or attachmentSelectionActive on blur
                      // Let it persist until selection is made or cancelled
                    }}
                  >
                    <option value="">-- choose Thesis --</option>
                    {sameParticipantTheses.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                  </select>
                  <div className="small" style={{ marginTop: 6 }}>
                    Only one Argument Summary is allowed per Thesis, and only Evidence can attach to a Summary.
                  </div>
                </>
              )}

              {formType === 'Counter' && (
                <>
                  <label>Counter target (opponent Argument, Counter, or Evidence)</label>
                  <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    onFocus={() => {
                      store.setEligibleAttachTargets(eligibleAddCounterTargetIds)
                      setAttachmentSelectionActive(true)
                    }}
                    onBlur={() => {
                      // Don't clear eligibleAttachTargets or attachmentSelectionActive on blur
                      // Let it persist until selection is made or cancelled
                    }}
                  >
                    <option value="">-- choose --</option>
                    {opponentArgOrCounter.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                    {opponentEvidence.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                  </select>
                </>
              )}

              {formType === 'Evidence' && (
                <>
                  <label>Evidence target (same participant: Argument, Counter or Summary)</label>
                  <select
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    onFocus={() => {
                      store.setEligibleAttachTargets(eligibleAddEvidenceTargetIds)
                      setAttachmentSelectionActive(true)
                    }}
                    onBlur={() => {
                      // Don't clear eligibleAttachTargets or attachmentSelectionActive on blur
                      // Let it persist until selection is made or cancelled
                    }}
                  >
                    <option value="">-- choose --</option>
                    {sameParticipantArgCounterOrSummary.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                  </select>
                </>
              )}

              {(addStrength === 'Type 2') && (formType === 'Argument' || formType === 'Counter' || formType === 'Evidence') && (
                <>
                  <label>Type 2 links (same kind & speaker)</label>
                  <select
                    multiple
                    value={addT2Links}
                    onChange={e => setAddT2Links(Array.from(e.target.selectedOptions).map(o => o.value))}
                    onFocus={() => {
                      store.setEligibleAttachTargets(eligibleT2TargetsAdd.map(n => n.id))
                      setAttachmentSelectionActive(true)
                    }}
                    onBlur={() => {
                      // Don't clear eligibleAttachTargets or attachmentSelectionActive on blur
                      // Let it persist until selection is made or cancelled
                    }}
                  >
                    {eligibleT2TargetsAdd.map(n => (<option key={n.id} value={n.id}>{n.data.title || '(Untitled)'}</option>))}
                  </select>
                  <div className="small">Optional visual links; no effect on hierarchy.</div>
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

              <label>First Mention (optional)</label>
              <input placeholder="e.g., 00:12:34 or 2025-10-20 14:03" value={editFirstMention} onChange={e => setEditFirstMention(e.target.value)} />

              {(selectedNode.data.kind === 'Argument' || selectedNode.data.kind === 'Counter' || selectedNode.data.kind === 'Evidence') && (
                <>
                  <label>Statement Type (required)</label>
                  <select value={editStrength} onChange={e => setEditStrength(e.target.value as StrengthType)}>
                    <option value="">-- choose --</option>
                    <option value="Type 1">Type 1</option>
                    <option value="Type 2">Type 2</option>
                    <option value="Type 3">Type 3</option>
                    <option value="Type 4">Type 4</option>
                  </select>
                </>
              )}

              {(selectedNode.data.kind === 'Argument' || selectedNode.data.kind === 'Counter' || selectedNode.data.kind === 'Evidence') && editStrength === 'Type 2' && (
                <>
                  <label>Type 2 links (same kind & speaker)</label>
                  <select multiple value={editT2Links} onChange={e => setEditT2Links(Array.from(e.target.selectedOptions).map(o => o.value))}>
                    {eligibleT2TargetsEdit.map(n => (<option key={n.id} value={n.id}>{n.data.title || '(Untitled)'}</option>))}
                  </select>
                </>
              )}

              {/* Reattach: show eligible parent/target selector if available */}
              {(() => {
                const eligible = (() => {
                  const self = selectedNode
                  const pid = self.data.participantId
                  if (self.data.kind === 'Argument') {
                    const desc = new Set<string>()
                    const stack = [self.id]
                    const pairs = buildChildrenPairs(store.edges as any)
                    const map = new Map<string,string[]>()
                    for (const [p,c] of pairs) { if (!map.has(p)) map.set(p, []); map.get(p)!.push(c) }
                    while (stack.length) { const cur = stack.pop()!; const kids = map.get(cur)||[]; for (const k of kids) if (!desc.has(k)) { desc.add(k); stack.push(k) } }
                    return store.nodes.filter(n =>
                      n.id !== self.id && !desc.has(n.id) &&
                      n.data.participantId === pid &&
                      (n.data.kind === 'Thesis' || n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Evidence'))
                  }
                  if (self.data.kind === 'Argument Summary') {
                    return store.nodes.filter(n => n.data.kind === 'Thesis' && n.data.participantId === pid &&
                      !store.edges.some(e => e.data?.kind === 'supports' && e.source === n.id && store.nodes.find(nn => nn.id === e.target)?.data.kind === 'Argument Summary' && e.target !== self.id)
                    )
                  }
                  if (self.data.kind === 'Evidence') {
                    return store.nodes.filter(n => n.data.participantId === pid && (n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Argument Summary'))
                  }
                  if (self.data.kind === 'Counter' || self.data.kind === 'Agreement') {
                    return store.nodes.filter(n => n.data.participantId !== pid && (n.data.kind === 'Argument' || n.data.kind === 'Counter' || n.data.kind === 'Evidence'))
                  }
                  return []
                })()

                return eligible.length > 0 ? (
                  <>
                    <label>Attach / Target</label>
                    <select
                      value={reparentTarget}
                      onChange={e => setReparentTarget(e.target.value)}
                      onFocus={() => {
                        store.setEligibleAttachTargets(eligible.map(n => n.id))
                        setAttachmentSelectionActive(true)
                      }}
                    >
                      <option value="">-- choose new parent/target --</option>
                      {eligible.map(n => (<option key={n.id} value={n.id}>{titleKindLabel(n)}</option>))}
                    </select>
                    <div className="toolbar">
                      <button className="secondary" onClick={doReattach} disabled={!reparentTarget}>Reattach</button>
                    </div>
                  </>
                ) : null
              })()}

              <div className="toolbar">
                <button onClick={saveEdit}>Save</button>
                <button className="secondary" onClick={deleteSelected}>Delete</button>
              </div>
            </>
          ) : (
            <div className="small">No statement selected. Click any statement card in the canvas to edit it.</div>
          )}
        </fieldset>

        <fieldset className="collapsible">
          <legend className="collapsible-title" onClick={() => setParticipantsOpen(v => !v)} style={{ cursor: 'pointer' }}>
            {participantsOpen ? '▼' : '▶'} Participants
          </legend>
          {participantsOpen && (
            <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              {store.participants.map(p => (
                <div key={p.id} className="row" style={{ gap: 8 }}>
                  <div style={{ width: 32, textAlign: 'center', fontWeight: 800 }}>{p.id}</div>
                  <input value={p.name} onChange={e => store.updateParticipant(p.id, e.target.value)} />
                </div>
              ))}
              <div className="small">These names appear on the statement badges and in selectors.</div>
            </div>
          )}
        </fieldset>

        {/* Add after other fieldsets but before Legend */}
        <fieldset className="collapsible">
          <legend className="collapsible-title" onClick={() => setFiltersOpen(v => !v)} style={{ cursor: 'pointer' }}>
            {filtersOpen ? '▼' : '▶'} Filters
          </legend>
          {filtersOpen && (
            <div className="filters">
              <div className="filter-section">
                <div className="filter-heading">Show only these participants:</div>
                {store.participants.map(p => (
                  <label key={p.id} className="filter-item">
                    <input
                      type="checkbox"
                      checked={store.filters.participants.has(p.id)}
                      onChange={e => store.setParticipantFilter(p.id, e.target.checked)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>

              <div className="filter-section" style={{ marginTop: 12 }}>
                <div className="filter-heading">Show only these types:</div>
                {['Argument', 'Counter', 'Evidence', 'Agreement'].map(kind => (
                  <label key={kind} className="filter-item">
                    <input
                      type="checkbox"
                      checked={store.filters.kinds.has(kind as StatementKind)}
                      onChange={e => store.setKindFilter(kind as StatementKind, e.target.checked)}
                    />
                    {kind}
                  </label>
                ))}
              </div>

              {(store.filters.participants.size > 0 || store.filters.kinds.size > 0) && (
                <div className="toolbar">
                  <button className="secondary" onClick={() => store.clearFilters()}>
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          )}
        </fieldset>

        {/* Legend: added at bottom of sidebar */}
        <div className="legend" aria-hidden={false}>
          <div className="legend__title">Legend — colors</div>
          <div className="legend__list">
            {['Thesis','Argument','Argument Summary','Counter','Evidence','Agreement'].map(k => (
              <div key={k} className="legend__item">
                <div className="legend__swatch" style={{ background: kindColor(k) }} />
                <div className="legend__label">{k}</div>
              </div>
            ))}

            <div className="legend__item" style={{ marginTop: 6 }}>
              <div className="legend__swatch" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }} />
              <div className="legend__label">Type 2 — If this, and the stated othe argument are true, than the main claim is true (dashed link)</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0' }} />
              <div className="legend__label">Type 1 - If this is true, than the main claim is true</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <div className="legend__label">Type 3 - This only adds general support</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: 'repeating-linear-gradient(135deg,#f3f4f6, #f3f4f6 6px,#e5e7eb 6px,#e5e7eb 12px)', borderRadius: 8, border: '1px solid #9ca3af' }} />
              <div className="legend__label">Type 4 — no meaningful support</div>
            </div>
          </div>
        </div>

        {/* (legend retained elsewhere in your project) */}
      </div>

      <div className="rf-outer">
        <div className="rf-wrapper">
          <ReactFlow
            style={{ width: '100%', height: '100%' }}
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
            onPaneClick={onPaneClick}
            onEdgeClick={onEdgeClick}
            onEdgeMouseEnter={onEdgeMouseEnter}
            onEdgeMouseLeave={onEdgeMouseLeave}
          >
            <Background />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
