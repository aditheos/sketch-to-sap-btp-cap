# Sketch to SAP BTP

Convert a hand-drawn whiteboard sketch or a Mermaid diagram into an official **SAP BTP Solution Diagram** (`.drawio`) in seconds.

Built with SAP Cloud Application Programming Model (CAP) and Claude AI.

[![Demo video](https://img.shields.io/badge/YouTube-Demo-red?logo=youtube)](https://youtu.be/eDKe8JjrcSA) [![Short](https://img.shields.io/badge/YouTube-Short-red?logo=youtube)](https://youtube.com/shorts/B6eQHePv34I) [![SAP Blog](https://img.shields.io/badge/SAP%20Community-Blog%20Post-blue?logo=sap)](https://community.sap.com/t5/sap-cap-blog-posts/from-whiteboard-to-sap-btp-building-an-open-source-ai-architecture-diagram/ba-p/14440736)

---

## What it does

Upload a photo of your architecture sketch, or paste a Mermaid `flowchart` definition. The tool:

1. **Identifies** every component and connection using Claude vision (for sketches) or a built-in parser (for Mermaid)
2. **Maps** each component to the official SAP BTP service catalog — exact match, alias, or type-based fallback
3. **Reviews** the architecture against SAP BTP best practices using Claude Haiku
4. **Generates** a `.drawio` file with proper SAP icons, boundary zones, and connector styles — ready to open in draw.io or diagrams.net

## Supported input

| Input | Format |
|---|---|
| Whiteboard photo | PNG, JPEG, WebP, GIF (max 10 MB) |
| Mermaid diagram | `flowchart LR`, `graph TD`, all directions |

Mermaid syntax supported: `-->`, `-->|label|`, `-.->`, `==>`, chained edges (`A --> B --> C`), cylinder shape `[(label)]` for databases, YAML front-matter and `%% title:` for diagram titles.

## Architecture

```
server.js                  ← CAP bootstrap + express routes
srv/
  sketch-service.cds       ← CDS service namespace
  agents/
    config.js              ← API key resolution: AI Core → Credential Store → .env
    vision.js              ← Claude vision agent (tool_use, structured output)
    mermaid-parser.js      ← Mermaid → architecture sketch (no LLM)
    mapper.js              ← Deterministic SAP service catalog lookup
    validator.js           ← Claude Haiku architecture review
    drawio.js              ← .drawio XML generator (SAP icon styles)
data/
  sap_service_catalog.json ← Official SAP BTP service catalog with draw.io metadata
  sap_icon_index.json      ← SAP BTP icon library (base64 SVG)
app/
  index.html               ← Fiori UI (SAP UI5 Web Components)
```

No database required. The service catalog and icon library are bundled with the deployment.

## Self-hosting on SAP BTP

This tool is designed to be **deployed to your own SAP BTP subaccount**. You bring your own Anthropic API key — Aditheos has zero visibility into your usage or API costs.

### Prerequisites

- SAP BTP subaccount with Cloud Foundry environment enabled
- CF CLI and MBT build tool installed
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- Node.js 20+

### Deploy

```bash
# Clone the repo
git clone https://github.com/aditheos/sketch-to-sap-btp-cap.git
cd sketch-to-sap-btp-cap

# Install dependencies
npm install

# Build and deploy to BTP CF
npm run build
cf login -a <your-api-endpoint>
cf target -o <your-org> -s <your-space>
cf deploy sketch-to-sap-btp_*.mtar

# Set your Anthropic API key
cf set-env sketch-to-sap-btp-srv ANTHROPIC_API_KEY sk-ant-...
cf restage sketch-to-sap-btp-srv
```

The app will be available at the CF-assigned URL. No additional services required for the basic deployment.

### Local development

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

npm install
npm run dev        # cds watch — hot reload at http://localhost:4004
```

## API key resolution

The app resolves the Anthropic API key in this priority order:

| Source | When used |
|---|---|
| SAP AI Core binding (`VCAP_SERVICES.aicore`) | SAP GenAI Hub integration |
| BTP Credential Store binding (`VCAP_SERVICES.credential-store`) | Recommended for production |
| `ANTHROPIC_API_KEY` environment variable | Local dev and quick BTP deployments |

## Model usage and cost

| Step | Model | Approx. cost per run |
|---|---|---|
| Sketch analysis | `claude-sonnet-4-6` | ~$0.013 |
| Architecture review | `claude-haiku-4-5` | ~$0.003 |
| Mermaid parsing | _(no LLM)_ | $0 |

Cost is charged to your own Anthropic account. Aditheos incurs no API costs.

## API response headers

`POST /convert` and `POST /convert-mermaid` return the `.drawio` file body plus these headers from the validator:

| Header | Content |
|---|---|
| `X-Validation-Summary` | One-sentence overall assessment |
| `X-Warning-Count` | Number of warnings (integer) |
| `X-Missing-Services` | Comma-separated list of suggested missing services |

Use `POST /validate-only` (image) or `POST /validate-mermaid` (text) to get validation results as JSON without generating a diagram.

## Contributing

Pull requests welcome. The service catalog (`data/sap_service_catalog.json`) is the most impactful place to contribute — adding new SAP services, aliases, and draw.io style metadata improves mapping accuracy for everyone.

## License

Apache 2.0 — Copyright 2026 [Aditheos](https://aditheos.com)
