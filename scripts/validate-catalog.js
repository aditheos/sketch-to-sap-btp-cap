'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, '..', 'data', 'sap_service_catalog.json');

const VALID_CATEGORIES = new Set([
  'Data & Storage',
  'Integration',
  'Messaging',
  'Process & Automation',
  'Identity & Security',
  'AI',
  'Connectivity',
  'Analytics',
  'Mobile',
  'Development',
  'Work Zone',
  'Document Management',
  'DevOps & Operations',
  'External Systems',
  'Actors & External',
  'Other',
]);

const REQUIRED_DRAWIO_FIELDS = ['fillColor', 'strokeColor', 'fontColor'];

let errors = 0;
let warnings = 0;

function error(id, msg) {
  console.error(`  ✗ [${id}] ${msg}`);
  errors++;
}

function warn(id, msg) {
  console.warn(`  ⚠ [${id}] ${msg}`);
  warnings++;
}

const data = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
const services = data.services;

if (!Array.isArray(services)) {
  console.error('FATAL: data.services is not an array');
  process.exit(1);
}

console.log(`Validating ${services.length} catalog entries...\n`);

const seenIds = new Set();
const seenNames = new Set();

for (const svc of services) {
  // Required string fields
  if (!svc.id || typeof svc.id !== 'string')         error(svc.id || '?', 'missing or invalid "id"');
  if (!svc.name || typeof svc.name !== 'string')     error(svc.id, 'missing or invalid "name"');
  if (!svc.category || typeof svc.category !== 'string') error(svc.id, 'missing or invalid "category"');

  // Duplicate detection
  if (seenIds.has(svc.id))     error(svc.id, 'duplicate id');
  else seenIds.add(svc.id);

  if (seenNames.has(svc.name)) error(svc.id, `duplicate name "${svc.name}"`);
  else seenNames.add(svc.name);

  // Category must be from the known set
  if (svc.category && !VALID_CATEGORIES.has(svc.category))
    error(svc.id, `unknown category "${svc.category}"`);

  // Aliases must be an array
  if (svc.aliases !== undefined && !Array.isArray(svc.aliases))
    error(svc.id, '"aliases" must be an array');

  // drawio object
  if (!svc.drawio || typeof svc.drawio !== 'object') {
    error(svc.id, 'missing "drawio" object');
  } else {
    for (const field of REQUIRED_DRAWIO_FIELDS) {
      if (!svc.drawio[field]) error(svc.id, `drawio missing "${field}"`);
    }
  }

  // cap object
  if (!svc.cap || typeof svc.cap !== 'object')
    error(svc.id, 'missing "cap" object');

  // icon_id — warn only, not an error (community contributions may not have it yet)
  if (!svc.icon_id)
    warn(svc.id, 'icon_id is null — icon will render as a fallback box');
}

console.log(`\nResult: ${errors} error(s), ${warnings} warning(s)\n`);

if (errors > 0) {
  console.error(`Catalog validation FAILED — fix the ${errors} error(s) above before merging.`);
  process.exit(1);
}

if (warnings > 0) {
  console.warn('Catalog validation passed with warnings. Consider adding icon_id values.');
}

console.log('Catalog validation passed.');
