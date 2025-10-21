import type { Node, Edge } from 'reactflow'

export type StatementKind =
  | 'Thesis'
  | 'Argument'
  | 'Argument Summary'
  | 'Counter'
  | 'Evidence'
  | 'Agreement'

export type StrengthType = 'Type 1' | 'Type 2' | 'Type 3' | 'Type 4'

export type DebateData = {
  id: string
  title: string
  body?: string
  kind: StatementKind
  participantId: string
  collapsed?: boolean
  /** Only for Argument, Counter, Evidence */
  strengthType?: StrengthType
  firstMention?: string
}

export type DebateNode = Node<DebateData>
export type DebateEdge = Edge & { data?: { kind: 'supports'|'evidence-of'|'attacks'|'t2-link'|'agrees-with' } }
