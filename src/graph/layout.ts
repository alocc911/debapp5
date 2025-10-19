import ELK from 'elkjs/lib/elk.bundled.js'
import type { DebateNode, DebateEdge } from './types'

const elk = new ELK()

export const NODE_W = 260
export const NODE_H_EXPANDED = 120
export const NODE_H_COLLAPSED = 56

const MAX_ROW_WIDTH = 900
const H_GAP = 40
const ROW_Y_OFFSET = 140
const LAYER_Y_SPACING = 220

const EVIDENCE_STAGGER = 120

type Kind = 'supports' | 'attacks' | 'evidence-of' | 'agrees-with'

export async function elkLayout(nodes: DebateNode[], edges: DebateEdge[]) {
  const layoutEdges = edges.map((e, i) => {
    const kind = (e.data as any)?.kind as Kind | undefined
    if (kind === 'attacks') {
      // Treat target as parent, counter as child for layering
      return { id: e.id ?? `e${i}`, sources: [e.target], targets: [e.source] }
    }
    if (kind === 'evidence-of' || kind === 'agrees-with') {
      // Target (arg/counter) is parent; evidence/agreement is child
      return { id: e.id ?? `e${i}`, sources: [e.target], targets: [e.source] }
    }
    return { id: e.id ?? `e${i}`, sources: [e.source], targets: [e.target] }
  })

  const childEntries = nodes.map(n => ({
    id: n.id,
    width: NODE_W,
    height: n.data.collapsed ? NODE_H_COLLAPSED : NODE_H_EXPANDED,
    layoutOptions: (n.data.kind === 'Thesis')
      ? { 'org.eclipse.elk.layered.layering.layerConstraint': 'FIRST' }
      : {}
  }))

  const graph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_Y_SPACING),
      'elk.spacing.nodeNode': '60',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'LEFTUP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.mergeEdges': 'true'
    },
    children: childEntries,
    edges: layoutEdges
  }

  const res = await elk.layout(graph)

  const placed = new Map<string, { x: number; y: number; h: number }>()
  ;(res.children ?? []).forEach((c: any) => {
    placed.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, h: c.height ?? (NODE_H_EXPANDED) })
  })

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const edgesBySource = new Map<string, DebateEdge[]>()
  const edgesByTarget = new Map<string, DebateEdge[]>()
  edges.forEach(e => {
    if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, [])
    if (!edgesByTarget.has(e.target)) edgesByTarget.set(e.target, [])
    edgesBySource.get(e.source)!.push(e)
    edgesByTarget.get(e.target)!.push(e)
  })

  const sortByX = (ids: string[]) =>
    ids.sort((a, b) => (placed.get(a)!.x - placed.get(b)!.x))

  const baseYForChildren = (parentId: string) => {
    const p = placed.get(parentId)!
    const parentH = p.h ?? (nodeById.get(parentId)?.data.collapsed ? NODE_H_COLLAPSED : NODE_H_EXPANDED)
    return p.y + parentH + 60
  }

  const singleRowUnderParent = (parentId: string, childIds: string[], extraYOffset = 0) => {
    if (childIds.length === 0) return
    sortByX(childIds)
    const parentPos = placed.get(parentId) ?? { x: 0, y: 0, h: NODE_H_EXPANDED }
    const parentCenterX = parentPos.x + NODE_W / 2
    const baseY = baseYForChildren(parentId)
    const rowWidth = childIds.length * NODE_W + (childIds.length - 1) * H_GAP
    let cursor = parentCenterX - rowWidth / 2
    const y = baseY + extraYOffset
    childIds.forEach(id => { placed.set(id, { x: cursor, y, h: placed.get(id)?.h ?? NODE_H_EXPANDED }); cursor += NODE_W + H_GAP })
  }

  const wrapSiblings = (parentId: string, childIds: string[], extraYOffset = 0) => {
    if (childIds.length === 0) return
    sortByX(childIds)

    const rows: string[][] = [[]]
    let currentWidth = 0
    for (const id of childIds) {
      const w = NODE_W + (rows[rows.length - 1].length > 0 ? H_GAP : 0)
      if (rows[rows.length - 1].length > 0 && (currentWidth + NODE_W + H_GAP) > MAX_ROW_WIDTH) {
        rows.push([id]); currentWidth = NODE_W
      } else { rows[rows.length - 1].push(id); currentWidth += w }
    }

    const parentPos = placed.get(parentId) ?? { x: 0, y: 0, h: NODE_H_EXPANDED }
    const parentCenterX = parentPos.x + NODE_W / 2
    const baseY = baseYForChildren(parentId)

    if (rows.length === 1) {
      const rowIds = rows[0]
      const rowWidth = rowIds.length * NODE_W + (rowIds.length - 1) * H_GAP
      let cursor = parentCenterX - rowWidth / 2
      const y = baseY + extraYOffset
      rowIds.forEach(id => { placed.set(id, { x: cursor, y, h: placed.get(id)?.h ?? NODE_H_EXPANDED }); cursor += NODE_W + H_GAP })
      return
    }

    rows.forEach((rowIds, rIndex) => {
      const rowWidth = rowIds.length * NODE_W + (rowIds.length - 1) * H_GAP
      let cursor = parentCenterX - rowWidth / 2
      const y = baseY + extraYOffset + rIndex * ROW_Y_OFFSET
      rowIds.forEach(id => { placed.set(id, { x: cursor, y, h: placed.get(id)?.h ?? NODE_H_EXPANDED }); cursor += NODE_W + H_GAP })
    })
  }

  // Position Arguments: top-level (under Thesis) all in one row; nested args wrap
  nodes.forEach(parent => {
    const outgoing = edgesBySource.get(parent.id) ?? []
    const argChildren = outgoing
      .filter(e => (e.data as any)?.kind === 'supports')
      .map(e => e.target)
      .filter(id => nodeById.get(id)?.data.kind === 'Argument')

    if (argChildren.length > 1) {
      const parentKind = nodeById.get(parent.id)?.data.kind
      if (parentKind === 'Thesis') {
        singleRowUnderParent(parent.id, argChildren, 0)
      } else {
        wrapSiblings(parent.id, argChildren, 0)
      }
    }
  })

  // Evidence + Agreements grouped with staggering per adjacent parents
  const evLikeTargets = nodes
    .map(n => n.id)
    .filter(id => {
      const incoming = edgesByTarget.get(id) ?? []
      return incoming.some(e => {
        const k = (e.data as any)?.kind
        return k === 'evidence-of' || k === 'agrees-with'
      })
    })
    .sort((a, b) => (placed.get(a)!.x - placed.get(b)!.x))

  const offsetByTarget = new Map<string, number>()
  evLikeTargets.forEach((tid, idx) => {
    const extra = (idx % 2 === 0) ? 0 : EVIDENCE_STAGGER
    offsetByTarget.set(tid, extra)
  })

  nodes.forEach(target => {
    const incoming = edgesByTarget.get(target.id) ?? []
    const children = incoming
      .filter(e => {
        const k = (e.data as any)?.kind
        return k === 'evidence-of' || k === 'agrees-with'
      })
      .map(e => e.source)
      .filter(id => {
        const kind = nodeById.get(id)?.data.kind
        return kind === 'Evidence' || kind === 'Agreement'
      })

    if (children.length >= 1) {
      const extra = offsetByTarget.get(target.id) ?? 0
      wrapSiblings(target.id, children, extra)
    }
  })

  const positioned: DebateNode[] = nodes.map(n => {
    const pos = placed.get(n.id)
    if (!pos) return n
    return { ...n, position: { x: pos.x, y: pos.y } }
  })

  return { nodes: positioned, edges }
}
