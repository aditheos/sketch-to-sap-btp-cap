'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const VISION_MODEL = process.env.VISION_MODEL || 'claude-sonnet-4-6';
const VALIDATOR_MODEL = process.env.VALIDATOR_MODEL || 'claude-haiku-4-5';
const DEMO_MODE = (process.env.DEMO_MODE || 'false').toLowerCase() === 'true';

/**
 * Three-tier API key resolution (same priority as the Python config.py):
 *   1. SAP AI Core service binding (VCAP_SERVICES.aicore)
 *   2. BTP Credential Store binding (VCAP_SERVICES.credential-store)
 *   3. Local ANTHROPIC_API_KEY env var
 */
async function getClient() {
  const vcapRaw = process.env.VCAP_SERVICES;
  if (vcapRaw) {
    let vcap = {};
    try { vcap = JSON.parse(vcapRaw); } catch { /* not valid JSON */ }

    if (vcap.aicore?.[0]) return _sapAiCoreClient(vcap.aicore[0]);
    if (vcap['credential-store']?.[0]) {
      const apiKey = await _keyFromCredentialStore(vcap['credential-store'][0]);
      return new Anthropic({ apiKey });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(
    'No API key found. Set ANTHROPIC_API_KEY in .env or bind an SAP Credential Store service.'
  );
  return new Anthropic({ apiKey });
}

async function _sapAiCoreClient(binding) {
  const creds = binding.credentials || {};
  const baseUrl = creds.serviceurls?.AI_API_URL || '';
  const token = await _fetchOAuthToken(creds);
  return new Anthropic({ apiKey: token, baseUrl: `${baseUrl}/v2/inference/deployments` });
}

async function _fetchOAuthToken({ url, clientid, clientsecret }) {
  const auth = Buffer.from(`${clientid}:${clientsecret}`).toString('base64');
  const resp = await fetch(`${url}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`SAP OAuth token fetch failed: ${resp.status}`);
  return (await resp.json()).access_token;
}

async function _keyFromCredentialStore(binding) {
  const { url, username, password, namespace = 'sketch-to-sap-btp' } = binding.credentials || {};
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const resp = await fetch(
    `${url}/api/v1/credentials/password/anthropic-api-key?name=anthropic-api-key&namespace=${namespace}`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!resp.ok) throw new Error(`Credential Store fetch failed: ${resp.status}`);
  return (await resp.json()).value;
}

module.exports = { getClient, VISION_MODEL, VALIDATOR_MODEL, DEMO_MODE };
