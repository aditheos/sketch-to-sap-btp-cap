'use strict';

import type { SketchArchitecture } from './types';

type TokenType = 'id' | 'arrow';
type Token     = [TokenType, string];
type RawEdge   = [string, string, string];

// Matches node id followed by a labelled shape.
const NODE_LABEL_RE = /\b([A-Za-z_]\w*)\s*(?:\[\(([^\)\]]+)\)\]|\(\(([^\)]+)\)\)|\[([^\]]+)\]|\(([^\)]+)\)|\{([^\}]+)\})/g;

const HAS_ARROW = /-{2,}[>.\s|]?|-\.->|={2,}/;

const TOKEN_RE = /([A-Za-z_]\w*)|--+>?\s*(?:\|([^|]*)\|)?\s*/g;

const TYPE_HINTS: Array<[string[], string]> = [
  [['s/4hana', 's4hana', 'ecc', 'successfactors', 'ariba', 'concur', 'on-premise', 'netweaver'], 'erp'],
  [['hana cloud', 'hana db', 'datasphere', 'object store', 'data lake'], 'database'],
  [['api management', 'api gateway', 'developer hub', 'api hub', 'apim'], 'api_gateway'],
  [['event mesh', 'event broker', 'message queue', 'pub/sub', 'kafka', 'rabbitmq'], 'messaging'],
  [['process automation', 'workflow', 'bpa', 'rpa', 'task center'], 'workflow'],
  [['work zone', 'launchpad', 'fiori portal'], 'ui'],
  [['cloud identity', 'identity authentication', 'xsuaa', 'credential store'], 'identity'],
  [['ai core', 'generative ai', 'ai launchpad', 'joule', 'gen ai hub'], 'ai'],
  [['cloud connector', 'private link', 'connectivity service'], 'connectivity'],
  [['analytics cloud', 'sac', 'reporting'], 'analytics'],
  [['mobile services', 'mobile development kit', 'mdk'], 'mobile'],
  [['cloud foundry', 'kyma', 'build code', 'business application studio'], 'runtime'],
  [['integration suite', 'cloud integration', 'open connectors'], 'integration'],
];

function _inferType(label: string, isCylinder = false): string {
  if (isCylinder) return 'database';
  const norm = label.toLowerCase();
  for (const [hints, rawType] of TYPE_HINTS) {
    if (hints.some(h => norm.includes(h))) return rawType;
  }
  return 'unknown';
}

function _normalizeArrows(line: string): string {
  line = line.replace(/--[^-|>\n]+-+>/g, '-->');
  line = line.replace(/-\.->/g, '-->');
  line = line.replace(/={2,}>?/g, '-->');
  line = line.replace(/-{3,}(?!>)/g, '-->');
  return line;
}

function _extractEdges(line: string): RawEdge[] {
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m[1]) tokens.push(['id', m[1]]);
    else      tokens.push(['arrow', (m[2] ?? '').trim()]);
  }

  const edges: RawEdge[] = [];
  let i = 0;
  while (i < tokens.length - 2) {
    if (tokens[i][0] === 'id' && tokens[i + 1][0] === 'arrow' && tokens[i + 2][0] === 'id') {
      const src   = tokens[i][1];
      const label = tokens[i + 1][1];
      const tgt   = tokens[i + 2][1];
      if (src !== tgt) edges.push([src, tgt, label]);
      i += 2;
    } else {
      i++;
    }
  }
  return edges;
}

export function parseMermaid(text: string): SketchArchitecture {
  const lines = text.trim().split('\n');
  let title = 'SAP BTP Architecture';
  const nodeLabels:   Record<string, string>  = {};
  const nodeCylinder: Record<string, boolean> = {};
  const rawEdges: RawEdge[] = [];

  let inFrontmatter = false;
  for (const line of lines) {
    const s = line.trim();
    if (s === '---') { inFrontmatter = !inFrontmatter; continue; }
    if (inFrontmatter && s.toLowerCase().startsWith('title:')) {
      title = s.slice(6).trim().replace(/^["']|["']$/g, '');
      break;
    }
  }

  const SKIP_PREFIXES = ['graph ', 'flowchart ', 'subgraph', 'end', '---', 'classdef', 'class ', 'click ', 'style ', 'linkstyle'];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    if (stripped.startsWith('%%')) {
      const m = stripped.match(/^%%\s*title\s*:\s*(.+)/i);
      if (m) title = m[1].trim();
      continue;
    }

    if (SKIP_PREFIXES.some(p => stripped.toLowerCase().startsWith(p.toLowerCase()))) continue;

    let m: RegExpExecArray | null;
    NODE_LABEL_RE.lastIndex = 0;
    while ((m = NODE_LABEL_RE.exec(stripped)) !== null) {
      const nid   = m[1];
      const label = [m[2], m[3], m[4], m[5], m[6]].find(g => g !== undefined);
      if (label !== undefined) {
        nodeLabels[nid]   = label.trim();
        nodeCylinder[nid] = m[2] !== undefined;
      }
    }

    if (HAS_ARROW.test(stripped)) {
      NODE_LABEL_RE.lastIndex = 0;
      const shapeStripped = stripped.replace(NODE_LABEL_RE, '$1');
      NODE_LABEL_RE.lastIndex = 0;
      const normalised = _normalizeArrows(shapeStripped);
      rawEdges.push(..._extractEdges(normalised));
    }
  }

  const allIds = new Set(Object.keys(nodeLabels));
  for (const [src, tgt] of rawEdges) { allIds.add(src); allIds.add(tgt); }

  const sortedIds = [...allIds].sort();
  const idMap: Record<string, string> = Object.fromEntries(
    sortedIds.map((nid, i) => [nid, `comp_${i + 1}`]),
  );

  const components = sortedIds.map(nid => ({
    id:          idMap[nid],
    label:       nodeLabels[nid] ?? nid,
    rawType:     _inferType(nodeLabels[nid] ?? nid, nodeCylinder[nid] ?? false),
    description: '',
  }));

  const connections = rawEdges
    .filter(([src, tgt]) => idMap[src] && idMap[tgt])
    .map(([src, tgt, label]) => ({
      fromId: idMap[src],
      toId:   idMap[tgt],
      label,
    }));

  return { title, components, connections };
}
