import type { Node, Edge } from 'reactflow'

type Pos = { x: number, y: number }
type DebateNode = Node & { data: any }
type DebateEdge = Edge & { data?: any }

const NODE_W = 320
const NODE_H = 120
const X_GAP = 60
const Y_GAP = 180

function kindOrder(kind: string): number {
  switch (kind) {
    case 'Evidence': return 0
    case 'Agreement': return 1
    case 'Argument': return 2
    case 'Counter': return 3
    case 'Thesis': return -1
    case 'Argument Summary': return 0 // handled specially in placement
    default: return 9
  }
}

function pairsFromEdges(edges: DebateEdge[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const e of edges) {
    const kind = (e.data && e.data.kind) || ''
    if (kind === 'supports') {
      pairs.push([e.source, e.target])
    } else if (kind === 'evidence-of' || kind === 'agrees-with' || kind === 'attacks') {
      pairs.push([e.target, e.source])
    }
  }
  return pairs
}

export function computeLayout(nodes: DebateNode[], edges: DebateEdge[]): Map<string, Pos> {
  const idToNode = new Map<string, DebateNode>()
  nodes.forEach(n => idToNode.set(n.id, n))

  const children = new Map<string, string[]>()
  const parentOf = new Map<string, string>()
  for (const [p, c] of pairsFromEdges(edges)) {
    if (!children.has(p)) children.set(p, [])
    if (!parentOf.has(c)) { children.get(p)!.push(c); parentOf.set(c, p) }
  }

  const roots = nodes.filter(n => !parentOf.has(n.id) || n.data?.kind === 'Thesis')
  roots.sort((a, b) => {
    const ak = a.data?.kind === 'Thesis' ? 0 : 1
    const bk = b.data?.kind === 'Thesis' ? 0 : 1
    if (ak !== bk) return ak - bk
    return (a.data?.title || '').localeCompare(b.data?.title || '')
  })

  // sort children lists (except summary special-case at placement)
  for (const [p, arr] of Array.from(children.entries())) {
    arr.sort((aid, bid) => {
      const a = idToNode.get(aid)!; const b = idToNode.get(bid)!
      const ko = kindOrder(a.data?.kind) - kindOrder(b.data?.kind)
      if (ko !== 0) return ko
      return (a.data?.title || '').localeCompare(b.data?.title || '')
    })
  }

  const layout = new Map<string, Pos>()

  function measureList(list: string[]): number {
    if (list.length === 0) return 0
    const widths = list.map(measure)
    return widths.reduce((a,b)=>a+b,0) + X_GAP*(list.length-1)
  }

  function measure(id: string): number {
    const chAll = (children.get(id) || []).slice()
    const node = idToNode.get(id)!
    let summary: string | undefined
    if (node?.data?.kind === 'Thesis') {
      summary = chAll.find(cid => idToNode.get(cid)?.data?.kind === 'Argument Summary')
    }
    const ch = summary ? chAll.filter(cid => cid !== summary) : chAll

    if (ch.length === 0 && !summary) return NODE_W

    if (summary) {
      // split others half to left, half to right
      const left = ch.slice(0, Math.ceil(ch.length / 2))
      const right = ch.slice(Math.ceil(ch.length / 2))
      const leftW = measureList(left)
      const rightW = measureList(right)
      let total = leftW + rightW + NODE_W
      if (left.length) total += X_GAP
      if (right.length) total += X_GAP
      return Math.max(NODE_W, total)
    } else {
      const total = measureList(ch)
      return Math.max(NODE_W, total)
    }
  }

  function place(id: string, xLeft: number, depth: number) {
    const w = measure(id)
    const xCenter = xLeft + w / 2

    const node = idToNode.get(id)!
    const isSummary = node?.data?.kind === 'Argument Summary'
    const yBase = depth * (NODE_H + Y_GAP)
    const y = yBase + (isSummary ? -30 : 0)  // raise summaries a bit

    layout.set(id, { x: xCenter - NODE_W / 2, y })

    let chAll = (children.get(id) || []).slice()
    let summary: string | undefined
    if (node?.data?.kind === 'Thesis') {
      summary = chAll.find(cid => idToNode.get(cid)?.data?.kind === 'Argument Summary')
    }
    let ch = summary ? chAll.filter(cid => cid !== summary) : chAll

    if (!ch.length && !summary) return

    if (summary) {
      const left = ch.slice(0, Math.ceil(ch.length / 2))
      const right = ch.slice(Math.ceil(ch.length / 2))

      // center summary
      const sx = xCenter - NODE_W / 2
      place(summary, sx, depth + 1)

      // lay out right children from summary's right edge
      let rx = xCenter + NODE_W / 2 + (right.length ? X_GAP : 0)
      for (const cid of right) {
        const cw = measure(cid)
        place(cid, rx, depth + 1)
        rx += cw + X_GAP
      }

      // lay out left children from summary's left edge going outward
      let lx = xCenter - NODE_W / 2 - (left.length ? X_GAP : 0)
      for (let i = left.length - 1; i >= 0; i--) {
        const cid = left[i]
        const cw = measure(cid)
        place(cid, lx - cw, depth + 1)
        lx -= cw + X_GAP
      }
    } else {
      // no summary: standard left-to-right
      ch = ch || []
      let cursor = xLeft
      for (const cid of ch) {
        const cw = measure(cid)
        place(cid, cursor, depth + 1)
        cursor += cw + X_GAP
      }
    }
  }

  let cursor = 0
  for (const r of roots) {
    const w = measure(r.id)
    place(r.id, cursor, 0)
    cursor += w + 2 * X_GAP
  }

  // place unconnected nodes if any
  const placed = new Set(layout.keys())
  for (const n of nodes) if (!placed.has(n.id)) {
    place(n.id, cursor, 0); cursor += NODE_W + 2*X_GAP
  }

  return layout
}
