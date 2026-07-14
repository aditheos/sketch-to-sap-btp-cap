'use strict';

const { getClient, VALIDATOR_MODEL } = require('./config');

const SYSTEM_PROMPT = `You are a senior SAP BTP solution architect reviewing an architecture diagram.
Your job is to identify practical issues — missing security services, anti-patterns,
or obvious gaps — so the architect can address them.

Be concise and actionable. Do not repeat what is already correct.`;

const REVIEW_TOOL = {
  name: 'record_review',
  description: 'Record findings from the architecture review',
  input_schema: {
    type: 'object',
    properties: {
      warnings: {
        type: 'array',
        description: 'Issues that should be addressed before production',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            message: { type: 'string' },
            suggestion: { type: 'string' },
          },
          required: ['severity', 'message', 'suggestion'],
        },
      },
      missing_services: {
        type: 'array',
        description: 'SAP BTP services that are typically required but absent from this architecture',
        items: { type: 'string' },
      },
      summary: {
        type: 'string',
        description: 'One sentence overall assessment',
      },
    },
    required: ['warnings', 'missing_services', 'summary'],
  },
};

async function validateArchitecture(architecture) {
  const client = await getClient();

  const componentsText = architecture.components
    .map(c => `- ${c.label} → ${c.sapServiceName} [${c.category}] (match: ${c.confidence})`)
    .join('\n');

  const connectionsText = architecture.connections.length
    ? architecture.connections
        .map(conn => `- ${conn.fromId} → ${conn.toId}${conn.label ? ` (${conn.label})` : ''}`)
        .join('\n')
    : 'No connections identified';

  const architectureDescription =
    `Architecture: ${architecture.title}\n\n` +
    `Components (${architecture.components.length}):\n${componentsText}\n\n` +
    `Connections:\n${connectionsText}`;

  const response = await client.messages.create({
    model: VALIDATOR_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [REVIEW_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content:
          `Review this SAP BTP architecture and identify any issues:\n\n` +
          `${architectureDescription}\n\n` +
          'Focus on: missing auth/identity services, missing integration layers, ' +
          'direct database access from UI, missing event handling for async flows.',
      },
    ],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock) return { warnings: [], missingServices: [], summary: 'Validator returned no findings.' };

  const data = toolBlock.input;
  return {
    warnings: (data.warnings || []).map(w => ({
      severity: w.severity,
      message: w.message,
      suggestion: w.suggestion,
    })),
    missingServices: data.missing_services || [],
    summary: data.summary || '',
  };
}

module.exports = { validateArchitecture };
