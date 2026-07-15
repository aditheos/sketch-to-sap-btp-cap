# Contributing to Sketch to SAP BTP

Thank you for contributing. This document covers the two most common contribution types.

## Adding a missing SAP service (most impactful)

The service catalog (`data/sap_service_catalog.json`) is where most contributions land. If a BTP service renders as an unknown grey box, the fix is a catalog entry.

### Entry structure

```json
{
  "id": "sap-my-service",
  "name": "SAP My Service",
  "category": "Integration",
  "aliases": ["My Service", "MSS"],
  "icon_id": "12345-sap-my-service_sd",
  "render_zone": "integration",
  "drawio": {
    "fillColor": "#FFFFFF",
    "strokeColor": "#0070F2",
    "fontColor": "#000000",
    "shape": "image;image=img/lib/sap/..."
  },
  "cap": {
    "service_type": "odata",
    "entity_type": "Service"
  },
  "bpmn": {
    "task_type": "serviceTask"
  }
}
```

**Valid categories:** `Data & Storage`, `Integration`, `Process & Automation`, `Identity & Security`, `AI`, `Connectivity`, `Analytics`, `Mobile`, `Development`, `External Systems`, `Actors & External`

**Finding the icon_id:** Search `data/sap_icon_index.json` for the service name. The key is the `icon_id` value to use.

### Validate before submitting

```bash
node scripts/validate-catalog.js
```

CI runs this automatically on every PR. Fix all errors; warnings (missing icon_id) are allowed but discouraged.

## Reporting a bug or requesting a feature

Use the issue templates — they ask the right questions upfront and speed up resolution.

## Local development

```bash
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env

npm install
npm run dev   # → http://localhost:4004
```

## Pull request process

1. Fork the repository
2. Create a branch: `git checkout -b catalog/sap-my-service` or `fix/layout-bug`
3. Make your change and validate: `node scripts/validate-catalog.js`
4. Open a PR against `main` — fill in the PR template
5. CI must pass before review
6. The Aditheos team reviews and merges

We aim to review catalog PRs within a few days. Code changes may take longer depending on complexity.

## License

By contributing, you agree your contributions are licensed under Apache 2.0.
