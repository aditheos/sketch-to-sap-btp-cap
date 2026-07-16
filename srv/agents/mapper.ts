'use strict';

import { readFileSync } from 'fs';
import { join }        from 'path';
import type {
  RawComponent, SketchArchitecture,
  MappedComponent, MappedArchitecture,
  CatalogService, CatalogData, DrawioStyle,
  MatchConfidence,
} from './types';

const CATALOG_PATH = join(__dirname, '..', '..', 'data', 'sap_service_catalog.json');

const TYPE_TO_CATEGORY: Record<string, string> = {
  database:    'Data & Storage',
  storage:     'Data & Storage',
  messaging:   'Integration',
  api_gateway: 'Integration',
  integration: 'Integration',
  workflow:    'Process & Automation',
  // 'ui' intentionally omitted — unrecognised UI labels must NOT fall back to Work Zone
  identity:    'Identity & Security',
  ai:          'AI',
  connectivity:'Connectivity',
  analytics:   'Analytics',
  mobile:      'Mobile',
  runtime:     'Development',
  erp:         'External Systems',
  actor:       'Actors & External',
};

const GENERIC_LABELS = new Set([
  'btp', 'sap btp', 'cloud', 'learning', 'ai', 'data', 'service', 'services',
  'platform', 'management', 'integration', 'analytics', 'process',
  'application', 'applications', 'solution', 'solutions', 'suite', 'hub',
  'studio', 'center', 'centre', 'hana',
]);

const EXTERNAL_SAAS_LABELS = new Set([
  'sap successfactors', 'sap concur', 'sap fieldglass', 'sap ariba',
  'sap s4hana', 'sap s4hana cloud', 'sap ecc', 'sap erp', 'sap hcm',
  'sap bw4hana', 'sap bw pce', 'sap solution manager', 'sap focused run',
  'sap business network', 'sap business networks', 'sap isbn', 'sap icx',
  'microsoft azure', 'aws cloud', 'google cloud', 'amazon web services',
  'snowflake', 'databricks', 'sap databricks', 'microsoft fabric',
  'azure data lake', 'amazon redshift', 'amazon athena',
  'google bigquery', 'google cloud storage', 'servicenow',
]);

const FORCE_UNKNOWN_LABELS = new Set([
  'mcp server', 'mcp', 'a2a', 'agent gateway', 'agentgateway',
  'ord aggregator', 'open discovery', 'agent registry', 'agent catalog',
  'orchestrator agent', 'dispute resolution agent',
  'prompt registry', 'knowledge graph engine', 'business data fabric',
  'multi-region manager', 'mrm', 'bdc connect', 'bdc cockpit',
  'foundation models sap hosted', 'foundation models partner hosted',
  'embodied ai on btp',
  'sap business technology platform', 'business technology platform',
  'sap btp platform', 'sap btp boundary',
]);

const DROP_LABELS = new Set([
  'sap business technology platform', 'business technology platform',
  'sap btp', 'btp', 'sap btp platform', 'sap btp boundary',
  'sap btp cockpit', 'btp cockpit', 'cockpit',
]);

const UNKNOWN_DRAWIO: DrawioStyle = {
  fillColor:   '#f5f5f5',
  strokeColor: '#666666',
  fontColor:   '#333333',
  shape:       'rounded=1;arcSize=10',
  width:       160,
  height:      60,
};

let _catalog:    CatalogService[]             | null = null;
let _aliasIndex: Record<string, CatalogService> | null = null;

function _normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function _loadCatalog(): { catalog: CatalogService[]; aliasIndex: Record<string, CatalogService> } {
  if (!_catalog || !_aliasIndex) {
    const data   = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as CatalogData;
    _catalog     = data.services;
    _aliasIndex  = {};
    for (const svc of _catalog) {
      for (const term of [svc.name, ...(svc.aliases ?? [])]) {
        _aliasIndex[_normalise(term)] = svc;
      }
    }
  }
  return { catalog: _catalog, aliasIndex: _aliasIndex };
}

function _escapeRe(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface MatchResult {
  svc: CatalogService | null;
  confidence: MatchConfidence;
}

function _findBestMatch(
  component:  RawComponent,
  aliasIndex: Record<string, CatalogService>,
  catalog:    CatalogService[],
): MatchResult {
  const normLabel = _normalise(component.label);

  if (FORCE_UNKNOWN_LABELS.has(normLabel)) return { svc: null, confidence: 'unknown' };
  if (aliasIndex[normLabel])               return { svc: aliasIndex[normLabel], confidence: 'exact' };

  let bestMatch: CatalogService | null = null;
  let bestLen = 0;
  const labelIsGeneric = GENERIC_LABELS.has(normLabel);

  for (const [alias, svc] of Object.entries(aliasIndex)) {
    const aliasInLabel = new RegExp(`\\b${_escapeRe(alias)}\\b`).test(normLabel);
    const labelInAlias = !labelIsGeneric && new RegExp(`\\b${_escapeRe(normLabel)}\\b`).test(alias);
    if (aliasInLabel || labelInAlias) {
      if (alias.length > bestLen) { bestMatch = svc; bestLen = alias.length; }
    }
  }
  if (bestMatch) return { svc: bestMatch, confidence: 'alias' };

  if (!labelIsGeneric) {
    const category = TYPE_TO_CATEGORY[component.rawType];
    if (category) {
      const fallback = catalog.find(s => s.category === category);
      if (fallback) return { svc: fallback, confidence: 'type_fallback' };
    }
  }

  return { svc: null, confidence: 'unknown' };
}

export function mapToSapServices(sketch: SketchArchitecture): MappedArchitecture {
  const { catalog, aliasIndex } = _loadCatalog();

  const rawComponents: MappedComponent[] = sketch.components.map(comp => {
    const { svc, confidence } = _findBestMatch(comp, aliasIndex, catalog);

    if (svc) {
      return {
        id:            comp.id,
        label:         comp.label,
        rawType:       comp.rawType,
        description:   comp.description ?? '',
        sapServiceId:  svc.id,
        sapServiceName:svc.name,
        category:      svc.category,
        drawio:        svc.drawio,
        cap:           svc.cap,
        bpmn:          svc.bpmn,
        confidence,
        iconId:        svc.icon_id  ?? null,
        renderZone:    svc.render_zone ?? null,
      };
    }

    const isExternal = EXTERNAL_SAAS_LABELS.has(_normalise(comp.label));
    return {
      id:            comp.id,
      label:         comp.label,
      rawType:       comp.rawType,
      description:   comp.description ?? '',
      sapServiceId:  null,
      sapServiceName:comp.label,
      category:      isExternal ? 'External Systems' : 'Other',
      drawio:        UNKNOWN_DRAWIO,
      cap:           { service_type: 'generic', entity_type: 'Component' },
      bpmn:          { task_type: 'serviceTask' },
      confidence:    'unknown',
      iconId:        null,
      renderZone:    null,
    };
  });

  const seenServiceIds    = new Map<string, string>();
  const seenUnknownLabels = new Map<string, string>();
  const idRemap:   Record<string, string> = {};
  const droppedIds = new Set<string>();
  const components: MappedComponent[] = [];

  for (const comp of rawComponents) {
    if (DROP_LABELS.has(_normalise(comp.label ?? comp.sapServiceName))) {
      droppedIds.add(comp.id);
      continue;
    }
    if (comp.sapServiceId) {
      if (seenServiceIds.has(comp.sapServiceId)) {
        idRemap[comp.id] = seenServiceIds.get(comp.sapServiceId)!;
        continue;
      }
      seenServiceIds.set(comp.sapServiceId, comp.id);
    } else {
      const normLabel = _normalise(comp.sapServiceName);
      if (seenUnknownLabels.has(normLabel)) {
        idRemap[comp.id] = seenUnknownLabels.get(normLabel)!;
        continue;
      }
      seenUnknownLabels.set(normLabel, comp.id);
    }
    components.push(comp);
  }

  const seenEdges = new Set<string>();
  const connections = sketch.connections
    .map(conn => ({
      ...conn,
      fromId: idRemap[conn.fromId] ?? conn.fromId,
      toId:   idRemap[conn.toId]   ?? conn.toId,
    }))
    .filter(conn => {
      if (droppedIds.has(conn.fromId) || droppedIds.has(conn.toId)) return false;
      if (conn.fromId === conn.toId) return false;
      const key = `${conn.fromId}→${conn.toId}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

  return { title: sketch.title, components, connections };
}
