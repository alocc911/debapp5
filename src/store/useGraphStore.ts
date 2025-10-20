import { create } from 'zustand'
import type { DebateNode, DebateEdge, DebateData, StatementKind } from '../graph/types'

function nid() { return Math.random().toString(36).slice(2, 10) }

type Participant = { id: string, name: string }

type Snapshot = {
  nodes: DebateNode[]
  edges: DebateEdge[]
  participants: Participant[]
}

type Store = Snapshot & {
  addThesis: (participantId: string, title: string, body?: string) => string
  addArgument: (participantId: string, title: string, body?: string, parentId?: string) => string
  addCounter: (participantId: string, targetId: string, title: string, body?: string) => string
  addEvidence: (participantId: string, targetId: string, title: string, body?: string) => string
  addAgreement: (participantId: string, targetId: string, title: string, body?: string) => string
  addArgumentSummary: (participantId: string, thesisId: string, title: string, body?: string) => string
  updateNode: (id: string, patch: Partial<DebateData>) => void
  deleteNode: (id: string) => void
  setAllCollapsed: (v: boolean) => void
  loadSnapshot: (s: Snapshot) => void
  getSnapshot: () => Snapshot
  updateParticipant: (id: string, name: string) => void
  setSupportsParent: (childId: string, newParentId: string) => void
  setEdgeTarget: (nodeId: string, edgeKind: 'attacks'|'evidence-of'|'agrees-with', newTargetId: string) => void
}

function node(kind: StatementKind, participantId: string, title: string, body?: string): DebateNode {
  return {
    id: nid(),
    type: 'nodeCard',
    position: { x: 0, y: 0 },
    data: { id: '', title, body, kind, participantId, collapsed: false } as DebateData
  }
}
function edge(kind: 'supports'|'evidence-of'|'attacks'|'agrees-with', source: string, target: string): DebateEdge {
  return { id: nid(), source, target, type: 'thick', data: { kind } }
}

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

  addThesis(participantId, title, body) {
    const n = node('Thesis', participantId, title, body)
    set(s => ({ nodes: [...s.nodes, { ...n, data: { ...n.data, id: n.id } }] }))
    return n.id
  },

  addArgument(participantId, title, body, parentId) {
    const s = get()
    let parent = parentId ? s.nodes.find(n => n.id === parentId) : undefined
    if (!parent) {
      parent = s.nodes.find(n => n.data.kind === 'Thesis' && n.data.participantId === participantId)
      if (!parent) {
        const thesisId = (get().addThesis(participantId, `${participantId} Thesis`))
        parent = get().nodes.find(n => n.id === thesisId)!
      }
    }
    const n = node('Argument', participantId, title, body)
    set(st => ({
      nodes: [...st.nodes, { ...n, data: { ...n.data, id: n.id } }],
      edges: [...st.edges, edge('supports', parent!.id, n.id)]
    }))
    return n.id
  },

  addCounter(participantId, targetId, title, body) {
    const n = node('Counter', participantId, title, body)
    set(s => ({
      nodes: [...s.nodes, { ...n, data: { ...n.data, id: n.id } }],
      edges: [...s.edges, edge('attacks', n.id, targetId)]
    }))
    return n.id
  },

  addEvidence(participantId, targetId, title, body) {
    const n = node('Evidence', participantId, title, body)
    set(s => ({
      nodes: [...s.nodes, { ...n, data: { ...n.data, id: n.id } }],
      edges: [...s.edges, edge('evidence-of', n.id, targetId)]
    }))
    return n.id
  },

  addAgreement(participantId, targetId, title, body) {
    const n = node('Agreement', participantId, title, body)
    set(s => ({
      nodes: [...s.nodes, { ...n, data: { ...n.data, id: n.id } }],
      edges: [...s.edges, edge('agrees-with', n.id, targetId)]
    }))
    return n.id
  },

  addArgumentSummary(participantId, thesisId, title, body) {
    const s = get()
    const thesis = s.nodes.find(n => n.id === thesisId && n.data.kind === 'Thesis')
    if (!thesis) throw new Error('Choose a Thesis to attach the Argument Summary to.')
    if (thesis.data.participantId !== participantId) throw new Error('Summary must use the same Debate Participant as the Thesis.')
    const hasSummary = s.edges.some(e => e.source === thesisId && e.data?.kind === 'supports' && s.nodes.find(n => n.id === e.target)?.data.kind === 'Argument Summary')
    if (hasSummary) throw new Error('This Thesis already has an Argument Summary.')
    const n = node('Argument Summary', participantId, title, body)
    set(st => ({
      nodes: [...st.nodes, { ...n, data: { ...n.data, id: n.id } }],
      edges: [...st.edges, edge('supports', thesisId, n.id)]
    }))
    return n.id
  },

  updateNode(id, patch) {
    set(s => ({
      nodes: s.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    }))
  },

  deleteNode(id) {
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      edges: s.edges.filter(e => e.source !== id && e.target !== id)
    }))
  },

  setAllCollapsed(v) {
    set(s => ({ nodes: s.nodes.map(n => ({ ...n, data: { ...n.data, collapsed: v } })) }))
  },

  loadSnapshot(snap) {
    set(() => ({
      nodes: snap.nodes || [],
      edges: snap.edges || [],
      participants: snap.participants || [{id:'A',name:'A'},{id:'B',name:'B'}]
    }))
  },

  getSnapshot() {
    const s = get()
    return { nodes: s.nodes, edges: s.edges, participants: s.participants }
  },

  updateParticipant(id, name) {
    set(s => ({ participants: s.participants.map(p => p.id === id ? { ...p, name } : p) }))
  },

  setSupportsParent(childId, newParentId) {
    const s = get()
    const child = s.nodes.find(n => n.id === childId)
    const newParent = s.nodes.find(n => n.id === newParentId)
    if (!child || !newParent) return
    if (child.data.kind === 'Argument') {
      if (!(newParent.data.participantId === child.data.participantId &&
            (newParent.data.kind === 'Thesis' || newParent.data.kind === 'Argument'))) {
        throw new Error('Argument must be under Thesis or Argument of the same Debate Participant.')
      }
    } else if (child.data.kind === 'Argument Summary') {
      if (!(newParent.data.participantId === child.data.participantId && newParent.data.kind === 'Thesis')) {
        throw new Error('Argument Summary must attach to a Thesis of the same Debate Participant.')
      }
      const already = s.edges.some(e =>
        e.data?.kind === 'supports' &&
        e.source === newParentId &&
        s.nodes.find(nn => nn.id === e.target)?.data.kind === 'Argument Summary' &&
        e.target !== childId
      )
      if (already) throw new Error('That Thesis already has an Argument Summary.')
    } else {
      throw new Error('Only Arguments and Argument Summaries use parent (supports) reattachment.')
    }

    const hasEdge = s.edges.find(e => e.data?.kind === 'supports' && e.target === childId)
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
      if (!(node.data.participantId !== target.data.participantId &&
            (target.data.kind === 'Argument' || target.data.kind === 'Counter'))) {
        throw new Error('Counters must target an opponent Argument or Counter.')
      }
    } else if (edgeKind === 'agrees-with') {
      if (!(node.data.participantId !== target.data.participantId &&
            (target.data.kind === 'Argument' || target.data.kind === 'Counter'))) {
        throw new Error('Agreements must target an opponent Argument or Counter.')
      }
    }

    const edge = s.edges.find(e => e.data?.kind === edgeKind && e.source === nodeId)
    if (!edge) throw new Error('Could not find the edge to retarget.')
    set(st => ({
      edges: st.edges.map(e => e.id === edge.id ? { ...e, target: newTargetId } : e)
    }))
  },
}))
