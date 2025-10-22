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
  selfCollapsed?: boolean
  bodyCollapsed?: boolean // Add this new field
  /** Only for Argument, Counter, Evidence */
  strengthType?: StrengthType
  firstMention?: string

  // UI-only transient flags (optional)
  canBeReparentTarget?: boolean
  selectedForReparent?: boolean
}

export type DebateNode = Node<DebateData>
export type DebateEdge = Edge & { data?: { kind: 'supports'|'evidence-of'|'attacks'|'t2-link'|'agrees-with' } }

export const KIND_COLORS: Record<StatementKind, string> = {
  Thesis: '#DBEAFE',
  Argument: '#EDE9FE',
  'Argument Summary': '#D1FAE5',
  Counter: '#FEE2E2',
  Evidence: '#FEF3C7',
  Agreement: '#CFFAFE'
}
