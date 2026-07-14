'use strict';

const fs = require('fs');
const path = require('path');

const ICON_INDEX_PATH = path.join(__dirname, '..', '..', 'data', 'sap_icon_index.json');

const SLOT_W = 150;
const SLOT_H = 130;
const ICON_SIZE = 48;
const LABEL_W = 140;
const LABEL_H = 56;
const LABEL_GAP = 6;
const COLS = 4;
const CAT_HEADER_H = 26;
const CAT_GAP = 20;
const PAD = 24;
const MARGIN = 60;
const COL_GAP = 50;
const TITLE_H = 36;

const SAP_BLUE = '#0070F2';
const SAP_TEXT = '#1a2733';

const BOUNDARY_STYLE =
  `rounded=1;whiteSpace=wrap;html=1;strokeColor=${SAP_BLUE};fillColor=#EBF8FF;arcSize=32;absoluteArcSize=1;strokeWidth=1.5;`;
const TITLE_STYLE =
  `text;html=1;align=left;verticalAlign=middle;strokeColor=none;fillColor=none;fontSize=16;fontStyle=1;fontColor=${SAP_TEXT};fontFamily=Helvetica;`;
const HEADER_STYLE =
  `text;html=1;align=left;verticalAlign=middle;strokeColor=none;fillColor=none;fontSize=12;fontStyle=1;fontColor=${SAP_TEXT};fontFamily=Helvetica;`;
const LABEL_CELL_STYLE =
  `text;html=1;align=center;verticalAlign=top;whiteSpace=wrap;fontFamily=Helvetica;fontColor=${SAP_TEXT};fontSize=11;fontStyle=1;`;
const EDGE_STYLE =
  `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=blockThin;endFill=1;endSize=4;startSize=4;strokeWidth=1.5;strokeColor=#475E75;fontSize=10;fontFamily=Helvetica;fontColor=${SAP_TEXT};exitX=1;exitY=0.5;exitDx=0;exitDy=0;exitPerimeter=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;entryPerimeter=0;`;

const FALLBACK_RECT_W = 140;
const FALLBACK_RECT_H = 60;

let _iconIndex = null;

function _loadIconIndex() {
  if (!_iconIndex) {
    _iconIndex = JSON.parse(fs.readFileSync(ICON_INDEX_PATH, 'utf-8'));
  }
  return _iconIndex;
}

// Minimal XML builder — produces properly indented, attribute-escaped XML.
class El {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
  }
  sub(tag, attrs = {}) {
    const c = new El(tag, attrs);
    this.children.push(c);
    return c;
  }
  render(d = 0) {
    const p = '  '.repeat(d);
    const a = Object.entries(this.attrs)
      .map(([k, v]) => `${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`)
      .join(' ');
    const open = a ? `${p}<${this.tag} ${a}` : `${p}<${this.tag}`;
    if (!this.children.length) return `${open}/>`;
    const kids = this.children.map(c => c.render(d + 1)).join('\n');
    return `${open}>\n${kids}\n${p}</${this.tag}>`;
  }
}

function _zone(comp) {
  if (comp.renderZone) return comp.renderZone;
  if (comp.category === 'Actors & External') return 'actor';
  if (comp.category === 'External Systems') return 'external';
  return 'btp';
}

function _placeComponent(root, comp, iconIndex, x, y, parent) {
  const icon = comp.iconId ? iconIndex[comp.iconId] : null;

  if (icon) {
    const iconCell = root.sub('mxCell', {
      id: comp.id,
      value: '',
      style: `shape=image;html=1;imageAspect=0;aspect=fixed;image=data:image/svg+xml,${icon.base64_svg};`,
      vertex: '1',
      parent,
      tooltip: comp.description || comp.sapServiceName,
    });
    const iconX = x + Math.floor((SLOT_W - ICON_SIZE) / 2);
    iconCell.sub('mxGeometry', { x: String(iconX), y: String(y), width: String(ICON_SIZE), height: String(ICON_SIZE), as: 'geometry' });

    const labelCell = root.sub('mxCell', {
      id: `label-${comp.id}`,
      value: comp.sapServiceName,
      style: LABEL_CELL_STYLE,
      vertex: '1',
      parent,
    });
    const labelX = x + Math.floor((SLOT_W - LABEL_W) / 2);
    labelCell.sub('mxGeometry', { x: String(labelX), y: String(y + ICON_SIZE + LABEL_GAP), width: String(LABEL_W), height: String(LABEL_H), as: 'geometry' });
  } else {
    const fill = comp.drawio?.fillColor || '#f5f5f5';
    const stroke = comp.drawio?.strokeColor || '#666';
    const font = comp.drawio?.fontColor || '#000';
    const fallbackCell = root.sub('mxCell', {
      id: comp.id,
      value: comp.sapServiceName,
      style: `rounded=1;whiteSpace=wrap;html=1;arcSize=10;fontFamily=Helvetica;fillColor=${fill};strokeColor=${stroke};fontColor=${font};fontSize=11;fontStyle=1;`,
      vertex: '1',
      parent,
      tooltip: comp.description || comp.sapServiceName,
    });
    const rectX = x + Math.floor((SLOT_W - FALLBACK_RECT_W) / 2);
    fallbackCell.sub('mxGeometry', { x: String(rectX), y: String(y + 10), width: String(FALLBACK_RECT_W), height: String(FALLBACK_RECT_H), as: 'geometry' });
  }
}

function _layoutGrid(comps, x0, y0) {
  const positions = comps.map((comp, idx) => ({
    comp,
    x: x0 + (idx % COLS) * SLOT_W,
    y: y0 + Math.floor(idx / COLS) * SLOT_H,
  }));
  if (!comps.length) return { positions, width: 0, height: 0 };
  const rows = Math.floor((comps.length - 1) / COLS) + 1;
  return { positions, width: Math.min(comps.length, COLS) * SLOT_W, height: rows * SLOT_H };
}

function _layoutCategories(categories) {
  const placements = [];
  let y = 0;
  let maxW = 0;
  for (const [category, comps] of Object.entries(categories)) {
    placements.push({ kind: 'header', category, x: 0, y });
    y += CAT_HEADER_H;
    const { positions, width, height } = _layoutGrid(comps, 0, y);
    for (const { comp, x: gx, y: gy } of positions) {
      placements.push({ kind: 'icon', comp, x: gx, y: gy });
    }
    maxW = Math.max(maxW, width);
    y += height + CAT_GAP;
  }
  return { placements, width: maxW, height: Math.max(y - CAT_GAP, 0) };
}

function generateDrawio(architecture) {
  const iconIndex = _loadIconIndex();

  const mxfile = new El('mxfile', { host: 'sketch-to-sap-btp', version: '1.0' });
  const diagram = mxfile.sub('diagram', { name: architecture.title });
  const graphModel = diagram.sub('mxGraphModel', {
    dx: '1422', dy: '762', grid: '1', gridSize: '10', guides: '1',
    tooltips: '1', connect: '1', arrows: '1', fold: '1', page: '1',
    pageScale: '1', pageWidth: '1169', pageHeight: '827',
  });
  const root = graphModel.sub('root');
  root.sub('mxCell', { id: '0' });
  root.sub('mxCell', { id: '1', parent: '0' });

  const actors = architecture.components.filter(c => _zone(c) === 'actor');
  const external = architecture.components.filter(c => _zone(c) === 'external');

  const btpCategories = {};
  for (const comp of architecture.components) {
    if (_zone(comp) === 'actor' || _zone(comp) === 'external') continue;
    (btpCategories[comp.category] = btpCategories[comp.category] || []).push(comp);
  }

  const { placements, width: contentW, height: contentH } = _layoutCategories(btpCategories);

  const actorColW = actors.length ? SLOT_W + COL_GAP : 0;
  const boundaryX = MARGIN + actorColW;
  const boundaryY = MARGIN + TITLE_H;
  const boundaryW = Object.keys(btpCategories).length ? contentW + 2 * PAD : 0;
  const boundaryH = Object.keys(btpCategories).length ? contentH + 2 * PAD : 0;

  // Actors — outside boundary, left column
  for (let i = 0; i < actors.length; i++) {
    _placeComponent(root, actors[i], iconIndex, MARGIN, boundaryY + i * SLOT_H, '1');
  }

  // BTP-native services — inside boundary container
  if (Object.keys(btpCategories).length) {
    const boundaryCell = root.sub('mxCell', {
      id: 'btp-boundary', value: '', style: BOUNDARY_STYLE, vertex: '1', parent: '1',
    });
    boundaryCell.sub('mxGeometry', { x: String(boundaryX), y: String(boundaryY), width: String(boundaryW), height: String(boundaryH), as: 'geometry' });

    const titleCell = root.sub('mxCell', {
      id: 'btp-boundary-title', value: 'SAP BTP', style: TITLE_STYLE, vertex: '1', parent: '1',
    });
    titleCell.sub('mxGeometry', { x: String(boundaryX), y: String(boundaryY - 30), width: '200', height: '24', as: 'geometry' });

    for (const p of placements) {
      if (p.kind === 'header') {
        const headerCell = root.sub('mxCell', {
          id: `header-${p.category}`,
          value: p.category,
          style: HEADER_STYLE,
          vertex: '1',
          parent: 'btp-boundary',
        });
        headerCell.sub('mxGeometry', { x: String(p.x + PAD), y: String(p.y + PAD), width: '300', height: '22', as: 'geometry' });
      } else {
        _placeComponent(root, p.comp, iconIndex, p.x + PAD, p.y + PAD, 'btp-boundary');
      }
    }
  }

  // External systems — outside boundary, right column
  const externalX = Object.keys(btpCategories).length ? boundaryX + boundaryW + COL_GAP : boundaryX;
  for (let i = 0; i < external.length; i++) {
    _placeComponent(root, external[i], iconIndex, externalX, boundaryY + i * SLOT_H, '1');
  }

  // Edges
  let edgeId = 10000;
  for (const conn of architecture.connections) {
    const edgeCell = root.sub('mxCell', {
      id: String(edgeId++),
      value: conn.label || '',
      style: EDGE_STYLE,
      edge: '1',
      source: conn.fromId,
      target: conn.toId,
      parent: '1',
    });
    edgeCell.sub('mxGeometry', { relative: '1', as: 'geometry' });
  }

  return `<?xml version="1.0" ?>\n${mxfile.render()}`;
}

module.exports = { generateDrawio };
