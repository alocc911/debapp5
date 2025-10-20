import type { Node, Edge } from 'reactflow'

export type StatementKind =
  | 'Thesis'
  | 'Argument'
  | 'Argument Summary'
  | 'Counter'
  | 'Evidence'
  | 'Agreement'

export type DebateData = {
  id: string
  title: string
  body?: string
  kind: StatementKind
  participantId: string
  collapsed?: boolean
}

export type DebateNode = Node<DebateData>
export type DebateEdge = Edge & { data?: { kind: 'supports'|'evidence-of'|'attacks'|'agrees-with' } }
