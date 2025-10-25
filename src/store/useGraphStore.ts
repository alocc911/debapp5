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
  clearFilters: () => void;

  filterMode: 'dim' | 'hide';
  setFilterMode: (mode: 'dim' | 'hide') => void;

  // Convenience: return the current participants + kind list for UIs
  getLegendKinds: () => string[]
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
function edge(kind: 'supports'|'evidence-of'|'attacks'|'agrees-with'|'t2-link', source: string, target: string): DebateEdge {
  return { id: nid(), source, target, type: kind === 't2-link' ? 't2' : 'thick', data: { kind } as any }
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

  // Add new state:
  linkHighlight: null,
  setLinkHighlight: (highlight) => set({ linkHighlight: highlight }),

  // Add new state and methods:
  filters: {
    participants: new Set(),
    kinds: new Set(),
    strengths: new Set()
  },

  setParticipantFilter: (id: string, active: boolean) => {
    set(state => {
      const newSet = new Set(state.filters.participants);
      if (active) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return {
        filters: {
          ...state.filters,
          participants: newSet
        }
      };
    });
  },

  setKindFilter: (kind: StatementKind, active: boolean) => {
    set(state => {
      const newSet = new Set(state.filters.kinds);
      if (active) {
        newSet.add(kind);
      } else {
        newSet.delete(kind);
      }
      return {
        filters: {
          ...state.filters,
          kinds: newSet
        }
      };
    });
  },
  setStrengthFilter: (strength: StrengthType, active: boolean) => {
  set(state => {
    const newSet = new Set(state.filters.strengths);
    if (active) {
      newSet.add(strength);
    } else {
      newSet.delete(strength);
    }
    return {
      filters: {
        ...state.filters,
        strengths: newSet
      }
    };
  });
},
  clearFilters: () => {
  set({
    filters: {
      participants: new Set(),
      kinds: new Set(),
      strengths: new Set()
    }
  });
},

  filterMode: 'dim',
  setFilterMode: (mode) => set({ filterMode: mode }),

  addThesis(participantId, title, body, firstMention) {
    const s = get()
    if (s.nodes.some(n => n.data.kind === 'Thesis' && n.data.participantId === participantId)) {
      throw new Error('Only one Thesis per participant')
    }
    const n = node('Thesis', participantId, title, body, undefined, firstMention)
    set(st => ({ nodes: [...st.nodes, n] }))
    return n.id
  },
  addArgument(participantId, title, body, parentId, strengthType, firstMention) {
    const s = get()
    const parent = parentId && s.nodes.find(n => n.id === parentId)
    if (parentId && !parent) throw new Error('No such parent')
    const n = node('Argument', participantId, title, body, strengthType, firstMention)
    const e = edge('supports', parentId || '', n.id)
    set(st => ({ nodes: [...st.nodes, n], edges: parentId ? [...st.edges, e] : st.edges }))
    return n.id
  },
  addCounter(participantId, targetId, title, body, strengthType, firstMention) {
    const s = get()
    const target = s.nodes.find(n => n.id === targetId)
    if (!target) throw new Error('No such target')
    const n = node('Counter', participantId, title, body, strengthType, firstMention)
    const e = edge('attacks', n.id, targetId)
    set(st => ({ nodes: [...st.nodes, n], edges: [...st.edges, e] }))
    return n.id
  },
  addEvidence(participantId, targetId, title, body, strengthType, firstMention) {
    const s = get()
    const target = s.nodes.find(n => n.id === targetId)
    if (!target) throw new Error('No such target')
    const n = node('Evidence', participantId, title, body, strengthType, firstMention)
    const e = edge('evidence-of', n.id, targetId)
    set(st => ({ nodes: [...st.nodes, n], edges: [...st.edges, e] }))
    return n.id
  },
  addAgreement(participantId, targetId, title, body, firstMention) {
    const s = get()
    const target = s.nodes.find(n => n.id === targetId)
    if (!target) throw new Error('No such target')
    const n = node('Agreement', participantId, title, body, undefined, firstMention)
    const e = edge('agrees-with', n.id, targetId)
    set(st => ({ nodes: [...st.nodes, n], edges: [...st.edges, e] }))
    return n.id
  },
  addArgumentSummary(participantId, thesisId, title, body, firstMention) {
    const s = get()
    const thesis = s.nodes.find(n => n.id === thesisId)
    if (!thesis || thesis.data.kind !== 'Thesis') throw new Error('No such thesis')
    const n = node('Argument Summary', participantId, title, body, undefined, firstMention)
    const e = edge('supports', thesisId, n.id)
    set(st => ({ nodes: [...st.nodes, n], edges: [...st.edges, e] }))
    return n.id
  },
  updateNode(id, patch) {
    set(st => ({
      nodes: st.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)
    }))
  },
  deleteNode(id) {
    set(st => ({
      nodes: st.nodes.filter(n => n.id !== id),
      edges: st.edges.filter(e => e.source !== id && e.target !== id)
    }))
  },
  setAllCollapsed(v) {
    set(st => ({
      nodes: st.nodes.map(n => ({ ...n, data: { ...n.data, collapsed: v } }))
    }))
  },
  loadSnapshot(s) {
    let nodes = s.nodes.map(n => ({ ...n, data: { ...n.data, collapsed: true } }))
    const layout = computeLayout(nodes, s.edges)
    nodes.forEach(n => {
      const pos = layout.get(n.id)
      if (pos) n.position = pos
    })
    set({ nodes, edges: s.edges, participants: s.participants || [] })
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
    const newParent = s.nodes.find(n => n.id === newParentId)
    if (!child || !newParent) return
    if (child.data.kind === 'Argument') {
      if (!(newParent.data.participantId === child.data.participantId &&
            (newParent.data.kind === 'Thesis' || newParent.data.kind === 'Argument' ||
             newParent.data.kind === 'Counter' || newParent.data.kind === 'Evidence'))) {
        throw new Error('Argument must be under Thesis, Argument, Counter, or Evidence of the same Debate Participant.')
      }
    } else if (child.data.kind === 'Argument Summary') {
      if (!(newParent.data.participantId === child.data.participantId && newParent.data.kind === 'Thesis')) {
        throw new Error('Argument Summary must attach to a Thesis of the same Debate Participant.')
      }
      const already = s.edges.some(e =>
        (e.data as any)?.kind === 'supports' &&
        e.source === newParentId &&
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

  // Convenience: return the current participants + kind list for UIs
  getLegendKinds() {
    return ['Thesis','Argument','Argument Summary','Counter','Evidence','Agreement']
  }
}))