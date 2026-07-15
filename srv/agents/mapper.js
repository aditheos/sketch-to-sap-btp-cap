'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', '..', 'data', 'sap_service_catalog.json');

const TYPE_TO_CATEGORY = {
  database: 'Data & Storage',
  storage: 'Data & Storage',
  messaging: 'Integration',
  api_gateway: 'Integration',
  integration: 'Integration',
  workflow: 'Process & Automation',
  // 'ui' intentionally omitted — unrecognised UI labels must NOT fall back to Work Zone
  identity: 'Identity & Security',
  ai: 'AI',
  connectivity: 'Connectivity',
  analytics: 'Analytics',
  mobile: 'Mobile',
  runtime: 'Development',
  erp: 'External Systems',
  actor: 'Actors & External',
};

// Labels too generic to confidently pin to a specific catalog alias via substring match.
// Exact alias matches (step 1) are unaffected — this only blocks the fuzzy partial path.
const GENERIC_LABELS = new Set([
  'btp', 'sap btp', 'cloud', 'learning', 'ai', 'data', 'service', 'services',
  'platform', 'management', 'integration', 'analytics', 'process',
  'application', 'applications', 'solution', 'solutions', 'suite', 'hub',
  'studio', 'center', 'centre', 'hana',
]);

// Known external SAP SaaS products and hyperscalers that render outside the BTP boundary.
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

// Emerging concepts with no BTP icon yet — must not false-match any catalog entry.
// Also includes BTP boundary/container labels that vision may extract as components.
const FORCE_UNKNOWN_LABELS = new Set([
  'mcp server', 'mcp', 'a2a', 'agent gateway', 'agentgateway',
  'ord aggregator', 'open discovery', 'agent registry', 'agent catalog',
  'orchestrator agent', 'dispute resolution agent',
  'prompt registry', 'knowledge graph engine', 'business data fabric',
  'multi-region manager', 'mrm', 'bdc connect', 'bdc cockpit',
  'foundation models sap hosted', 'foundation models partner hosted',
  'embodied ai on btp',
  // BTP boundary box labels — vision sometimes extracts the outer box as a component
  'sap business technology platform', 'business technology platform',
  'sap btp platform', 'sap btp boundary',
]);

// Labels that should be DROPPED entirely — not rendered even as unknown boxes.
// These are BTP boundary/container labels and admin tools that are not real BTP services
// in the context of a solution architecture diagram.
const DROP_LABELS = new Set([
  'sap business technology platform', 'business technology platform',
  'sap btp', 'btp', 'sap btp platform', 'sap btp boundary',
  'sap btp cockpit', 'btp cockpit', 'cockpit',
]);

const UNKNOWN_DRAWIO = {
  fillColor: '#f5f5f5',
  strokeColor: '#666666',
  fontColor: '#333333',
  shape: 'rounded=1;arcSize=10',
  width: 160,
  height: 60,
};

let _catalog = null;
let _aliasIndex = null;

function _normalise(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function _loadCatalog() {
  if (!_catalog) {
    const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
    _catalog = data.services;
    _aliasIndex = {};
    for (const svc of _catalog) {
      for (const term of [svc.name, ...(svc.aliases || [])]) {
        _aliasIndex[_normalise(term)] = svc;
      }
    }
  }
  return { catalog: _catalog, aliasIndex: _aliasIndex };
}

function _escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _findBestMatch(component, aliasIndex, catalog) {
  const normLabel = _normalise(component.label);

  if (FORCE_UNKNOWN_LABELS.has(normLabel)) return { svc: null, confidence: 'unknown' };

  if (aliasIndex[normLabel]) return { svc: aliasIndex[normLabel], confidence: 'exact' };

  let bestMatch = null;
  let bestLen = 0;
  const labelIsGeneric = GENERIC_LABELS.has(normLabel);

  for (const [alias, svc] of Object.entries(aliasIndex)) {
    const aliasInLabel = new RegExp(`\\b${_escapeRe(alias)}\\b`).test(normLabel);
    const labelInAlias = !labelIsGeneric && new RegExp(`\\b${_escapeRe(normLabel)}\\b`).test(alias);
    if (aliasInLabel || labelInAlias) {
      if (alias.length > bestLen) {
        bestMatch = svc;
        bestLen = alias.length;
      }
    }
  }
  if (bestMatch) return { svc: bestMatch, confidence: 'alias' };

  // Type fallback only fires for non-generic labels — generic labels like 'btp',
  // 'platform', 'integration' must not land on a random first-match service.
  if (!labelIsGeneric) {
    const category = TYPE_TO_CATEGORY[component.rawType];
    if (category) {
      const fallback = catalog.find(s => s.category === category);
      if (fallback) return { svc: fallback, confidence: 'type_fallback' };
    }
  }

  return { svc: null, confidence: 'unknown' };
}

function mapToSapServices(sketch) {
  const { catalog, aliasIndex } = _loadCatalog();

  const rawComponents = sketch.components.map(comp => {
    const { svc, confidence } = _findBestMatch(comp, aliasIndex, catalog);

    if (svc) {
      return {
        id: comp.id,
        label: comp.label,
        rawType: comp.rawType,
        description: comp.description || '',
        sapServiceId: svc.id,
        sapServiceName: svc.name,
        category: svc.category,
        drawio: svc.drawio,
        cap: svc.cap,
        bpmn: svc.bpmn,
        confidence,
        iconId: svc.icon_id || null,
        renderZone: svc.render_zone || null,
      };
    }

    const isExternal = EXTERNAL_SAAS_LABELS.has(_normalise(comp.label));
    return {
      id: comp.id,
      label: comp.label,
      rawType: comp.rawType,
      description: comp.description || '',
      sapServiceId: null,
      sapServiceName: comp.label,
      category: isExternal ? 'External Systems' : 'Other',
      drawio: UNKNOWN_DRAWIO,
      cap: { service_type: 'generic', entity_type: 'Component' },
      bpmn: { task_type: 'serviceTask' },
      confidence: 'unknown',
      iconId: null,
      renderZone: null,
    };
  });

  // Deduplicate: if vision detected the same SAP service twice, keep the first occurrence
  // and remap all connections from the duplicate ID to the survivor ID.
  // Matched services dedup by sapServiceId; unmatched unknowns dedup by normalised label.
  // Components in DROP_LABELS are removed entirely (boundary boxes, admin UI artifacts).
  const seenServiceIds   = new Map(); // sapServiceId → surviving comp id
  const seenUnknownLabels = new Map(); // normLabel → surviving comp id
  const idRemap   = {};              // duplicateId → survivorId
  const droppedIds = new Set();      // ids of boundary/container components to discard
  const components = [];

  for (const comp of rawComponents) {
    // Drop BTP boundary/container labels — not real service components
    if (DROP_LABELS.has(_normalise(comp.label || comp.sapServiceName))) {
      droppedIds.add(comp.id);
      continue;
    }
    if (comp.sapServiceId) {
      if (seenServiceIds.has(comp.sapServiceId)) {
        idRemap[comp.id] = seenServiceIds.get(comp.sapServiceId);
        continue; // drop duplicate
      }
      seenServiceIds.set(comp.sapServiceId, comp.id);
    } else {
      const normLabel = _normalise(comp.sapServiceName);
      if (seenUnknownLabels.has(normLabel)) {
        idRemap[comp.id] = seenUnknownLabels.get(normLabel);
        continue; // drop duplicate unknown
      }
      seenUnknownLabels.set(normLabel, comp.id);
    }
    components.push(comp);
  }

  const seenEdges = new Set();
  const connections = sketch.connections
    .map(conn => ({
      ...conn,
      fromId: idRemap[conn.fromId] || conn.fromId,
      toId:   idRemap[conn.toId]   || conn.toId,
    }))
    .filter(conn => {
      if (droppedIds.has(conn.fromId) || droppedIds.has(conn.toId)) return false; // dropped endpoint
      if (conn.fromId === conn.toId) return false; // self-loop
      const key = `${conn.fromId}→${conn.toId}`;
      if (seenEdges.has(key)) return false;        // duplicate edge
      seenEdges.add(key);
      return true;
    });

  return { title: sketch.title, components, connections };
}

module.exports = { mapToSapServices };
