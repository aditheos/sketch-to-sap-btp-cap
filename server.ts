'use strict';

import cds    from '@sap/cds';
import path   from 'path';
import multer from 'multer';
import express, { Request, Response } from 'express';

import { extractComponents }   from './srv/agents/vision';
import { parseMermaid }        from './srv/agents/mermaid-parser';
import { mapToSapServices }    from './srv/agents/mapper';
import { validateArchitecture } from './srv/agents/validator';
import { generateDrawio }      from './srv/agents/drawio';
import { DEMO_MODE }           from './srv/agents/config';
import type { SketchArchitecture, MappedArchitecture, ValidationResult } from './srv/agents/types';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── IP-based trial rate limiting ───────────────────────────────────────────
const TRIAL_LIMIT = 3;
interface TrialEntry { count: number; date: string; }
const trialMap = new Map<string, TrialEntry>();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  return fwd
    ? (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim()
    : (req.ip ?? req.socket.remoteAddress ?? 'unknown');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function trialEntry(ip: string): TrialEntry {
  const entry = trialMap.get(ip);
  if (!entry || entry.date !== today()) {
    const fresh: TrialEntry = { count: 0, date: today() };
    trialMap.set(ip, fresh);
    return fresh;
  }
  return entry;
}

function trialRemaining(ip: string): number {
  return Math.max(0, TRIAL_LIMIT - trialEntry(ip).count);
}

function safeHeader(value: string): string {
  return String(value).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
}

function checkAndCharge(req: Request, res: Response): boolean {
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
// ──────────────────────────────────────────────────────────────────────────

function _buildValidationResponse(
  sketch:     SketchArchitecture,
  mapped:     MappedArchitecture,
  validation: ValidationResult,
) {
  return {
    title: sketch.title,
    components: mapped.components.map(c => ({
      id:          c.id,
      label:       c.label,
      sap_service: c.sapServiceName,
      category:    c.category,
      confidence:  c.confidence,
    })),
    connections: mapped.connections.map(conn => ({
      from:  conn.fromId,
      to:    conn.toId,
      label: conn.label,
    })),
    validation: {
      summary:          validation.summary,
      warnings:         validation.warnings.map(w => ({
        severity:   w.severity,
        message:    w.message,
        suggestion: w.suggestion,
      })),
      missing_services: validation.missingServices,
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
cds.on('bootstrap', (app: any) => {
  app.use(express.static(path.join(__dirname, 'app')));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', demoMode: DEMO_MODE });
  });

  app.get('/trial-status', (req: Request, res: Response) => {
    res.json({ remaining: trialRemaining(clientIp(req)), limit: TRIAL_LIMIT, demoMode: DEMO_MODE });
  });

  app.post('/convert', upload.single('file'), async (req: Request, res: Response) => {
    if (!checkAndCharge(req, res)) return;
    try {
      if (!req.file || !ALLOWED_TYPES.has(req.file.mimetype)) {
        res.status(415).json({ error: 'Unsupported file type. Upload PNG, JPEG, GIF, or WebP.' });
        return;
      }
      const sketch = await extractComponents(req.file.buffer, req.file.mimetype);
      if (!sketch.components.length) {
        res.status(422).json({ error: 'No architecture components detected. Try a clearer sketch with visible labels.' });
        return;
      }
      const mapped     = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      const xml        = generateDrawio(mapped);
      const filename   = `${sketch.title.replace(/\s+/g, '_').toLowerCase()}.drawio`;
      res
        .setHeader('Content-Type', 'application/xml')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .setHeader('X-Validation-Summary', safeHeader(validation.summary))
        .setHeader('X-Warning-Count', String(validation.warnings.length))
        .setHeader('X-Missing-Services', safeHeader(validation.missingServices.join(', ')))
        .send(xml);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Vision pipeline failed: ${msg}` });
    }
  });

  app.post('/convert-mermaid', express.json(), async (req: Request, res: Response) => {
    if (!checkAndCharge(req, res)) return;
    try {
      const { mermaid } = (req.body ?? {}) as { mermaid?: string };
      if (!mermaid?.trim()) { res.status(422).json({ error: 'Mermaid text is empty.' }); return; }
      const sketch = parseMermaid(mermaid);
      if (!sketch.components.length) {
        res.status(422).json({ error: 'No components found. Ensure nodes have labels, e.g. A[SAP HANA Cloud].' });
        return;
      }
      const mapped     = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      const xml        = generateDrawio(mapped);
      const filename   = `${sketch.title.replace(/\s+/g, '_').toLowerCase()}.drawio`;
      res
        .setHeader('Content-Type', 'application/xml')
        .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        .setHeader('X-Validation-Summary', safeHeader(validation.summary))
        .setHeader('X-Warning-Count', String(validation.warnings.length))
        .setHeader('X-Missing-Services', safeHeader(validation.missingServices.join(', ')))
        .send(xml);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Mermaid pipeline failed: ${msg}` });
    }
  });

  app.post('/validate-only', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file || !ALLOWED_TYPES.has(req.file.mimetype)) {
        res.status(415).json({ error: 'Unsupported file type.' }); return;
      }
      const sketch     = await extractComponents(req.file.buffer, req.file.mimetype);
      const mapped     = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      res.json(_buildValidationResponse(sketch, mapped, validation));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Validation failed: ${msg}` });
    }
  });

  app.post('/validate-mermaid', express.json(), async (req: Request, res: Response) => {
    try {
      const { mermaid } = (req.body ?? {}) as { mermaid?: string };
      if (!mermaid?.trim()) { res.status(422).json({ error: 'Mermaid text is empty.' }); return; }
      const sketch     = parseMermaid(mermaid);
      const mapped     = mapToSapServices(sketch);
      const validation = await validateArchitecture(mapped);
      res.json(_buildValidationResponse(sketch, mapped, validation));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Validation failed: ${msg}` });
    }
  });
});

export default cds.server;
