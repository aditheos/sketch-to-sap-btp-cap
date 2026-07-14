'use strict';

const cds = require('@sap/cds');
const path = require('path');
const multer = require('multer');

const { extractComponents } = require('./srv/agents/vision');
const { parseMermaid } = require('./srv/agents/mermaid-parser');
const { mapToSapServices } = require('./srv/agents/mapper');
const { validateArchitecture } = require('./srv/agents/validator');
const { generateDrawio } = require('./srv/agents/drawio');
const { DEMO_MODE } = require('./srv/agents/config');

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── IP-based trial rate limiting ──────────────────────────────────────────
const TRIAL_LIMIT = 3;
const trialMap = new Map(); // ip → { count, date }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return fwd ? fwd.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || 'unknown');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function trialEntry(ip) {
  const entry = trialMap.get(ip);
  if (!entry || entry.date !== today()) {
    const fresh = { count: 0, date: today() };
    trialMap.set(ip, fresh);
    return fresh;
  }
  return entry;
}

function trialRemaining(ip) {
  return Math.max(0, TRIAL_LIMIT - trialEntry(ip).count);
}

function checkAndCharge(req, res) {
  if (!DEMO_MODE) return true;
  const ip = clientIp(req);
  const entry = trialEntry(ip);
  if (entry.count >= TRIAL_LIMIT) {
    res.status(429).json({ error: 'Trial limit reached (3 free conversions per day). Contact info@aditheos.com for full access.' });
    return false;
  }
  entry.count++;
  res.setHeader('X-Trial-Remaining', String(Math.max(0, TRIAL_LIMIT - entry.count)));
  return true;
}
// ─────────────────────────────────────────────────────────────────────────

cds.on('bootstrap', (app) => {
  // Serve the static Fiori UI from app/
  app.use(require('express').static(path.join(__dirname, 'app')));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', demoMode: DEMO_MODE });
  });

  app.get('/trial-status', (req, res) => {
    res.json({ remaining: trialRemaining(clientIp(req)), limit: TRIAL_LIMIT, demoMode: DEMO_MODE });
  });

  app.post('/convert', upload.single('file'), async (req, res) => {
    if (!checkAndCharge(req, res)) return;
    try {
      if (!req.file || !ALLOWED_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({ error: 'Unsupported file type. Upload PNG, JPEG, GIF, or WebP.' });
      }
      const sketch = await extractComponents(req.file.buffer, req.file.mimetype);
      if (!sketch.components.length) {
        return res.status(422).json({ error: 'No architecture components detected. Try a clearer sketch with visible labels.' });
      }
      const mapped = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      const xml = generateDrawio(mapped);
      const filename = `${sketch.title.replace(/\s+/g, '_').toLowerCase()}.drawio`;
      res
        .setHeader('Content-Type', 'application/xml')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .setHeader('X-Validation-Summary', validation.summary)
        .setHeader('X-Warning-Count', String(validation.warnings.length))
        .setHeader('X-Missing-Services', validation.missingServices.join(', '))
        .send(xml);
    } catch (err) {
      res.status(500).json({ error: `Vision pipeline failed: ${err.message}` });
    }
  });

  app.post('/convert-mermaid', require('express').json(), async (req, res) => {
    if (!checkAndCharge(req, res)) return;
    try {
      const { mermaid } = req.body || {};
      if (!mermaid?.trim()) return res.status(422).json({ error: 'Mermaid text is empty.' });
      const sketch = parseMermaid(mermaid);
      if (!sketch.components.length) {
        return res.status(422).json({ error: 'No components found. Ensure nodes have labels, e.g. A[SAP HANA Cloud].' });
      }
      const mapped = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      const xml = generateDrawio(mapped);
      const filename = `${sketch.title.replace(/\s+/g, '_').toLowerCase()}.drawio`;
      res
        .setHeader('Content-Type', 'application/xml')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .setHeader('X-Validation-Summary', validation.summary)
        .setHeader('X-Warning-Count', String(validation.warnings.length))
        .setHeader('X-Missing-Services', validation.missingServices.join(', '))
        .send(xml);
    } catch (err) {
      res.status(500).json({ error: `Mermaid pipeline failed: ${err.message}` });
    }
  });

  app.post('/validate-only', upload.single('file'), async (req, res) => {
    try {
      if (!req.file || !ALLOWED_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({ error: 'Unsupported file type.' });
      }
      const sketch = await extractComponents(req.file.buffer, req.file.mimetype);
      const mapped = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      res.json(_buildValidationResponse(sketch, mapped, validation));
    } catch (err) {
      res.status(500).json({ error: `Validation failed: ${err.message}` });
    }
  });

  app.post('/validate-mermaid', require('express').json(), async (req, res) => {
    try {
      const { mermaid } = req.body || {};
      if (!mermaid?.trim()) return res.status(422).json({ error: 'Mermaid text is empty.' });
      const sketch = parseMermaid(mermaid);
      const mapped = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      res.json(_buildValidationResponse(sketch, mapped, validation));
    } catch (err) {
      res.status(500).json({ error: `Validation failed: ${err.message}` });
    }
  });
});

function _buildValidationResponse(sketch, mapped, validation) {
  return {
    title: sketch.title,
    components: mapped.components.map(c => ({
      id: c.id,
      label: c.label,
      sap_service: c.sapServiceName,
      category: c.category,
      confidence: c.confidence,
    })),
    connections: mapped.connections.map(conn => ({
      from: conn.fromId,
      to: conn.toId,
      label: conn.label,
    })),
    validation: {
      summary: validation.summary,
      warnings: validation.warnings.map(w => ({
        severity: w.severity,
        message: w.message,
        suggestion: w.suggestion,
      })),
      missing_services: validation.missingServices,
    },
  };
}

module.exports = cds.server;
