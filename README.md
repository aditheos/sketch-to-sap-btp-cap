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
    config.ts              ← API key resolution: AI Core → Credential Store → .env
    vision.ts              ← Claude vision agent (tool_use, structured output)
    mermaid-parser.ts      ← Mermaid → architecture sketch (no LLM)
    mapper.ts              ← Deterministic SAP service catalog lookup
    validator.ts           ← Claude Haiku architecture review
    drawio.ts              ← .drawio XML generator (SAP icon styles)
data/
  sap_service_catalog.json ← Official SAP BTP service catalog with draw.io metadata
  sap_icon_index.json      ← SAP BTP icon library (base64 SVG)
app/
  index.html               ← Fiori UI (SAP UI5 Web Components)
```

No database required. The service catalog and icon library are bundled with the deployment.

## Self-hosting on SAP BTP

This tool is designed to be **deployed to your own SAP BTP subaccount**. You bring your own API credentials — Aditheos has zero visibility into your usage or costs.

### Prerequisites

- SAP BTP subaccount with Cloud Foundry environment enabled
- CF CLI and MBT build tool installed
- Node.js 20+
- An Anthropic API key **or** SAP AI Core with Claude deployments

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
```

Then configure your API credentials — choose one of the options below.

### Local development

```bash
cp .env.example .env
# Edit .env — see .env.example for all options

npm install
cds watch          # hot reload at http://localhost:4004
```

---

## API credential options

The app resolves credentials in this priority order:

| Priority | Source | When used |
|---|---|---|
| 1 | SAP AI Core service binding | SAP GenAI Hub — no Anthropic account needed |
| 2 | BTP Credential Store binding | Recommended for direct Anthropic key in production |
| 3 | `ANTHROPIC_API_KEY` env var | Local dev and quick BTP deployments |

### Option A — Direct Anthropic API key

**Via BTP Cockpit:**
1. Cloud Foundry → Spaces → your space
2. Click **sketch-to-sap-btp-srv** → **User-Provided Variables** tab
3. Add `ANTHROPIC_API_KEY` → `sk-ant-...` → **Save**
4. Click **Restart** on the application overview page

**Via CF CLI:**
```bash
cf set-env sketch-to-sap-btp-srv ANTHROPIC_API_KEY sk-ant-...
cf restage sketch-to-sap-btp-srv
```

### Option B — SAP AI Core (SAP GenAI Hub)

Use this if your organisation accesses Claude through SAP's Generative AI Hub rather than a direct Anthropic account.

**Step 1 — Deploy Claude models in AI Launchpad**

In SAP AI Launchpad → GenAI Hub → Models, deploy:
- **Claude Sonnet** (for sketch analysis) — note the Deployment ID
- **Claude Haiku** (for architecture review) — note the Deployment ID

**Step 2 — Bind the AI Core service**

In BTP Cockpit:
1. Cloud Foundry → Spaces → your space
2. Click **sketch-to-sap-btp-srv** → **Service Bindings** tab
3. Click **Bind Service** → select your AI Core service instance → **Save**
4. Click **Restart** on the application overview page

**Step 3 — Set deployment IDs**

**Via BTP Cockpit:**
1. Cloud Foundry → Spaces → your space
2. Click **sketch-to-sap-btp-srv** → **User-Provided Variables** tab
3. Add the following variables → **Save** → **Restart**

| Variable | Value |
|---|---|
| `VISION_DEPLOYMENT_ID` | Deployment ID of your Claude Sonnet deployment |
| `VALIDATOR_DEPLOYMENT_ID` | Deployment ID of your Claude Haiku deployment |
| `AI_RESOURCE_GROUP` | Your resource group name (usually `default`) |

**Via CF CLI:**
```bash
cf set-env sketch-to-sap-btp-srv VISION_DEPLOYMENT_ID <sonnet-deployment-id>
cf set-env sketch-to-sap-btp-srv VALIDATOR_DEPLOYMENT_ID <haiku-deployment-id>
cf set-env sketch-to-sap-btp-srv AI_RESOURCE_GROUP default
cf restage sketch-to-sap-btp-srv
```

**Via CF CLI — bind service:**
```bash
cf bind-service sketch-to-sap-btp-srv <aicore-instance-name>
cf restage sketch-to-sap-btp-srv
```

> **Hybrid local testing:** run `cds bind --to <aicore-instance>` to pull AI Core credentials into `default-env.json`, then `cds watch --profile hybrid`. Set the three variables above in your `.env` file.

---

## Model usage and cost

| Step | Model | Approx. cost per run |
|---|---|---|
| Sketch analysis | `claude-sonnet-4-6` | ~$0.013 |
| Architecture review | `claude-haiku-4-5` | ~$0.003 |
| Mermaid parsing | _(no LLM)_ | $0 |

Cost is charged to your own Anthropic account or SAP AI Core quota. Aditheos incurs no API costs.

Optional model overrides (direct Anthropic path only):

```bash
VISION_MODEL=claude-sonnet-4-6
VALIDATOR_MODEL=claude-haiku-4-5
```

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
