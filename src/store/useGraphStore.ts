import { create } from 'zustand'
import type { DebateNode, DebateEdge, NodeKind, EdgeKind } from '../graph/types'
import { nanoid } from './util'

export type Participant = { id: string; name: string }
export type SnapshotV1 = {
  version: 1
  participants: Participant[]
  nodes: DebateNode[]
  edges: DebateEdge[]
}

type State = {
  participants: Participant[]
  nodes: DebateNode[]
  edges: DebateEdge[]

  setParticipantName: (id: string, name: string) => void

  addThesis: (participantId: string, title: string, body?: string) => DebateNode
  addArgument: (participantId: string, title: string, body?: string, parentId?: string) => DebateNode
  addCounter: (participantId: string, targetId: string, title: string, body?: string) => DebateNode
  addEvidence: (participantId: string, targetId: string, title: string, body?: string) => DebateNode
  addAgreement: (participantId: string, targetId: string, title: string, body?: string) => DebateNode

  updateNode: (id: string, patch: Partial<DebateNode['data']>) => void
  deleteNode: (id: string) => void

  setAllCollapsed: (collapsed: boolean) => void

  link: (sourceId: string, targetId: string, kind: EdgeKind) => void
  reset: () => void

  getSnapshot: () => SnapshotV1
  loadSnapshot: (snap: SnapshotV1) => void
}

const node = (kind: NodeKind, participantId: string, title: string, body?: string, collapsed = false): DebateNode => ({
  id: nanoid(),
  type: 'nodeCard',
  position: { x: 0, y: 0 },
  data: { kind, participantId, title, body, collapsed }
})

const edge = (source: string, target: string, kind: EdgeKind): DebateEdge => {
  let color = '#9ca3af'
  let label = 'link'
  if (kind === 'supports') { color = '#22c55e'; label = 'supports →' }
  if (kind === 'attacks')  { color = '#ef4444'; label = 'counter →' }
  if (kind === 'evidence-of') { color = '#f59e0b'; label = 'evidence of →' }
  if (kind === 'agrees-with') { color = '#06b6d4'; label = 'agrees →' }
  return {
    id: nanoid(),
    source, target,
    label,
    data: { kind },
    type: 'smoothstep',
    style: { stroke: color },
    labelBgStyle: { fill: '#0b1220', fillOpacity: 0.6, stroke: '#111827' },
    labelStyle: { fill: '#e5e7eb', fontSize: 10 }
  } as any
}

const initialParticipants: Participant[] = [
  { id: 'A', name: 'A' },
  { id: 'B', name: 'B' }
]

// Collapsed=true on app load
const initialNodes: DebateNode[] = [
  { id: 'thesisA', type: 'nodeCard', position: { x: 0, y: 0 }, data: { kind: 'Thesis', participantId: 'A', title: 'Thesis A', body: 'Edit me', collapsed: true } },
  { id: 'thesisB', type: 'nodeCard', position: { x: 400, y: 0 }, data: { kind: 'Thesis', participantId: 'B', title: 'Thesis B', body: 'Edit me', collapsed: true } }
]

export const useGraphStore = create<State>((set, get) => ({
  participants: initialParticipants,
  nodes: initialNodes,
  edges: [],

  setParticipantName: (id, name) => set(s => ({
    participants: s.participants.map(p => p.id === id ? { ...p, name } : p)
  })),

  addThesis: (participantId, title, body) => {
    const n = node('Thesis', participantId, title, body, false)
    set(s => ({ nodes: [...s.nodes, n] }))
    return n
  },

  addArgument: (participantId, title, body, parentId) => {
    let parent = parentId
      ? get().nodes.find(n => n.id === parentId && (n.data.kind === 'Thesis' || n.data.kind === 'Argument'))
      : get().nodes.find(n => n.data.kind === 'Thesis' && n.data.participantId === participantId)

    if (!parent) {
      parent = get().nodes.find(n => (n.data.kind === 'Thesis' || n.data.kind === 'Argument') && n.data.participantId === participantId)
    }
    if (!parent) throw new Error('No valid parent (Thesis or Argument) found to attach this Argument to')
    if (parent.data.participantId !== participantId) throw new Error('Arguments must attach to a Thesis/Argument of the same Debate Participant')

    const n = node('Argument', participantId, title, body, false)
    set(s => ({ nodes: [...s.nodes, n], edges: [...s.edges, edge(parent!.id, n.id, 'supports')] }))
    return n
  },

  addCounter: (participantId, targetId, title, body) => {
    const target = get().nodes.find(n => n.id === targetId)
    if (!target || (target.data.kind !== 'Argument' && target.data.kind !== 'Counter')) {
      throw new Error('Counter target must be an Argument or Counter')
    }
    if (target.data.participantId === participantId) throw new Error('Counter must target opponent Argument/Counter')
    const n = node('Counter', participantId, title, body, false)
    set(s => ({ nodes: [...s.nodes, n], edges: [...s.edges, edge(n.id, target.id, 'attacks')] }))
    return n
  },

  addEvidence: (participantId, targetId, title, body) => {
    const target = get().nodes.find(n => n.id === targetId)
    if (!target || (target.data.kind !== 'Argument' && target.data.kind !== 'Counter')) throw new Error('Evidence target must be Argument or Counter')
    if (target.data.participantId !== participantId) throw new Error('Evidence must attach to a statement from the same Debate Participant')
    const n = node('Evidence', participantId, title, body, false)
    set(s => ({ nodes: [...s.nodes, n], edges: [...s.edges, edge(n.id, target.id, 'evidence-of')] }))
    return n
  },

  addAgreement: (participantId, targetId, title, body) => {
    const target = get().nodes.find(n => n.id === targetId)
    if (!target || (target.data.kind !== 'Argument' && target.data.kind !== 'Counter')) {
      throw new Error('Agreement target must be an Argument or Counter')
    }
    if (target.data.participantId === participantId) {
      throw new Error('Agreement must target opponent Argument/Counter')
    }
    const n = node('Agreement', participantId, title, body, false)
    set(s => ({ nodes: [...s.nodes, n], edges: [...s.edges, edge(n.id, target.id, 'agrees-with')] }))
    return n
  },

  updateNode: (id, patch) => set(s => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
  })),

  deleteNode: (id) => set(s => ({
    nodes: s.nodes.filter(n => n.id !== id),
    edges: s.edges.filter(e => e.source !== id && e.target !== id)
  })),

  setAllCollapsed: (collapsed) => set(s => ({
    nodes: s.nodes.map(n => ({ ...n, data: { ...n.data, collapsed } }))
  })),

  link: (sourceId, targetId, kind) => set(s => ({ edges: [...s.edges, edge(sourceId, targetId, kind)] })),
  reset: () => set(() => ({ participants: initialParticipants, nodes: initialNodes, edges: [] })),

  getSnapshot: () => {
    const s = get()
    const snap: SnapshotV1 = {
      version: 1,
      participants: s.participants,
      nodes: s.nodes,
      edges: s.edges
    }
    return snap
  },

  loadSnapshot: (snap) => {
    if (!snap || snap.version !== 1) throw new Error('Unsupported or invalid snapshot format')
    // Force-collapse everything on load
    const collapsedNodes = (Array.isArray(snap.nodes) ? snap.nodes : []).map(n => ({
      ...n,
      data: { ...n.data, collapsed: true }
    }))
    set(() => ({
      participants: snap.participants && snap.participants.length ? snap.participants : initialParticipants,
      nodes: collapsedNodes,
      edges: Array.isArray(snap.edges) ? snap.edges : []
    }))
  }
}))
