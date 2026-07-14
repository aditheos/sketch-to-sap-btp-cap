'use strict';

const { getClient, VISION_MODEL } = require('./config');

const SYSTEM_PROMPT = `You are an expert SAP BTP solution architect.
Your task is to analyse an architecture sketch (whiteboard photo, screenshot, or diagram image)
and identify every component and every connection between them.

Be inclusive — capture anything that looks like a system, service, database, UI, or integration.
Use the label text visible in the sketch as the component label.
If a label is unclear, make a reasonable inference based on the shape and context.
Do not invent connections that are not visually indicated.`;

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
