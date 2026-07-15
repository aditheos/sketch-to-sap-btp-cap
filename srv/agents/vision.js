'use strict';

const { getClient, VISION_MODEL } = require('./config');

const SYSTEM_PROMPT = `You are an expert SAP BTP solution architect analysing an architecture sketch.

EXTRACTION RULES — follow strictly:
1. Only extract components that are EXPLICITLY LABELED in the sketch. Do not add services you assume should be present.
2. Use the exact label text visible in the sketch. Do not substitute or enrich with SAP product names unless the label says so.
3. If the same label appears more than once in the sketch, record it ONCE only.
4. Do not invent connections — only record arrows or lines that are visually drawn.
5. Users, browsers, mobile devices, and external applications sitting OUTSIDE the BTP boundary are raw_type "actor".
6. SAP SaaS products outside BTP (S/4HANA, SuccessFactors, Ariba, etc.) are raw_type "erp".
7. Only assign raw_type "ui" to things explicitly labeled as a portal, launchpad, or Work Zone inside BTP.
8. If a label is unclear or ambiguous, use raw_type "unknown" rather than guessing.`;

const EXTRACTION_TOOL = {
  name: 'record_architecture',
  description: 'Record every component and connection identified in the architecture sketch. Call this tool exactly once with all findings.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: "Short title for this architecture (infer from context or use 'SAP BTP Architecture')",
      },
      components: {
        type: 'array',
        description: 'Every distinct system, service, or component visible in the sketch',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique snake_case identifier e.g. comp_1, comp_2' },
            label: { type: 'string', description: 'Exact text label from the sketch, or best inference' },
            raw_type: {
              type: 'string',
              description: "Generic category: database, api_gateway, messaging, workflow, ui, integration, storage, identity, ai, erp, analytics, mobile, connectivity, runtime, or 'unknown'",
            },
            description: { type: 'string', description: 'Optional: any extra context visible for this component' },
          },
          required: ['id', 'label', 'raw_type'],
        },
      },
      connections: {
        type: 'array',
        description: 'Every directed or undirected relationship visible between components',
        items: {
          type: 'object',
          properties: {
            from_id: { type: 'string', description: 'id of the source component' },
            to_id: { type: 'string', description: 'id of the target component' },
            label: { type: 'string', description: "Edge label if visible (e.g. 'reads', 'triggers', 'API call')" },
          },
          required: ['from_id', 'to_id'],
        },
      },
    },
    required: ['title', 'components', 'connections'],
  },
};

async function extractComponents(imageBuffer, mediaType = 'image/png') {
  const client = await getClient();
  const imageB64 = imageBuffer.toString('base64');

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageB64 },
          },
          {
            type: 'text',
            text: 'Analyse this architecture sketch. Extract every component and every connection you can see, then call the record_architecture tool with your findings.',
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock) throw new Error('Vision agent returned no tool_use block — unexpected model response.');

  const data = toolBlock.input;
  return {
    title: data.title || 'SAP BTP Architecture',
    components: (data.components || []).map(c => ({
      id: c.id,
      label: c.label,
      rawType: c.raw_type,
      description: c.description || '',
    })),
    connections: (data.connections || []).map(conn => ({
      fromId: conn.from_id,
      toId: conn.to_id,
      label: conn.label || '',
    })),
  };
}

module.exports = { extractComponents };
