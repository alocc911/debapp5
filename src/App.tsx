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

  const dummySnapshot = {
  "nodes": [
    {
      "id": "thesisA",
      "type": "nodeCard",
      "position": {
        "x": 6460,
        "y": 0
      },
      "data": {
        "kind": "Thesis",
        "participantId": "A",
        "title": "\"Death To Plastic\" misleads",
        "body": "Primarily misleading in how it implies plastic-free products while he actually sells plastic-lined products",
        "collapsed": false,
        "firstMention": "1:45",
        "selfCollapsed": false
      }
    },
    {
      "id": "thesisB",
      "type": "nodeCard",
      "position": {
        "x": 17350,
        "y": 0
      },
      "data": {
        "kind": "Thesis",
        "participantId": "B",
        "title": "Company Mission",
        "body": "The company's mission is to reduce worldwide plastic use",
        "collapsed": false,
        "selfCollapsed": false
      }
    },
    {
      "id": "6uGZ4amBEWLu",
      "type": "nodeCard",
      "position": {
        "x": 9500,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Plastic Use",
        "body": "The company has plastic in most or all of its products\n\nNeeds Type 2 connection showing marketing has led customers to expect plastic-free products",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "3:20",
        "selfCollapsed": false
      }
    },
    {
      "id": "YXM058toX8IO",
      "type": "nodeCard",
      "position": {
        "x": -1900,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Better alternatives exist",
        "body": "The examples given are Glass and Stainless Steel.\n\nResponded to: \n[[N09yXC0wBRK1|Mike Cessario: Aluminum is the only option]]\n[[idxVkJfd8hZl|Mike Cessario: People are not seriously concerned about liquid touching plastic]]\n[[bdFGHra0nzdw|Mike Cessario: Plastic in Cans has no effect on recyclability]]",
        "collapsed": true,
        "supportType": "Type 3",
        "strengthType": "Type 1",
        "firstMention": "16:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "atJQK2ajoQgJ",
      "type": "nodeCard",
      "position": {
        "x": 9120,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Examples",
        "body": "Can Lining, powder packs",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "3:20"
      }
    },
    {
      "id": "PRfATbP7XNik",
      "type": "nodeCard",
      "position": {
        "x": 7790,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Market expectations",
        "body": "People think that \"death to plastic\" means they are buying plastic-free products.\n\nNeeds Type 2 connection showing LD does not sell plastic-free products.\n\nResponded to:\n[[8401yf9w|Mike Cessario: DTP is a marketing tagline]]\n[[xj5Ea3KE1v5f|Mike Cessario: Marketing supported waste message]]\n[[X3K3fIAQTRaC|Mike Cessario: Shorthand]]",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "2:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "depkZmMCcHQe",
      "type": "nodeCard",
      "position": {
        "x": 7220,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Personal Experience",
        "body": "He bought thousands worth of LD for health / microplastic purposes",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "2:50"
      }
    },
    {
      "id": "aDSFmEKUse5R",
      "type": "nodeCard",
      "position": {
        "x": 15260,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Company Origin",
        "body": "The world in 2018 was focused on plastic waste, and so the company's mission was about plastic waste",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "4:15",
        "selfCollapsed": false
      }
    },
    {
      "id": "8jLAq6SubwmG",
      "type": "nodeCard",
      "position": {
        "x": 15070,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Marriot",
        "body": "Marriot and other hotel chains were getting rid of plastic straws",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "4:25"
      }
    },
    {
      "id": "IazvrsToRwU8",
      "type": "nodeCard",
      "position": {
        "x": 14690,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "China Stopped Accepting",
        "body": "China stopped accepting plastic waste in 2018 and American companies began sending it to landfills",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "4:35"
      }
    },
    {
      "id": "cYrgUGv5DGCe",
      "type": "nodeCard",
      "position": {
        "x": 15450,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "New Awareness",
        "body": "People in 2018 were becoming aware that plastic was not actually recyclable",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "5:00"
      }
    },
    {
      "id": "N09yXC0wBRK1",
      "type": "nodeCard",
      "position": {
        "x": 13930,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Aluminum is the only option",
        "body": "Responded to: \n[[YXM058toX8IO|Tim Pool: Better alternatives exist]]",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "5:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "ivJqzrY5AbqK",
      "type": "nodeCard",
      "position": {
        "x": 13550,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Aluminum is only economic recyclable option",
        "body": "Aluminum can be sold for $1500/ton, where plastics and glass are worthless\n\nNeeds Type 2 links to explanations for both ecological and health factors.",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "5:55",
        "selfCollapsed": false
      }
    },
    {
      "id": "4Cj7gb2cP3FS",
      "type": "nodeCard",
      "position": {
        "x": 13930,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Aluminum is the only sustainable option",
        "body": "Aluminum is the only viable option to infinitely reuse\n\nNeeds type 2 links to explanations for both economic and health factors.",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "6:20",
        "selfCollapsed": false
      }
    },
    {
      "id": "xj5Ea3KE1v5f",
      "type": "nodeCard",
      "position": {
        "x": 16780,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Marketing supported waste message",
        "body": "\nResponded to:\n[[PRfATbP7XNik|Tim Pool: Market expectations]]",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "6:45",
        "selfCollapsed": false
      }
    },
    {
      "id": "USv5TqqdtL4W",
      "type": "nodeCard",
      "position": {
        "x": 16780,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Gave to plastic waste charities",
        "body": "Originally gave 5% (43:00)",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "6:45",
        "selfCollapsed": false
      }
    },
    {
      "id": "X3K3fIAQTRaC",
      "type": "nodeCard",
      "position": {
        "x": 21340,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Shorthand",
        "body": "\"Death to Plastic\" is reasonably understood as shorthand for \"Death to Plastic Bottles\"\n\n\nResponded to:\n[[PRfATbP7XNik|Tim Pool: Market expectations]]",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "7:00",
        "selfCollapsed": false
      }
    },
    {
      "id": "Y1bWT1WbDu0g",
      "type": "nodeCard",
      "position": {
        "x": 21530,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "They are a beverage company",
        "body": "The context implies plastic bottles",
        "collapsed": true,
        "strengthType": "Type 3"
      }
    },
    {
      "id": "oMmXTax9TCxD",
      "type": "nodeCard",
      "position": {
        "x": 21150,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Surveys",
        "body": "Recent surveys showed 80% of users thought it was about plastic waste",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "7:05"
      }
    },
    {
      "id": "CzNV7BJ9G245",
      "type": "nodeCard",
      "position": {
        "x": 17730,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Microplastic Awareness is New",
        "body": "The concern about microplastics is so new that a phrase like \"Death to Plastic\" could not be interpreted as a reference to microplastics.\n\n\nResponded to:\n[[PRfATbP7XNik|Tim Pool: Market expectations]]",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "7:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "ckobt2UvGXPH",
      "type": "nodeCard",
      "position": {
        "x": 17730,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Dearth of Research",
        "body": "There is little scientific consensus on what these are, where they are, what the effects are, etc",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "7:45",
        "selfCollapsed": false
      }
    },
    {
      "id": "idxVkJfd8hZl",
      "type": "nodeCard",
      "position": {
        "x": 18300,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "People are not seriously concerned about liquid touching plastic",
        "body": "Responded to:\n[[YXM058toX8IO|Tim Pool: Better alternatives exist]]",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "8:10",
        "selfCollapsed": false
      }
    },
    {
      "id": "TBr4kwPh6j3r",
      "type": "nodeCard",
      "position": {
        "x": 18110,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "French Study",
        "body": "A French study found that water in glass bottles has more microplastics than (aluminum bottles?) because of the cap sealer",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "8:15"
      }
    },
    {
      "id": "3ixvC2x1zRNi",
      "type": "nodeCard",
      "position": {
        "x": 18490,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Glass bottles use more plastic",
        "body": "10x aluminum cans",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "8:40"
      }
    },
    {
      "id": "bdFGHra0nzdw",
      "type": "nodeCard",
      "position": {
        "x": 19820,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "B",
        "title": "Plastic in Cans has no effect on recyclability",
        "body": "Responded to:\n[[YXM058toX8IO|Tim Pool: Better alternatives exist]]",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "10:00"
      }
    },
    {
      "id": "VQAYkK21yI2i",
      "type": "nodeCard",
      "position": {
        "x": 18870,
        "y": 600
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Burns off",
        "body": "The plastic lining is microns thick so when the cans are smelted the plastic gets completely burned off.  ",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "10:20"
      }
    },
    {
      "id": "EiHVJACKV8Ro",
      "type": "nodeCard",
      "position": {
        "x": 20770,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Plastic in cans creates landfill waste",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "10:40",
        "selfCollapsed": false
      }
    },
    {
      "id": "vBdRdfAAohGM",
      "type": "nodeCard",
      "position": {
        "x": 20770,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Process breakdown",
        "body": "Even if perfectly filtered, smelted plastic ends up in filters which eventually end up in landfills.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "10:45"
      }
    },
    {
      "id": "Md5zYuTDoyUe",
      "type": "nodeCard",
      "position": {
        "x": 19820,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "LD cans are not infinitely recyclable",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "11:05"
      }
    },
    {
      "id": "y167cA56EwQU",
      "type": "nodeCard",
      "position": {
        "x": 19250,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "2% of can is non-recyclable",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "11:05"
      }
    },
    {
      "id": "wC53fw6Yt1Mn",
      "type": "nodeCard",
      "position": {
        "x": -380,
        "y": 600
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Assumptive Reasoning",
        "body": "LD is making people believe something that haven't exactly claimed",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "11:23"
      }
    },
    {
      "id": "E6McomVATuOZ",
      "type": "nodeCard",
      "position": {
        "x": 20390,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Definitions",
        "body": "Infinitely recyclable does not mean 100% infinitely recyclable.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "11:55"
      }
    },
    {
      "id": "AvuaQkrljcs9",
      "type": "nodeCard",
      "position": {
        "x": 19630,
        "y": 900
      },
      "data": {
        "kind": "Agreement",
        "participantId": "B",
        "title": "only 99%",
        "body": "",
        "collapsed": true,
        "firstMention": "13:45"
      }
    },
    {
      "id": "7PNqy4xPJFhv",
      "type": "nodeCard",
      "position": {
        "x": 14310,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Glass Bottles can be reused",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "14:05",
        "selfCollapsed": false
      }
    },
    {
      "id": "OrUZhkHreoMw",
      "type": "nodeCard",
      "position": {
        "x": 14310,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Personal Experience",
        "body": "Him and associates regularly reuse glass bottles",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "14:05",
        "selfCollapsed": false
      }
    },
    {
      "id": "DWCBX8OByUVZ",
      "type": "nodeCard",
      "position": {
        "x": 2850,
        "y": 300
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "LD has bad intentions",
        "body": "LD is positioning itself as eco-friendly / healthy while not seriously pursuing either goal.\n\nResponded to:\n[[aDSFmEKUse5R|Mike Cessario: Company Origin]]\n[[bdFGHra0nzdw|Mike Cessario: Plastic in Cans has no effect on recyclability]]",
        "collapsed": true,
        "strengthType": "Type 1",
        "selfCollapsed": false
      }
    },
    {
      "id": "ue1VKjJq3ycu",
      "type": "nodeCard",
      "position": {
        "x": 3420,
        "y": 600
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "LD is not displacing water bottles",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "14:20",
        "selfCollapsed": false
      }
    },
    {
      "id": "2pC0RhqTwUZg",
      "type": "nodeCard",
      "position": {
        "x": 2660,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Bottle use continues to rise",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "14:30"
      }
    },
    {
      "id": "noWcIhZgl044",
      "type": "nodeCard",
      "position": {
        "x": 3230,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Major brands are failing",
        "body": "Most major bottled water brands are seeing a decrease in sales",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "15:35",
        "selfCollapsed": false
      }
    },
    {
      "id": "gls3cUhAFVyZ",
      "type": "nodeCard",
      "position": {
        "x": 3800,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "New Company",
        "body": "LD is still small, thus not causing major displacement",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "15:00"
      }
    },
    {
      "id": "GDtGcmdaIdHC",
      "type": "nodeCard",
      "position": {
        "x": 4180,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Still water small part",
        "body": "Only 10-15% of sales are from still water",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "15.15"
      }
    },
    {
      "id": "bsXuesqF2yxa",
      "type": "nodeCard",
      "position": {
        "x": 3040,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Smart Water",
        "body": "Smart Water is the only major brand not seeing a decrease in sales, and they are shifting toward aluminum bottles",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "15:40"
      }
    },
    {
      "id": "rfT6Ax9XjyJl",
      "type": "nodeCard",
      "position": {
        "x": 3420,
        "y": 1200
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Overall sales way up",
        "body": "Plastic water bottle sales are rising exponentially.",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "15:55"
      }
    },
    {
      "id": "S4dvorrnZkfq",
      "type": "nodeCard",
      "position": {
        "x": 9500,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "No more packs",
        "body": "They stopped selling \"Death Dust\"",
        "collapsed": true,
        "strengthType": "Type 4",
        "firstMention": "17:00"
      }
    },
    {
      "id": "vvS301Pib2QL",
      "type": "nodeCard",
      "position": {
        "x": 9880,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Packets might reduce overall waste",
        "body": "If people are wasting a tiny packet worth of plastic instead of a whole gatorade bottle, it will waste less",
        "collapsed": true,
        "strengthType": "Type 4",
        "firstMention": "17:30"
      }
    },
    {
      "id": "UGbs1zKOq7zv",
      "type": "nodeCard",
      "position": {
        "x": -1140,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "B",
        "title": "Coke bottles are not recyclable",
        "body": "Coke owns the shape of the glass bottle, so you can't commercially reuse.",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "18:45",
        "selfCollapsed": false
      }
    },
    {
      "id": "Ep8UNCTTok7o",
      "type": "nodeCard",
      "position": {
        "x": -950,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Glass is not Sustainable",
        "body": "Part of any big picture sustainability project is having infinitely recyclable materials.  Single use items like glass bottles can never be part of the long term vision\n\nNeeds Type 2 link showing answer for other vessels (SS)",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "18:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "cYWZiv6CeF52",
      "type": "nodeCard",
      "position": {
        "x": -760,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Glass is ok in landfills",
        "body": "Glass is just rocks, so filling up landfills with glass is not a problem in the way plastic is.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "19:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "m5HvclcXRl8a",
      "type": "nodeCard",
      "position": {
        "x": -760,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Energy",
        "body": "It takes less energy to make new glass than to recycle",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "19:35"
      }
    },
    {
      "id": "xvMX2urBkQHu",
      "type": "nodeCard",
      "position": {
        "x": 0,
        "y": 600
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Displacing Glass",
        "body": "LD might be displacing glass instead of displacing plastic",
        "collapsed": false,
        "strengthType": "Type 3",
        "firstMention": "20:35",
        "selfCollapsed": false
      }
    },
    {
      "id": "Rm2z0LDaPatH",
      "type": "nodeCard",
      "position": {
        "x": 0,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "No evidence",
        "body": "He claims Pool's only evidence is his personal opinion.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "20:50"
      }
    },
    {
      "id": "V5zw4IUGzsSh",
      "type": "nodeCard",
      "position": {
        "x": -1900,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Glass bottle have more plastic",
        "body": "Glass bottles have more plastic in their cap sealers and their stickers than LD cans.\n\nNeeds Type 2 link showing an answer for microplastics",
        "collapsed": true,
        "strengthType": "Type 2",
        "firstMention": "21:05",
        "selfCollapsed": false
      }
    },
    {
      "id": "nKRxQCsA4Apx",
      "type": "nodeCard",
      "position": {
        "x": -1520,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Some vessels have less or no plastic",
        "body": "Silicon top and paper sticker could have no plastic",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "21:15",
        "selfCollapsed": false
      }
    },
    {
      "id": "24PE2BzU0BAF",
      "type": "nodeCard",
      "position": {
        "x": -2850,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Exotic bottling options are not financially viable",
        "body": "No bottle except alcohol at $15 can budget for a cork",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "21:15",
        "selfCollapsed": false
      }
    },
    {
      "id": "Jp89qp3QViJ2",
      "type": "nodeCard",
      "position": {
        "x": -2850,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "LD is an expensive product",
        "body": "It's expensive enough to justify something better.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "21:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "InXDPssf6IqX",
      "type": "nodeCard",
      "position": {
        "x": -3040,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Personal Experience",
        "body": "He shopped around and can get plastic bottled water for 0.8c/oz and LD for 8-16c/oz = 8x cost",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "22:00"
      }
    },
    {
      "id": "z0V5WJJZTng2",
      "type": "nodeCard",
      "position": {
        "x": -2660,
        "y": 1200
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Distribution Costs",
        "body": "Products like LD have to go through distributers to get to retail. The only ones they can use are Beer distributers.  They want 30%.  Companies like LD need at  least 30% gross margin. Retail wants 35% profit. Giants like coke own all this in house.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "21:15",
        "selfCollapsed": false
      }
    },
    {
      "id": "Jzdcvl7BLge3",
      "type": "nodeCard",
      "position": {
        "x": 8360,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Slogan Change",
        "body": "Death to Plastic was appropriate in the past, but in today's climate it's time to change it to \"Death to Plastic Bottles\"",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "27:45"
      }
    },
    {
      "id": "CCoMEdlEQK4I",
      "type": "nodeCard",
      "position": {
        "x": 8360,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Timing of change implies insincerity",
        "body": "This change was only made after the company went negative virally, despite years of concerns with microplastics etc",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "29:05"
      }
    },
    {
      "id": "uEECDDbYDwRF",
      "type": "nodeCard",
      "position": {
        "x": 8360,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Viral image",
        "body": "They didn't make the distinction clear when they had a positive viral moment with a plastic bottle and a LD bottle",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "29:10"
      }
    },
    {
      "id": "k9GH6Perqoy4",
      "type": "nodeCard",
      "position": {
        "x": 7980,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Articles",
        "body": "Articles from 3 years ago called out LD for plastic liners",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "29:10"
      }
    },
    {
      "id": "UNjv8CuAxso8",
      "type": "nodeCard",
      "position": {
        "x": 8740,
        "y": 1200
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Few people have problem",
        "body": "Internal data shows that few of their customers are unhappy with the plastic in the cans.  They didn't feel the need to address such a niche group until this blew up virally",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "30:00"
      }
    },
    {
      "id": "GqCFcGPdk4o3",
      "type": "nodeCard",
      "position": {
        "x": 2090,
        "y": 600
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "LD is dishonest in an FTC way",
        "body": "Death to Plastic is misleading in a similar way to how Red Bull Gives You Wings was found to be by the FTC.",
        "collapsed": false,
        "strengthType": "Type 1",
        "firstMention": "30:55",
        "selfCollapsed": false
      }
    },
    {
      "id": "omIwDo0rOg8W",
      "type": "nodeCard",
      "position": {
        "x": 1900,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Internal vs External Messaging",
        "body": "Saying Death to Plastic while knowing that some of their customers thought that meant no plastic in the products fits the fact pattern with Red Bull",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "31:30"
      }
    },
    {
      "id": "zr4I6MGfOmeY",
      "type": "nodeCard",
      "position": {
        "x": 2280,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "DTP is a Point of View",
        "body": "",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "31:40",
        "selfCollapsed": false
      }
    },
    {
      "id": "YumGxK0BcaPy",
      "type": "nodeCard",
      "position": {
        "x": 7600,
        "y": 600
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Recent ad",
        "body": "Their recent ad with Whitney Cummings was about recycling, not health.",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "32:00"
      }
    },
    {
      "id": "ZMW1WM0F3Jv4",
      "type": "nodeCard",
      "position": {
        "x": 7600,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Double Meaning of Ad",
        "body": "Tim, seemingly in jest, speculates that the ad, which was comically about stuffing plastic into your body, was giving a secret nod to microplastics leeching into your body.",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "32:05"
      }
    },
    {
      "id": "QFTrNaFt6HBp",
      "type": "nodeCard",
      "position": {
        "x": -1520,
        "y": 1200
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "Still not perfect",
        "body": "Even with a perfect glass bottle, the water will still touch plastic in the factory and other points in the supply chain.  Every option has microplastics",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "35:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "6WCSFyjAmq8g",
      "type": "nodeCard",
      "position": {
        "x": -1900,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "A",
        "title": "Glass bottles actually have less plastic",
        "body": "He reads something saying pop caps have 0.03-0.05g of plastic (which is less than an earlier cited number for the LD cans)",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "37.20",
        "selfCollapsed": false
      }
    },
    {
      "id": "T1yN6nC59BSs",
      "type": "nodeCard",
      "position": {
        "x": -1900,
        "y": 1200
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Mineragua",
        "body": "Comparable price to LD",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "38:40",
        "selfCollapsed": false
      }
    },
    {
      "id": "TiAvJLRTlQoe",
      "type": "nodeCard",
      "position": {
        "x": 15830,
        "y": 600
      },
      "data": {
        "kind": "Agreement",
        "participantId": "A",
        "title": "Starting naivete",
        "body": "Tim understands how they could have started without thinking about microplastics",
        "collapsed": true,
        "firstMention": "38:55"
      }
    },
    {
      "id": "ivh4k02x7m9k40arqd0bc",
      "type": "nodeCard",
      "position": {
        "x": 5320,
        "y": 600
      },
      "data": {
        "kind": "Argument",
        "participantId": "A",
        "title": "Treatment of Skaters",
        "body": "Mike Cessario betrayed the skate team by cutting off their sponsorship after they were with him from the beginning.",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "53:00",
        "selfCollapsed": false
      }
    },
    {
      "id": "xs7wtxmio3e09lrshb8aswe",
      "type": "nodeCard",
      "position": {
        "x": 4940,
        "y": 900
      },
      "data": {
        "kind": "Evidence",
        "participantId": "A",
        "title": "Total Cost",
        "body": "The whole skate team cost $40,000/yr which should have been worth the loyalty from such a big company.\nReferenced again at 56:00",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "53:30"
      }
    },
    {
      "id": "z7dcak02c7bcd117cao6q",
      "type": "nodeCard",
      "position": {
        "x": 6080,
        "y": 900
      },
      "data": {
        "kind": "Counter",
        "participantId": "B",
        "title": "PR agency",
        "body": "Once they had a real marketing budget, he couldn't justify giving money to his friends when they weren't even tracking performance.",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "55:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "00mp2dct",
      "type": "nodeCard",
      "position": {
        "x": 6460,
        "y": 270
      },
      "data": {
        "id": "00mp2dct",
        "title": "Argument Summary",
        "body": "The practices and intentions of LD demonstrate a pattern of dishonesty, specifically regarding the phrase \"Death to Plastic\".\nThey could be selling products with less plastic and doing more to disclose their current plastic use but chose to knowingly deceive its customers deliberately.",
        "kind": "Argument Summary",
        "participantId": "A",
        "collapsed": true,
        "selfCollapsed": false
      }
    },
    {
      "id": "chhjg22l",
      "type": "nodeCard",
      "position": {
        "x": 17350,
        "y": 270
      },
      "data": {
        "id": "chhjg22l",
        "title": "Argument Summary",
        "body": "The focus of the company has always been on waste, any any failure to disclose was because concerns related to non-waste issues were trivial until recently.",
        "kind": "Argument Summary",
        "participantId": "B",
        "collapsed": true,
        "selfCollapsed": false
      }
    },
    {
      "id": "glp072q9",
      "type": "nodeCard",
      "position": {
        "x": 2280,
        "y": 1200
      },
      "data": {
        "id": "glp072q9",
        "title": "Didn't say Death to All Plastic",
        "body": "",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "31:50"
      }
    },
    {
      "id": "eit1q20m",
      "type": "nodeCard",
      "position": {
        "x": 0,
        "y": 1200
      },
      "data": {
        "id": "eit1q20m",
        "title": "No evidence",
        "body": "There is no evidence that LD is displacing more plastic bottles than glass bottles.",
        "kind": "Counter",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "21:00"
      }
    },
    {
      "id": "8401yf9w",
      "type": "nodeCard",
      "position": {
        "x": 16210,
        "y": 300
      },
      "data": {
        "id": "8401yf9w",
        "title": "DTP is a marketing tagline",
        "body": "This is not a claim, it's like Just do it or Gives you Wings\n\nResponded to:\n[[PRfATbP7XNik|Tim Pool: Market expectations]]",
        "kind": "Argument",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "27:10",
        "selfCollapsed": false
      }
    },
    {
      "id": "i6b0ohgg",
      "type": "nodeCard",
      "position": {
        "x": 1330,
        "y": 600
      },
      "data": {
        "id": "i6b0ohgg",
        "title": "LD is acting like a standard bev company",
        "body": "",
        "kind": "Argument",
        "participantId": "A",
        "collapsed": false,
        "strengthType": "Type 1",
        "firstMention": "34:10",
        "selfCollapsed": false
      }
    },
    {
      "id": "bpgcqrq5",
      "type": "nodeCard",
      "position": {
        "x": 1520,
        "y": 900
      },
      "data": {
        "id": "bpgcqrq5",
        "title": "Same plastic footprint",
        "body": "Can for can, they produce the same amount of plastic as standard soda companies.",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3"
      }
    },
    {
      "id": "sa9qlsee",
      "type": "nodeCard",
      "position": {
        "x": 1140,
        "y": 900
      },
      "data": {
        "id": "sa9qlsee",
        "title": "Moving into Soft Drinks",
        "body": "Them moving more into soft drinks is them behaving less disruptively to plastic.",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3"
      }
    },
    {
      "id": "63zttnus",
      "type": "nodeCard",
      "position": {
        "x": -2280,
        "y": 900
      },
      "data": {
        "id": "63zttnus",
        "title": "Glass bottles use a lot of plastic",
        "body": "Glass bottle caps have ~3g of plastic.\nCan liner is 0.5g.\nAnother couple grams of plastic on most glass bottle labels.\n5-6g total.",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "35.20",
        "selfCollapsed": false
      }
    },
    {
      "id": "miztw2j3",
      "type": "nodeCard",
      "position": {
        "x": 760,
        "y": 600
      },
      "data": {
        "id": "miztw2j3",
        "title": "LD is a contributor to the plastic market, not a disrupter",
        "body": "",
        "kind": "Argument",
        "participantId": "A",
        "collapsed": false,
        "strengthType": "Type 3",
        "firstMention": "39:15",
        "selfCollapsed": false
      }
    },
    {
      "id": "sa619xe3",
      "type": "nodeCard",
      "position": {
        "x": 20010,
        "y": 900
      },
      "data": {
        "id": "sa619xe3",
        "title": "Implies 100%",
        "body": "Infinitely recyclable gives the impression that the can is 100% aluminum and can be fully infinitely recycled",
        "kind": "Argument",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "39:25"
      }
    },
    {
      "id": "x3mcseyo",
      "type": "nodeCard",
      "position": {
        "x": 20010,
        "y": 1200
      },
      "data": {
        "id": "x3mcseyo",
        "title": "Stretching",
        "body": "By saying that the cans are not infinitely recyclable, Tim Pool is \"stretching\"",
        "kind": "Counter",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "39:35"
      }
    },
    {
      "id": "1ev0iqvl",
      "type": "nodeCard",
      "position": {
        "x": 6840,
        "y": 600
      },
      "data": {
        "id": "1ev0iqvl",
        "title": "Earlier Statements show LD is ok lying to customers",
        "body": "Earlier in the debate, Cessario admitted some people thought the products were plastic free. Even if that is a small percentage, there are certainly some people, like Tim, reaching the wrong conclusion as a net result of all their marketing, branding, etc. ",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "41:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "31q2qaqh",
      "type": "nodeCard",
      "position": {
        "x": 380,
        "y": 600
      },
      "data": {
        "id": "31q2qaqh",
        "title": "Inconsitent Statements",
        "body": "LD (via its CEO) has been inconsistent in statements on charitable donations.",
        "kind": "Argument",
        "participantId": "A",
        "collapsed": false,
        "strengthType": "Type 3",
        "firstMention": "44:30",
        "selfCollapsed": false
      }
    },
    {
      "id": "mz66h92f",
      "type": "nodeCard",
      "position": {
        "x": 380,
        "y": 900
      },
      "data": {
        "id": "mz66h92f",
        "title": "Disproven Claim",
        "body": "Cessario said the company never had \"10% to charity\" on its website, then Pool showed him an archived copy of the website with that claim.",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "44:30"
      }
    },
    {
      "id": "uf9f7j9d",
      "type": "nodeCard",
      "position": {
        "x": 16780,
        "y": 900
      },
      "data": {
        "id": "uf9f7j9d",
        "title": "Few donations",
        "body": "The amount of donations seems small relative to the size of the company.",
        "kind": "Counter",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "46:15"
      }
    },
    {
      "id": "6kqcdk5q",
      "type": "nodeCard",
      "position": {
        "x": 16590,
        "y": 1200
      },
      "data": {
        "id": "6kqcdk5q",
        "title": "Main charity is small",
        "body": "5 Gyres is the main charity LD talks about, and the most recent IRS forms show a total of 1.2 mil in 2023",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "45:30"
      }
    },
    {
      "id": "ts8kt7he",
      "type": "nodeCard",
      "position": {
        "x": 16590,
        "y": 1500
      },
      "data": {
        "id": "ts8kt7he",
        "title": "There are not many charities in this space",
        "body": "",
        "kind": "Counter",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "48:30"
      }
    },
    {
      "id": "bdy2nwun",
      "type": "nodeCard",
      "position": {
        "x": 16970,
        "y": 1200
      },
      "data": {
        "id": "bdy2nwun",
        "title": "Not profitable",
        "body": "LD cannot donate much because it is still not profitable.",
        "kind": "Counter",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "48:30"
      }
    },
    {
      "id": "yxnud4j1",
      "type": "nodeCard",
      "position": {
        "x": 16970,
        "y": 1500
      },
      "data": {
        "id": "yxnud4j1",
        "title": "Body Armor",
        "body": "Body Armor had to reach $800 mil revenue before they hit profitability.",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "50:24"
      }
    },
    {
      "id": "jajvfgmb",
      "type": "nodeCard",
      "position": {
        "x": 4560,
        "y": 900
      },
      "data": {
        "id": "jajvfgmb",
        "title": "Skaters gave great value",
        "body": "Richie always made sure to get LD cans in Tim Pool videos.",
        "kind": "Evidence",
        "participantId": "A",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "53:15"
      }
    },
    {
      "id": "gnmprh9z",
      "type": "nodeCard",
      "position": {
        "x": 6080,
        "y": 1200
      },
      "data": {
        "id": "gnmprh9z",
        "title": "Never sponsored skaters",
        "body": "The company never attempted to compete in the skating arena because it was dominated by energy drinks.",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "54:50",
        "selfCollapsed": false
      }
    },
    {
      "id": "fkfpfof5",
      "type": "nodeCard",
      "position": {
        "x": 5510,
        "y": 900
      },
      "data": {
        "id": "fkfpfof5",
        "title": "LD did right by the skaters",
        "body": "",
        "kind": "Counter",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 1",
        "firstMention": "58:30"
      }
    },
    {
      "id": "3r32mwrv",
      "type": "nodeCard",
      "position": {
        "x": 5700,
        "y": 1200
      },
      "data": {
        "id": "3r32mwrv",
        "title": "TV Show",
        "body": "LD paid $20k to a skater for a show that failed, and they kept paying him his regular fee for years after.",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "58:30"
      }
    },
    {
      "id": "oj5uk3j2",
      "type": "nodeCard",
      "position": {
        "x": 5320,
        "y": 1200
      },
      "data": {
        "id": "oj5uk3j2",
        "title": "The skaters thanked him",
        "body": "Many of the skaters expressed positive sentiment at the end of the sponsorship.\nRichie was the only disgruntled skater.",
        "kind": "Evidence",
        "participantId": "B",
        "collapsed": true,
        "strengthType": "Type 3",
        "firstMention": "48:45"
      }
    }
  ],
  "edges": [
    {
      "id": "rpo0CsoiE5vt",
      "source": "thesisA",
      "target": "6uGZ4amBEWLu",
      "label": "supports",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "markerEnd": {
        "type": "arrowclosed"
      },
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "aUX63hoKwJUf",
      "source": "thesisA",
      "target": "YXM058toX8IO",
      "label": "supports",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "markerEnd": {
        "type": "arrowclosed"
      },
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "yu2DzT5dHoQk",
      "source": "atJQK2ajoQgJ",
      "target": "6uGZ4amBEWLu",
      "label": "evidence of",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "markerEnd": {
        "type": "arrowclosed"
      },
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "PF7tcpLRZi0i",
      "source": "thesisA",
      "target": "PRfATbP7XNik",
      "label": "supports",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "markerEnd": {
        "type": "arrowclosed"
      },
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "YwcoWRJXRDCH",
      "source": "depkZmMCcHQe",
      "target": "PRfATbP7XNik",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "uNv1wggxGNfI",
      "source": "thesisB",
      "target": "aDSFmEKUse5R",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "LywczITlk3jQ",
      "source": "8jLAq6SubwmG",
      "target": "aDSFmEKUse5R",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "8ZtXtOTJgAgP",
      "source": "IazvrsToRwU8",
      "target": "aDSFmEKUse5R",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "BMAh1rBaIAjW",
      "source": "cYrgUGv5DGCe",
      "target": "aDSFmEKUse5R",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "YNPTK1Wjq79c",
      "source": "thesisB",
      "target": "N09yXC0wBRK1",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "S4RC4pI2aQQY",
      "source": "ivJqzrY5AbqK",
      "target": "N09yXC0wBRK1",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "62zVHYptnQSJ",
      "source": "4Cj7gb2cP3FS",
      "target": "N09yXC0wBRK1",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "rRTfj42aA43G",
      "source": "thesisB",
      "target": "xj5Ea3KE1v5f",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Kq67InrxCEB3",
      "source": "USv5TqqdtL4W",
      "target": "xj5Ea3KE1v5f",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ov9awDTX2uno",
      "source": "thesisB",
      "target": "X3K3fIAQTRaC",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "8BXuqvyMNRPd",
      "source": "Y1bWT1WbDu0g",
      "target": "X3K3fIAQTRaC",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Ca45N8pcYRyg",
      "source": "oMmXTax9TCxD",
      "target": "X3K3fIAQTRaC",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "F7SDtV3qTYrX",
      "source": "thesisB",
      "target": "CzNV7BJ9G245",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "lekcAKX5hiPT",
      "source": "ckobt2UvGXPH",
      "target": "CzNV7BJ9G245",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Wkt0MfheOxNY",
      "source": "thesisB",
      "target": "idxVkJfd8hZl",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "E4J8INotklKD",
      "source": "TBr4kwPh6j3r",
      "target": "idxVkJfd8hZl",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ymGCAXF6C4Cg",
      "source": "3ixvC2x1zRNi",
      "target": "idxVkJfd8hZl",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ckUbmDjJd807",
      "source": "thesisB",
      "target": "bdFGHra0nzdw",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "2pgclprwt2m1",
      "source": "VQAYkK21yI2i",
      "target": "bdFGHra0nzdw",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "JY9C6fI9vkWE",
      "source": "EiHVJACKV8Ro",
      "target": "bdFGHra0nzdw",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "0mFX9sDBDyGi",
      "source": "vBdRdfAAohGM",
      "target": "EiHVJACKV8Ro",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "TzKOUgkrjlyA",
      "source": "Md5zYuTDoyUe",
      "target": "bdFGHra0nzdw",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "IPf6560hcrxj",
      "source": "y167cA56EwQU",
      "target": "Md5zYuTDoyUe",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "x4pCTV1lhJye",
      "source": "DWCBX8OByUVZ",
      "target": "wC53fw6Yt1Mn",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "VNkZkDnC15Is",
      "source": "E6McomVATuOZ",
      "target": "Md5zYuTDoyUe",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "lvEaWOIhfpmP",
      "source": "AvuaQkrljcs9",
      "target": "Md5zYuTDoyUe",
      "label": "agrees →",
      "data": {
        "kind": "agrees-with"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#06b6d4"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Mb1yFYZO6RuS",
      "source": "7PNqy4xPJFhv",
      "target": "N09yXC0wBRK1",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "1MWqWPQifUA3",
      "source": "OrUZhkHreoMw",
      "target": "7PNqy4xPJFhv",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "dB69tZ3VyIZU",
      "source": "thesisA",
      "target": "DWCBX8OByUVZ",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "nvaobh6DTupc",
      "source": "DWCBX8OByUVZ",
      "target": "ue1VKjJq3ycu",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "mMwVcd9T8AER",
      "source": "2pC0RhqTwUZg",
      "target": "ue1VKjJq3ycu",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "c6Hgu7JCxb2z",
      "source": "noWcIhZgl044",
      "target": "ue1VKjJq3ycu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "8dInyDNbkmYe",
      "source": "gls3cUhAFVyZ",
      "target": "ue1VKjJq3ycu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "8LCKL4bPcOjX",
      "source": "GDtGcmdaIdHC",
      "target": "ue1VKjJq3ycu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "HVW1Oz3KzR8D",
      "source": "bsXuesqF2yxa",
      "target": "noWcIhZgl044",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "8qd2IEVW53Yc",
      "source": "rfT6Ax9XjyJl",
      "target": "noWcIhZgl044",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "LjAZT4lPuJNE",
      "source": "S4dvorrnZkfq",
      "target": "6uGZ4amBEWLu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "yqRDZIdVYufj",
      "source": "vvS301Pib2QL",
      "target": "6uGZ4amBEWLu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ZSg4vRaiHrwX",
      "source": "UGbs1zKOq7zv",
      "target": "Ep8UNCTTok7o",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Re08q9Qrtrn7",
      "source": "Ep8UNCTTok7o",
      "target": "YXM058toX8IO",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "KV3HEoRtEn8W",
      "source": "cYWZiv6CeF52",
      "target": "Ep8UNCTTok7o",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "X8iBjDHXOJou",
      "source": "m5HvclcXRl8a",
      "target": "cYWZiv6CeF52",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "rmnUZnLGnkY5",
      "source": "DWCBX8OByUVZ",
      "target": "xvMX2urBkQHu",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "1ctStjlMkeO7",
      "source": "Rm2z0LDaPatH",
      "target": "xvMX2urBkQHu",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "P4Vp3detci9w",
      "source": "V5zw4IUGzsSh",
      "target": "YXM058toX8IO",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "mutX0zcx0lBP",
      "source": "nKRxQCsA4Apx",
      "target": "V5zw4IUGzsSh",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ZlokFjhLJe3o",
      "source": "24PE2BzU0BAF",
      "target": "YXM058toX8IO",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "OPk0Qb4w0zTV",
      "source": "Jp89qp3QViJ2",
      "target": "24PE2BzU0BAF",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "Pm5Ia1l2p9yd",
      "source": "InXDPssf6IqX",
      "target": "Jp89qp3QViJ2",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "ForrdYgoJV08",
      "source": "z0V5WJJZTng2",
      "target": "Jp89qp3QViJ2",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "jligzG98Nb0U",
      "source": "Jzdcvl7BLge3",
      "target": "PRfATbP7XNik",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "xNL7Qkag3g7N",
      "source": "CCoMEdlEQK4I",
      "target": "Jzdcvl7BLge3",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "R1QFntdrafKG",
      "source": "uEECDDbYDwRF",
      "target": "CCoMEdlEQK4I",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "5CVTGK9L2kYH",
      "source": "k9GH6Perqoy4",
      "target": "CCoMEdlEQK4I",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "YV8sRnqpSBB6",
      "source": "UNjv8CuAxso8",
      "target": "CCoMEdlEQK4I",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "0HHlPzSc31hj",
      "source": "DWCBX8OByUVZ",
      "target": "GqCFcGPdk4o3",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "pIXiEZ3eptEw",
      "source": "omIwDo0rOg8W",
      "target": "GqCFcGPdk4o3",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "AQokFdKdDGvW",
      "source": "zr4I6MGfOmeY",
      "target": "GqCFcGPdk4o3",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "xo7fmgWTvVpp",
      "source": "YumGxK0BcaPy",
      "target": "PRfATbP7XNik",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "jR0h9msrO8pF",
      "source": "ZMW1WM0F3Jv4",
      "target": "YumGxK0BcaPy",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "QKdXzmPGDKKm",
      "source": "QFTrNaFt6HBp",
      "target": "nKRxQCsA4Apx",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "mb4mLUc0dHZM",
      "source": "6WCSFyjAmq8g",
      "target": "V5zw4IUGzsSh",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "YxSjLz7TtkwU",
      "source": "T1yN6nC59BSs",
      "target": "6WCSFyjAmq8g",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "4kvlCCvjwfxU",
      "source": "TiAvJLRTlQoe",
      "target": "aDSFmEKUse5R",
      "label": "agrees →",
      "data": {
        "kind": "agrees-with"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#06b6d4"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "zpvynyioi9f6rrwue1ymtn",
      "source": "DWCBX8OByUVZ",
      "target": "ivh4k02x7m9k40arqd0bc",
      "label": "supports →",
      "data": {
        "kind": "supports"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#22c55e"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "hmdi6zfka4t72ps6r4j2wv",
      "source": "xs7wtxmio3e09lrshb8aswe",
      "target": "ivh4k02x7m9k40arqd0bc",
      "label": "evidence of →",
      "data": {
        "kind": "evidence-of"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#f59e0b"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "7sql343dzl3ascraw4i6e",
      "source": "z7dcak02c7bcd117cao6q",
      "target": "ivh4k02x7m9k40arqd0bc",
      "label": "counter →",
      "data": {
        "kind": "attacks"
      },
      "type": "smoothstep",
      "style": {
        "stroke": "#ef4444"
      },
      "labelBgStyle": {
        "fill": "#0b1220",
        "fillOpacity": 0.6,
        "stroke": "#111827"
      },
      "labelStyle": {
        "fill": "#e5e7eb",
        "fontSize": 10
      }
    },
    {
      "id": "d0cvdukp",
      "source": "thesisA",
      "target": "00mp2dct",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "2v4bozq4",
      "source": "thesisB",
      "target": "chhjg22l",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "1rqi0v9a",
      "source": "glp072q9",
      "target": "zr4I6MGfOmeY",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "zcnkpspv",
      "source": "eit1q20m",
      "target": "Rm2z0LDaPatH",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "yrq7bt4b",
      "source": "thesisB",
      "target": "8401yf9w",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "nllw9dbk",
      "source": "DWCBX8OByUVZ",
      "target": "i6b0ohgg",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "9icm5zlw",
      "source": "bpgcqrq5",
      "target": "i6b0ohgg",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "mutn6btr",
      "source": "sa9qlsee",
      "target": "i6b0ohgg",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "n8ygu7tc",
      "source": "63zttnus",
      "target": "V5zw4IUGzsSh",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "ccw2z2zp",
      "source": "DWCBX8OByUVZ",
      "target": "miztw2j3",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "y4t70rmw",
      "source": "Md5zYuTDoyUe",
      "target": "sa619xe3",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "0780z6mo",
      "source": "x3mcseyo",
      "target": "sa619xe3",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "9bfa5n1o",
      "source": "1ev0iqvl",
      "target": "PRfATbP7XNik",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "bs5qhf5a",
      "source": "DWCBX8OByUVZ",
      "target": "31q2qaqh",
      "type": "thick",
      "data": {
        "kind": "supports"
      }
    },
    {
      "id": "bbxcehpm",
      "source": "mz66h92f",
      "target": "31q2qaqh",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "9mzudfdo",
      "source": "uf9f7j9d",
      "target": "USv5TqqdtL4W",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "k1dr1jhi",
      "source": "6kqcdk5q",
      "target": "uf9f7j9d",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "noswk3gk",
      "source": "ts8kt7he",
      "target": "6kqcdk5q",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "o8yhhrv9",
      "source": "bdy2nwun",
      "target": "uf9f7j9d",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "lsxsbtzi",
      "source": "yxnud4j1",
      "target": "bdy2nwun",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "o3cmdj3w",
      "source": "jajvfgmb",
      "target": "ivh4k02x7m9k40arqd0bc",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "8uvgonza",
      "source": "gnmprh9z",
      "target": "z7dcak02c7bcd117cao6q",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "k9t9qlgt",
      "source": "fkfpfof5",
      "target": "ivh4k02x7m9k40arqd0bc",
      "type": "thick",
      "data": {
        "kind": "attacks"
      }
    },
    {
      "id": "nehe473m",
      "source": "3r32mwrv",
      "target": "fkfpfof5",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "rl4hmz13",
      "source": "oj5uk3j2",
      "target": "fkfpfof5",
      "type": "thick",
      "data": {
        "kind": "evidence-of"
      }
    },
    {
      "id": "piqvqlxv",
      "source": "6uGZ4amBEWLu",
      "target": "PRfATbP7XNik",
      "type": "t2",
      "data": {
        "kind": "t2-link"
      }
    },
    {
      "id": "w1mp2j94",
      "source": "4Cj7gb2cP3FS",
      "target": "ivJqzrY5AbqK",
      "type": "t2",
      "data": {
        "kind": "t2-link"
      }
    }
  ],
  "participants": [
    {
      "id": "A",
      "name": "Tim Pool"
    },
    {
      "id": "B",
      "name": "Mike Cessario"
    }
  ]
}
  
  const handleSampleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === 'sample1') {
      store.loadSnapshot(dummySnapshot)
      syncFromStore()
    }
    e.target.value = ''
  }
  
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

	<fieldset>
          <legend>Preloaded Maps</legend>
          <div className="toolbar">
          </div>
          <select onChange={handleSampleChange} style={{ marginTop: 10 }}>
            <option value="">Select a map...</option>
            <option value="sample1">Tim Pool vs Mike Cessario</option>
          </select>
          
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
              <div className="legend__swatch" style={{ background: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0' }} />
              <div className="legend__label">Type 1 - If this is true, than the main claim is true</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }} />
              <div className="legend__label">Type 2 — If this, and the specifically described other argument is true, than the main claim is true (dashed link connects to other argument)</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              <div className="legend__label">Type 3 - This only adds general support</div>
            </div>
            <div className="legend__item">
              <div className="legend__swatch" style={{ background: 'repeating-linear-gradient(135deg,#f3f4f6, #f3f4f6 6px,#e5e7eb 6px,#e5e7eb 12px)', borderRadius: 8, border: '1px solid #9ca3af' }} />
              <div className="legend__label">Type 4 — This adds no meaningful support</div>
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
