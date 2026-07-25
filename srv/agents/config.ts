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

interface AicoreConfig {
  baseUrl: string;
  token: string;
  resourceGroup: string;
  deploymentIds: Record<string, string>;
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

    if (vcap.aicore?.[0])              return _sapAiCoreClient(vcap.aicore[0].credentials);
    if (vcap['credential-store']?.[0]) {
      const apiKey = await _keyFromCredentialStore(vcap['credential-store'][0].credentials);
      return new Anthropic({ apiKey });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(
    'No API key found. Set ANTHROPIC_API_KEY in .env or bind an SAP Credential Store / AI Core service.'
  );
  return new Anthropic({ apiKey });
}

async function _sapAiCoreClient(creds: AicoreCredentials): Promise<Anthropic> {
  const baseUrl = (creds.serviceurls?.AI_API_URL ?? '').replace(/\/$/, '');
  const token   = await _fetchOAuthToken(creds);

  const resourceGroup        = process.env.AI_RESOURCE_GROUP       ?? 'default';
  const visionDeploymentId   = process.env.VISION_DEPLOYMENT_ID    ?? '';
  const validatorDeploymentId = process.env.VALIDATOR_DEPLOYMENT_ID ?? '';

  if (!visionDeploymentId || !validatorDeploymentId) throw new Error(
    'AI Core binding detected but VISION_DEPLOYMENT_ID and/or VALIDATOR_DEPLOYMENT_ID ' +
    'are not set. Both are required — set them via cf set-env or in your .env file.'
  );

  const config: AicoreConfig = {
    baseUrl,
    token,
    resourceGroup,
    deploymentIds: {
      [VISION_MODEL]:    visionDeploymentId,
      [VALIDATOR_MODEL]: validatorDeploymentId,
    },
  };

  return new Anthropic({
    apiKey: 'aicore',           // placeholder — replaced by fetch override below
    fetch: _makeAiCoreFetch(config),
  });
}

function _makeAiCoreFetch(cfg: AicoreConfig) {
  return async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestBody = init?.body ? JSON.parse(init.body as string) : {};
    const { model, ...bodyWithoutModel } = requestBody as { model?: string; [k: string]: unknown };

    const deploymentId = model ? cfg.deploymentIds[model] : undefined;
    if (!deploymentId) throw new Error(
      `No AI Core deployment ID configured for model "${model ?? '(none)'}". ` +
      `Check VISION_DEPLOYMENT_ID and VALIDATOR_DEPLOYMENT_ID.`
    );

    const aicoreUrl = `${cfg.baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;

    // AI Core Claude deployments use Bedrock-compatible request format:
    // no 'model' field (the deployment pins it), plus anthropic_version marker.
    const transformedBody = { anthropic_version: 'bedrock-2023-05-31', ...bodyWithoutModel };

    const headers = new Headers(init?.headers as HeadersInit);
    headers.delete('x-api-key');
    headers.delete('content-length'); // body size changes after transform; let runtime recalculate
    headers.set('Authorization',    `Bearer ${cfg.token}`);
    headers.set('AI-Resource-Group', cfg.resourceGroup);
    headers.set('Content-Type',      'application/json');

    return fetch(aicoreUrl, { method: 'POST', headers, body: JSON.stringify(transformedBody) });
  };
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
