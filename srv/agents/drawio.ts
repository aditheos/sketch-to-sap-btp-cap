'use strict';

import { readFileSync } from 'fs';
import { join }         from 'path';
import type { MappedArchitecture, MappedComponent, IconIndex } from './types';

const ICON_INDEX_PATH = join(__dirname, '..', '..', 'data', 'sap_icon_index.json');

// ── Sizing ─────────────────────────────────────────────────────────────────
const ICON_W      = 48;
const ICON_H      = 48;
const LABEL_H_EST = 54;
const CAT_H       = 16;
const COMP_V_GAP  = 14;

const FALLBACK_W  = 130;
const FALLBACK_H  = 50;

const COL_SLOT_W  = 140;
const COL_GAP     = 60;
const PAGE_MARGIN = 40;

const BTP_PAD_X   = 24;
const BTP_PAD_Y   = 20;
const BTP_LABEL_H = 30;

const ACTOR_SLOT_W = 130;

// ── Styles ──────────────────────────────────────────────────────────────────
const SAP_BLUE = '#0070F2';
const SAP_TEXT = '#1a2733';

const BOUNDARY_STYLE =
  `rounded=1;whiteSpace=wrap;html=1;strokeColor=${SAP_BLUE};fillColor=#EBF8FF;` +
  `arcSize=24;absoluteArcSize=1;strokeWidth=1.5;` +
  `align=left;verticalAlign=top;fontSize=14;fontStyle=1;fontColor=${SAP_TEXT};fontFamily=Helvetica;` +
  `spacingLeft=12;spacingTop=10;`;

const CAT_LABEL_STYLE =
  `text;html=1;align=left;verticalAlign=bottom;strokeColor=none;fillColor=none;` +
  `fontColor=#8a9bb0;fontFamily=Helvetica;fontSize=9;fontStyle=1;whiteSpace=wrap;`;

const ICON_STYLE_PREFIX =
  `shape=image;verticalLabelPosition=middle;verticalAlign=middle;imageAspect=0;aspect=fixed;` +
  `fillColor=none;strokeColor=none;fontSize=1;fontColor=none;`;

const ICON_LABEL_STYLE =
  `text;html=1;align=center;verticalAlign=top;strokeColor=none;fillColor=none;` +
  `fontColor=${SAP_TEXT};fontFamily=Helvetica;fontSize=11;fontStyle=0;spacingTop=0;whiteSpace=wrap;`;

const EDGE_STYLE =
  `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;` +
  `endArrow=blockThin;endFill=1;endSize=4;startSize=4;strokeWidth=1.5;` +
  `strokeColor=#475E75;fontSize=10;fontFamily=Helvetica;fontColor=${SAP_TEXT};`;

const BIDI_EDGE_STYLE =
  `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;` +
  `endArrow=blockThin;endFill=1;startArrow=blockThin;startFill=1;endSize=4;startSize=4;strokeWidth=1.5;` +
  `strokeColor=#475E75;fontSize=10;fontFamily=Helvetica;fontColor=${SAP_TEXT};`;

// ── Minimal XML builder ──────────────────────────────────────────────────────
class El {
  private tag:   string;
  private attrs: Record<string, string | number>;
  children:      El[];

  constructor(tag: string, attrs: Record<string, string | number> = {}) {
    this.tag      = tag;
    this.attrs    = attrs;
    this.children = [];
  }

  sub(tag: string, attrs: Record<string, string | number> = {}): El {
    const c = new El(tag, attrs);
    this.children.push(c);
    return c;
  }

  render(d = 0): string {
    const p   = '  '.repeat(d);
    const esc = (s: string | number) => String(s)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const a    = Object.entries(this.attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
    const open = a ? `${p}<${this.tag} ${a}` : `${p}<${this.tag}`;
    if (!this.children.length) return `${open}/>`;
    return `${open}>\n${this.children.map(c => c.render(d + 1)).join('\n')}\n${p}</${this.tag}>`;
  }
}

// ── Zone classifier ──────────────────────────────────────────────────────────
type Zone = 'actor' | 'external' | 'btp';

function _zoneOf(comp: MappedComponent): Zone {
  if (comp.renderZone) return comp.renderZone as Zone;
  if (comp.category === 'Actors & External') return 'actor';
  if (comp.category === 'External Systems')  return 'external';
  return 'btp';
}

// ── Topological depth (BFS) ──────────────────────────────────────────────────
function _computeDepths(
  components: MappedComponent[],
  connections: MappedArchitecture['connections'],
): Map<string, number> {
  const depths = new Map<string, number>();
  const adj    = new Map<string, string[]>(components.map(c => [c.id, []]));

  for (const conn of connections) {
    adj.get(conn.fromId)?.push(conn.toId);
    adj.get(conn.toId)?.push(conn.fromId);
  }

  const queue: string[] = [];

  for (const c of components) {
    if (_zoneOf(c) === 'actor') { depths.set(c.id, 0); queue.push(c.id); }
  }

  if (!queue.length) {
    const compById = new Map(components.map(c => [c.id, c]));
    const hasIncomingFromInternal = new Set<string>();
    for (const conn of connections) {
      const from = compById.get(conn.fromId);
      if (from && _zoneOf(from) !== 'external') hasIncomingFromInternal.add(conn.toId);
    }
    for (const c of components) {
      if (_zoneOf(c) !== 'external' && !hasIncomingFromInternal.has(c.id)) {
        depths.set(c.id, 0);
        queue.push(c.id);
      }
    }
  }

  if (!queue.length) {
    for (const c of components) {
      if (_zoneOf(c) === 'btp') { depths.set(c.id, 0); queue.push(c.id); }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const d  = depths.get(id)!;
    for (const nbId of (adj.get(id) ?? [])) {
      if (!depths.has(nbId)) { depths.set(nbId, d + 1); queue.push(nbId); }
    }
  }

  for (const c of components) { if (!depths.has(c.id)) depths.set(c.id, 1); }

  let maxBtp = 0;
  for (const c of components) {
    if (_zoneOf(c) === 'btp') maxBtp = Math.max(maxBtp, depths.get(c.id)!);
  }
  for (const c of components) {
    if (_zoneOf(c) === 'external') depths.set(c.id, maxBtp + 1);
  }

  return depths;
}

// ── Column layout helper ─────────────────────────────────────────────────────
interface ColumnItem { comp: MappedComponent; iconY: number; catLabelY: number | null; }
interface ColumnLayout { items: ColumnItem[]; totalH: number; }

function _columnLayout(comps: MappedComponent[], startY: number): ColumnLayout {
  const items: ColumnItem[] = [];
  let y = startY, lastCat: string | null = null;
  for (const comp of comps) {
    const cat = comp.category ?? '';
    let catLabelY: number | null = null;
    if (cat !== lastCat) { catLabelY = y; y += CAT_H; lastCat = cat; }
    items.push({ comp, iconY: y, catLabelY });
    y += ICON_H + LABEL_H_EST + COMP_V_GAP;
  }
  return { items, totalH: y - startY };
}

// ── Component renderer ───────────────────────────────────────────────────────
let _iconIndex: IconIndex | null = null;
function _loadIconIndex(): IconIndex {
  if (!_iconIndex) _iconIndex = JSON.parse(readFileSync(ICON_INDEX_PATH, 'utf-8')) as IconIndex;
  return _iconIndex;
}

function _placeComp(
  root: El,
  comp: MappedComponent,
  iconIndex: IconIndex,
  x: number,
  y: number,
  slotW: number,
): void {
  const icon = comp.iconId ? iconIndex[comp.iconId] : null;
  if (icon) {
    const iconX = x + Math.floor((slotW - ICON_W) / 2);
    root.sub('mxCell', {
      id: comp.id, value: '',
      style: ICON_STYLE_PREFIX + `image=data:image/svg+xml,${icon.base64_svg};`,
      vertex: '1', parent: '1',
      tooltip: comp.description || comp.sapServiceName,
    }).sub('mxGeometry', {
      x: String(iconX), y: String(y),
      width: String(ICON_W), height: String(ICON_H), as: 'geometry',
    });
    root.sub('mxCell', {
      id: comp.id + '_lbl', value: comp.sapServiceName,
      style: ICON_LABEL_STYLE, vertex: '1', parent: '1',
    }).sub('mxGeometry', {
      x: String(x), y: String(y + ICON_H + 2),
      width: String(slotW), height: String(LABEL_H_EST), as: 'geometry',
    });
  } else {
    const fill   = comp.drawio?.fillColor   ?? '#f5f5f5';
    const stroke = comp.drawio?.strokeColor ?? '#666';
    const font   = comp.drawio?.fontColor   ?? SAP_TEXT;
    const rectX  = x + Math.floor((slotW - FALLBACK_W) / 2);
    root.sub('mxCell', {
      id: comp.id, value: comp.sapServiceName,
      style: `rounded=1;whiteSpace=wrap;html=1;arcSize=10;fontFamily=Helvetica;` +
             `fillColor=${fill};strokeColor=${stroke};fontColor=${font};fontSize=11;fontStyle=1;`,
      vertex: '1', parent: '1',
      tooltip: comp.description || comp.sapServiceName,
    }).sub('mxGeometry', {
      x: String(rectX), y: String(y + 8),
      width: String(FALLBACK_W), height: String(FALLBACK_H), as: 'geometry',
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function generateDrawio(architecture: MappedArchitecture): string {
  const iconIndex  = _loadIconIndex();
  const { components, connections } = architecture;

  const depths = _computeDepths(components, connections);

  const byDepth = new Map<number, MappedComponent[]>();
  for (const comp of components) {
    const d = depths.get(comp.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(comp);
  }
  for (const comps of byDepth.values()) {
    comps.sort((a, b) => {
      const cc = (a.category ?? '').localeCompare(b.category ?? '');
      return cc !== 0 ? cc : (a.sapServiceName ?? '').localeCompare(b.sapServiceName ?? '');
    });
  }

  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b);
  const maxDepth     = sortedDepths.at(-1) ?? 0;

  const btpDepths = sortedDepths.filter(d =>
    (byDepth.get(d) ?? []).some(c => _zoneOf(c) === 'btp'),
  );
  const minBtpDepth = btpDepths.length ? Math.min(...btpDepths) : 1;
  const maxBtpDepth = btpDepths.length ? Math.max(...btpDepths) : 1;
  const nBtpCols    = maxBtpDepth - minBtpDepth + 1;

  const actorComps = (byDepth.get(0) ?? []).filter(c => _zoneOf(c) === 'actor');
  const extComps   = (byDepth.get(maxDepth) ?? []).filter(c => _zoneOf(c) === 'external');
  const hasActors  = actorComps.length > 0;

  const actorColX  = PAGE_MARGIN;
  const btpStartX  = PAGE_MARGIN + (hasActors ? ACTOR_SLOT_W + COL_GAP : 0);
  const btpInnerW  = nBtpCols * COL_SLOT_W + Math.max(0, nBtpCols - 1) * COL_GAP;
  const btpW       = btpInnerW + 2 * BTP_PAD_X;
  const extColX    = btpStartX + (btpDepths.length ? btpW + COL_GAP : 0);

  const btpColAbsX = (d: number) => btpStartX + BTP_PAD_X + (d - minBtpDepth) * (COL_SLOT_W + COL_GAP);

  const colLayouts = new Map<number, ColumnLayout>();
  for (const d of btpDepths) {
    const comps = (byDepth.get(d) ?? []).filter(c => _zoneOf(c) === 'btp');
    colLayouts.set(d, _columnLayout(comps, 0));
  }

  const btpContentH = btpDepths.length
    ? Math.max(...[...colLayouts.values()].map(l => l.totalH))
    : ICON_H + LABEL_H_EST;
  const btpH = BTP_LABEL_H + BTP_PAD_Y + btpContentH + BTP_PAD_Y;
  const btpY = PAGE_MARGIN + 10;

  const singleH     = ICON_H + LABEL_H_EST;
  const actorStartY = btpY + Math.max(0, Math.floor((btpH - singleH) / 2));
  const extStartY   = btpY + BTP_PAD_Y;

  const mxfile  = new El('mxfile', { host: 'sketch-to-sap-btp', version: '1.0' });
  const diagram = mxfile.sub('diagram', { name: architecture.title });
  diagram.sub('mxGraphModel', {
    dx: '1422', dy: '762', grid: '1', gridSize: '10', guides: '1',
    tooltips: '1', connect: '1', arrows: '1', fold: '1', page: '1',
    pageScale: '1', pageWidth: '1169', pageHeight: '827',
  });
  const graphModel = diagram.children[0];
  const root = graphModel.sub('root');
  root.sub('mxCell', { id: '0' });
  root.sub('mxCell', { id: '1', parent: '0' });

  actorComps.forEach((comp, i) => {
    const y = actorStartY + i * (singleH + COMP_V_GAP);
    _placeComp(root, comp, iconIndex, actorColX, y, ACTOR_SLOT_W);
  });

  if (btpDepths.length) {
    root.sub('mxCell', {
      id: 'btp-boundary', value: 'SAP BTP',
      style: BOUNDARY_STYLE, vertex: '1', parent: '1',
    }).sub('mxGeometry', {
      x: String(btpStartX), y: String(btpY),
      width: String(btpW), height: String(btpH), as: 'geometry',
    });

    const colContentStartY = btpY + BTP_LABEL_H + BTP_PAD_Y;

    for (const d of btpDepths) {
      const colX   = btpColAbsX(d);
      const layout = colLayouts.get(d);
      if (!layout) continue;

      for (const { comp, iconY, catLabelY } of layout.items) {
        if (catLabelY !== null) {
          root.sub('mxCell', {
            id: `cat-${comp.id}`, value: comp.category ?? '',
            style: CAT_LABEL_STYLE, vertex: '1', parent: '1',
          }).sub('mxGeometry', {
            x: String(colX),
            y: String(colContentStartY + catLabelY),
            width: String(COL_SLOT_W), height: String(CAT_H), as: 'geometry',
          });
        }
        _placeComp(root, comp, iconIndex, colX, colContentStartY + iconY, COL_SLOT_W);
      }
    }
  }

  extComps.forEach((comp, i) => {
    const y = extStartY + i * (singleH + COMP_V_GAP);
    _placeComp(root, comp, iconIndex, extColX, y, ACTOR_SLOT_W);
  });

  const skipRev = new Set<string>();
  let edgeId = 10000;
  for (const conn of connections) {
    const key    = `${conn.fromId}→${conn.toId}`;
    const revKey = `${conn.toId}→${conn.fromId}`;
    if (skipRev.has(key)) continue;
    const hasBidi = connections.some(c => c.fromId === conn.toId && c.toId === conn.fromId);
    if (hasBidi) skipRev.add(revKey);
    root.sub('mxCell', {
      id: String(edgeId++), value: '',
      style: hasBidi ? BIDI_EDGE_STYLE : EDGE_STYLE,
      edge: '1', source: conn.fromId, target: conn.toId, parent: '1',
    }).sub('mxGeometry', { relative: '1', as: 'geometry' });
  }

  return `<?xml version="1.0" ?>\n${mxfile.render()}`;
}
