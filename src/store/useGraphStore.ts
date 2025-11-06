import { create } from 'zustand'
import type { DebateNode, DebateEdge, DebateData, StatementKind, StrengthType } from '../graph/types'
import { computeLayout } from '../graph/layout'
function nid() { return Math.random().toString(36).slice(2, 10) }
type Participant = { id: string, name: string }
type Snapshot = {
  nodes: DebateNode[]
  edges: DebateEdge[]
  participants: Participant[]
}
type Store = Snapshot & {
  addThesis: (participantId: string, title: string, body?: string, firstMention?: string) => string
  addArgument: (participantId: string, title: string, body?: string, parentId?: string, strengthType?: StrengthType, firstMention?: string) => string
  addCounter: (participantId: string, targetId: string, title: string, body?: string, strengthType?: StrengthType, firstMention?: string) => string
  addEvidence: (participantId: string, targetId: string, title: string, body?: string, strengthType?: StrengthType, firstMention?: string) => string
  addAgreement: (participantId: string, targetId: string, title: string, body?: string, firstMention?: string) => string
  addArgumentSummary: (participantId: string, thesisId: string, title: string, body?: string, firstMention?: string) => string
  updateNode: (id: string, patch: Partial<DebateData>) => void
  deleteNode: (id: string) => void
  setAllCollapsed: (v: boolean) => void
  loadSnapshot: (s: Snapshot) => void
  getSnapshot: () => Snapshot
  updateParticipant: (id: string, name: string) => void
  setSupportsParent: (childId: string, newParentId: string) => void
  setEdgeTarget: (nodeId: string, edgeKind: 'attacks'|'evidence-of'|'agrees-with', newTargetId: string) => void
  addT2Links: (sourceId: string, targets: string[]) => void
  setT2Links: (sourceId: string, targets: string[]) => void
  // UI helpers for reattach-by-click
  selectedNodeId: string
  setSelectedNodeId: (id: string) => void
  reparentTargetId: string
  setReparentTargetId: (id: string) => void
  eligibleAttachTargets: string[]
  setEligibleAttachTargets: (ids: string[]) => void
  // Add these new properties:
  linkHighlight: { sourceId: string, targetId: string } | null;
  setLinkHighlight: (highlight: { sourceId: string, targetId: string } | null) => void;
  // Add these new properties:
  filters: {
    participants: Set<string>;
    kinds: Set<StatementKind>;
    strengths: Set<StrengthType>;
  };
  setParticipantFilter: (id: string, active: boolean) => void;
  setKindFilter: (kind: StatementKind, active: boolean) => void;
  setStrengthFilter: (strength: StrengthType, active: boolean) => void;
  clearFilters: () => void;
  filterMode: 'dim' | 'hide';
  setFilterMode: (mode: 'dim' | 'hide') => void;
  // Convenience: return the current participants + kind list for UIs
  getLegendKinds: () => string[]
  // New: add participant
  addParticipant: () => string
  // New: for refers-to links
  addRefLinks: (sourceId: string, targets: string[]) => void
  setRefLinks: (sourceId: string, targets: string[]) => void
}
function node(kind: StatementKind, participantId: string, title: string, body?: string, strengthType?: StrengthType, firstMention?: string): DebateNode {
  return {
    id: nid(),
    type: 'nodeCard',
    position: { x: 0, y: 0 },
    data: {
      id: '',
      title,
      body,
      kind,
      participantId,
      collapsed: false,
      selfCollapsed: false, // Add this field
      strengthType,
      firstMention
    } as DebateData
  }
}
function edge(kind: 'supports'|'evidence-of'|'attacks'|'agrees-with'|'t2-link'|'refers-to', source: string, target: string): DebateEdge {
  return { id: nid(), source, target, type: kind === 't2-link' || kind === 'refers-to' ? 't2' : 'thick', data: { kind } as any }
}
// keep your initial state as-is or adjusted if needed
export const useGraphStore = create<Store>((set, get) => ({
  nodes: [
    { id: 'thesisA', type: 'nodeCard', position: {x: 0, y: 0}, data: { id: '', title: 'Thesis A', body: '', kind: 'Thesis', participantId: 'A', collapsed: false } },
    { id: 'thesisB', type: 'nodeCard', position: {x: 0, y: 0}, data: { id: '', title: 'Thesis B', body: '', kind: 'Thesis', participantId: 'B', collapsed: false } },
  ],
  edges: [],
  participants: [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
  ],
  // UI reattach helpers (defaults)
  selectedNodeId: '',
  reparentTargetId: '',
  eligibleAttachTargets: [],
  setSelectedNodeId(id: string) { set(() => ({ selectedNodeId: id })) },
  setReparentTargetId(id: string) { set(() => ({ reparentTargetId: id })) },
  setEligibleAttachTargets(ids: string[]) { set(() => ({ eligibleAttachTargets: ids })) },
  // Add these new properties:
  linkHighlight: null,
  setLinkHighlight(highlight) { set(() => ({ linkHighlight: highlight })) },
  // Add these new properties:
  filters: {
    participants: new Set<string>(),
    kinds: new Set<StatementKind>(),
    strengths: new Set<StrengthType>(),
  },
  setParticipantFilter(id, active) {
    set(st => {
      const participants = new Set(st.filters.participants)
      if (active) participants.add(id)
      else participants.delete(id)
      return { filters: { ...st.filters, participants } }
    })
  },
  setKindFilter(kind, active) {
    set(st => {
      const kinds = new Set(st.filters.kinds)
      if (active) kinds.add(kind)
      else kinds.delete(kind)
      return { filters: { ...st.filters, kinds } }
    })
  },
  setStrengthFilter(strength, active) {
    set(st => {
      const strengths = new Set(st.filters.strengths)
      if (active) strengths.add(strength)
      else strengths.delete(strength)
      return { filters: { ...st.filters, strengths } }
    })
  },
  clearFilters() {
    set({ filters: { participants: new Set(), kinds: new Set(), strengths: new Set() } })
  },
  filterMode: 'dim',
  setFilterMode(mode) { set({ filterMode: mode }) },
  // Convenience: return the current participants + kind list for UIs
  getLegendKinds() {
    return ['Thesis','Argument','Argument Summary','Counter','Evidence','Agreement']
  },
  // New: add participant
  addParticipant() {
    const s = get()
    const existingIds = s.participants.map(p => p.id)
    const maxCharCode = existingIds.length > 0 ? Math.max(...existingIds.map(id => id.charCodeAt(0))) : 64 // 'A' - 1
    const nextId = String.fromCharCode(maxCharCode + 1)
    const newParticipant = { id: nextId, name: nextId }
    set(st => ({ participants: [...st.participants, newParticipant] }))
    return nextId
  },
  addThesis(participantId, title, body, firstMention) {
    const n = node('Thesis', participantId, title, body, undefined, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    return n.id
  },
  addArgument(participantId, title, body, parentId, strengthType, firstMention) {
    const n = node('Argument', participantId, title, body, strengthType, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    if (parentId) {
      const e = edge('supports', parentId, n.id)
      set(st => ({ edges: [...st.edges, e] }))
    }
    return n.id
  },
  addCounter(participantId, targetId, title, body, strengthType, firstMention) {
    const n = node('Counter', participantId, title, body, strengthType, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    const e = edge('attacks', n.id, targetId)
    set(st => ({ edges: [...st.edges, e] }))
    return n.id
  },
  addEvidence(participantId, targetId, title, body, strengthType, firstMention) {
    const n = node('Evidence', participantId, title, body, strengthType, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    const e = edge('evidence-of', n.id, targetId)
    set(st => ({ edges: [...st.edges, e] }))
    return n.id
  },
  addAgreement(participantId, targetId, title, body, firstMention) {
    const n = node('Agreement', participantId, title, body, undefined, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    const e = edge('agrees-with', n.id, targetId)
    set(st => ({ edges: [...st.edges, e] }))
    return n.id
  },
  addArgumentSummary(participantId, thesisId, title, body, firstMention) {
    const n = node('Argument Summary', participantId, title, body, undefined, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    const e = edge('supports', thesisId, n.id)
    set(st => ({ edges: [...st.edges, e] }))
    return n.id
  },
  updateNode(id, patch) {
    set(st => ({
      nodes: st.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    }))
  },
  deleteNode(id) {
    const s = get()
    // remove node
    const keptNodes = s.nodes.filter(n => n.id !== id)
    // remove edges connected to it
    const keptEdges = s.edges.filter(e => e.source !== id && e.target !== id)
    set({ nodes: keptNodes, edges: keptEdges })
  },
  setAllCollapsed(v) {
    set(st => ({
      nodes: st.nodes.map(n => ({ ...n, data: { ...n.data, collapsed: v } }))
    }))
  },
  loadSnapshot(snap) {
    set(snap)
  },
  getSnapshot() {
    const s = get()
    return { nodes: s.nodes, edges: s.edges, participants: s.participants }
  },
  updateParticipant(id, name) {
    set(st => ({
      participants: st.participants.map(p => p.id === id ? { ...p, name } : p)
    }))
  },
  setSupportsParent(childId, newParentId) {
    const s = get()
    const child = s.nodes.find(n => n.id === childId)
    if (!child) return
    const parent = s.nodes.find(n => n.id === newParentId)
    if (!parent) return
    if (child.data.kind === 'Argument') {
      if (!(parent.data.participantId === child.data.participantId &&
            (parent.data.kind === 'Thesis' || parent.data.kind === 'Argument' || parent.data.kind === 'Counter' || parent.data.kind === 'Evidence'))) {
        throw new Error('Arguments can only attach to same-participant Thesis, Argument, Counter, or Evidence.')
      }
    } else if (child.data.kind === 'Argument Summary') {
      if (parent.data.kind !== 'Thesis') throw new Error('Argument Summaries can only attach to a Thesis.')
      const already = s.edges.some(e =>
        e.data?.kind === 'supports' && e.source === newParentId &&
        s.nodes.find(nn => nn.id === e.target)?.data.kind === 'Argument Summary' &&
        e.target !== childId
      )
      if (already) throw new Error('That Thesis already has an Argument Summary.')
    } else {
      throw new Error('Only Arguments and Argument Summaries use parent (supports) reattachment.')
    }
    const hasEdge = s.edges.find(e => (e.data as any)?.kind === 'supports' && e.target === childId)
    if (!hasEdge) throw new Error('Could not find parent edge to update.')
    set(st => ({
      edges: st.edges.map(e => (e.id === hasEdge.id ? { ...e, source: newParentId } : e))
    }))
  },
  setEdgeTarget(nodeId, edgeKind, newTargetId) {
    const s = get()
    const node = s.nodes.find(n => n.id === nodeId)
    const target = s.nodes.find(n => n.id === newTargetId)
    if (!node || !target) return
    if (edgeKind === 'evidence-of') {
      if (!(node.data.participantId === target.data.participantId &&
            (target.data.kind === 'Argument' || target.data.kind === 'Counter' || target.data.kind === 'Argument Summary'))) {
        throw new Error('Evidence must target an Argument, Counter, or Argument Summary of the same Debate Participant.')
      }
    } else if (edgeKind === 'attacks') {
      // allow opponent Argument | Counter | Evidence
      if (!(node.data.participantId !== target.data.participantId &&
            (target.data.kind === 'Argument' || target.data.kind === 'Counter' || target.data.kind === 'Evidence'))) {
        throw new Error('Counters must target an opponent Argument, Counter, or Evidence.')
      }
    } else if (edgeKind === 'agrees-with') {
      if (!(node.data.participantId !== target.data.participantId &&
            (target.data.kind === 'Argument' || target.data.kind === 'Counter'))) {
        throw new Error('Agreements must target an opponent Argument or Counter.')
      }
    }
    const ed = s.edges.find(e => (e.data as any)?.kind === edgeKind && e.source === nodeId)
    if (!ed) throw new Error('Could not find the edge to retarget.')
    set(st => ({
      edges: st.edges.map(e => e.id === ed.id ? { ...e, target: newTargetId } : e)
    }))
  },
  // ----- Type 2 peer links (visual-only dashed links) -----
  addT2Links(sourceId, targets) {
    if (!targets || targets.length === 0) return
    const s = get()
    const src = s.nodes.find(n => n.id === sourceId)
    if (!src) return
    const okKinds = new Set(['Argument','Counter','Evidence'])
    if (!okKinds.has(src.data.kind) || src.data.strengthType !== 'Type 2') return
    const res: DebateEdge[] = [...s.edges]
    for (const t of targets) {
      if (t === sourceId) continue
      const trg = s.nodes.find(n => n.id === t)
      if (!trg) continue
      if (trg.data.kind !== src.data.kind) continue
      if (trg.data.participantId !== src.data.participantId) continue
      if (trg.data.strengthType !== 'Type 2') continue
      // undirected pair: keep only one dashed edge per pair
      const a = sourceId < t ? sourceId : t
      const b = sourceId < t ? t : sourceId
      const exists = res.some(e => (e.data as any)?.kind === 't2-link' && ((e.source === a && e.target === b) || (e.source === b && e.target === a)))
      if (!exists) res.push(edge('t2-link', a, b))
    }
    set({ edges: res })
  },
  setT2Links(sourceId, targets) {
    const s = get()
    const src = s.nodes.find(n => n.id === sourceId)
    if (!src) return
    const okKinds = new Set(['Argument','Counter','Evidence'])
    // remove any existing t2 links that involve this node
    const kept = s.edges.filter(e => !((e.data as any)?.kind === 't2-link' && (e.source === sourceId || e.target === sourceId)))
    set({ edges: kept })
    if (!okKinds.has(src.data.kind) || src.data.strengthType !== 'Type 2') return
    get().addT2Links(sourceId, targets)
  },
  // ----- Refers-to peer links (visual-only dashed links) -----
  addRefLinks(sourceId, targets) {
    if (!targets || targets.length === 0) return
    const s = get()
    const src = s.nodes.find(n => n.id === sourceId)
    if (!src) return
    const res: DebateEdge[] = [...s.edges]
    for (const t of targets) {
      if (t === sourceId) continue
      const trg = s.nodes.find(n => n.id === t)
      if (!trg) continue
      // undirected pair: keep only one dashed edge per pair
      const a = sourceId < t ? sourceId : t
      const b = sourceId < t ? t : sourceId
      const exists = res.some(e => (e.data as any)?.kind === 'refers-to' && ((e.source === a && e.target === b) || (e.source === b && e.target === a)))
      if (!exists) res.push(edge('refers-to', a, b))
    }
    set({ edges: res })
  },
  setRefLinks(sourceId, targets) {
    const s = get()
    const src = s.nodes.find(n => n.id === sourceId)
    if (!src) return
    // remove any existing refers-to links that involve this node
    const kept = s.edges.filter(e => !((e.data as any)?.kind === 'refers-to' && (e.source === sourceId || e.target === sourceId)))
    set({ edges: kept })
    get().addRefLinks(sourceId, targets)
  },
}))