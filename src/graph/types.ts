import type { Edge, Node } from 'reactflow'

export type NodeKind = 'Thesis' | 'Argument' | 'Counter' | 'Evidence' | 'Agreement'
export type EdgeKind = 'supports' | 'attacks' | 'evidence-of' | 'agrees-with'

export type NodeData = {
  kind: NodeKind
  participantId: string
  title: string
  body?: string
  relevance?: number
  collapsed?: boolean
  // UI-only (not persisted) fields
  hit?: boolean
  searchTerms?: string[]
}

export type DebateNode = Node<NodeData>
export type DebateEdge = Edge<{ kind: EdgeKind }>
