'use strict';

import Anthropic from '@anthropic-ai/sdk';

export const VISION_MODEL    = process.env.VISION_MODEL    ?? 'claude-sonnet-4-6';
export const VALIDATOR_MODEL = process.env.VALIDATOR_MODEL ?? 'claude-haiku-4-5';
export const DEMO_MODE       = (process.env.DEMO_MODE ?? 'false').toLowerCase() === 'true';

interface AicoreCredentials {
  serviceurls?: { AI_API_URL?: string };
  url: string;
  clientid: string;
  clientsecret: string;
}

interface CredentialStoreCredentials {
  url: string;
  username: string;
  password: string;
  namespace?: string;
}

interface VcapServices {
  aicore?: Array<{ credentials: AicoreCredentials }>;
  'credential-store'?: Array<{ credentials: CredentialStoreCredentials }>;
}

export async function getClient(): Promise<Anthropic> {
  const vcapRaw = process.env.VCAP_SERVICES;
  if (vcapRaw) {
    let vcap: VcapServices = {};
    try { vcap = JSON.parse(vcapRaw) as VcapServices; } catch { /* not valid JSON */ }

    if (vcap.aicore?.[0])             return _sapAiCoreClient(vcap.aicore[0].credentials);
    if (vcap['credential-store']?.[0]) {
      const apiKey = await _keyFromCredentialStore(vcap['credential-store'][0].credentials);
      return new Anthropic({ apiKey });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(
    'No API key found. Set ANTHROPIC_API_KEY in .env or bind an SAP Credential Store service.'
  );
  return new Anthropic({ apiKey });
}

async function _sapAiCoreClient(creds: AicoreCredentials): Promise<Anthropic> {
  const baseUrl = creds.serviceurls?.AI_API_URL ?? '';
  const token   = await _fetchOAuthToken(creds);
  return new Anthropic({ apiKey: token, baseURL: `${baseUrl}/v2/inference/deployments` });
}

async function _fetchOAuthToken(creds: AicoreCredentials): Promise<string> {
  const auth = Buffer.from(`${creds.clientid}:${creds.clientsecret}`).toString('base64');
  const resp = await fetch(`${creds.url}/oauth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!resp.ok) throw new Error(`SAP OAuth token fetch failed: ${resp.status}`);
  const json = await resp.json() as { access_token: string };
  return json.access_token;
}

async function _keyFromCredentialStore(creds: CredentialStoreCredentials): Promise<string> {
  const { url, username, password, namespace = 'sketch-to-sap-btp' } = creds;
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const resp = await fetch(
    `${url}/api/v1/credentials/password/anthropic-api-key?name=anthropic-api-key&namespace=${namespace}`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!resp.ok) throw new Error(`Credential Store fetch failed: ${resp.status}`);
  const json = await resp.json() as { value: string };
  return json.value;
}
