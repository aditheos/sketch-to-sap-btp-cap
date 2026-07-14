# ADR-0001: Release as Apache 2.0 Open Source Instead of Commercial SaaS

**Status:** Accepted  
**Date:** 2026-07-14  
**Deciders:** Aditheos Team

---

## Context

Sketch-to-SAP-BTP is a tool that converts hand-drawn architecture sketches and Mermaid diagrams into SAP BTP Solution Diagrams in draw.io format, using Claude Vision via the Anthropic API. It is built on SAP BTP using the Cloud Application Programming Model (CAP), with IAS authentication and HANA Cloud persistence.

During the POC phase, the team evaluated two paths: commercialise as a SaaS product, or release as an open source community tool under Apache 2.0.

### Structural barriers to commercialisation identified

**BYO-Key deployment model:** Users deploy this to their own BTP subaccounts using their own Anthropic API keys. Gating functionality behind a paywall would require a licensing server, breaking the clean standalone architecture and introducing infrastructure overhead with no corresponding user benefit.

**Security and compliance:** Enterprise SAP architects handle sensitive network topology and system landscape data. Deploying to a private BTP space is acceptable to corporate legal and security teams; uploading diagrams to an external SaaS is frequently not, due to data residency and privacy policy constraints. This blocks the primary target audience.

**Niche audience size:** The addressable market — SAP BTP architects who draw architecture sketches and need draw.io output — is highly valuable but numerically small. This is a feature, not a platform. SaaS revenue ceiling is low relative to the overhead of operating a multi-tenant service.

**AI commoditisation:** The implementation barrier for a similar tool is now low. SAP is investing in AI capabilities within BAS and BTP Cockpit. A commercial moat based on the diagram conversion feature alone is unlikely to hold over a 2–3 year horizon.

### Opportunity cost of closed-source approach

The tool's real value to Aditheos is not subscription revenue but **consulting lead generation**. Enterprise clients spend significant budget on SAP BTP architecture reviews, CAP implementations, and AI Core integrations. A functional, well-documented open source tool that surfaces Aditheos expertise is a more efficient path to those engagements than a SaaS paywall.

---

## Decision

Release Sketch-to-SAP-BTP under the **Apache 2.0 license** as an open source community tool, with Aditheos branding in the UI and README.

The hosted POC environment (CF on eu10-005) will be decommissioned or simplified. The repository will be structured for self-hosted deployment on any BTP subaccount with a user-supplied Anthropic API key.

---

## Consequences

### Positive

- **No infrastructure overhead.** No multi-tenant auth, billing, trial management, or API cost absorption. Users bring their own keys.
- **Enterprise adoption unblocked.** Self-hosted deployment satisfies corporate security and data residency requirements that would block a SaaS.
- **Community-maintained service catalog.** `sap_service_catalog.json` and `sap_icon_index.json` can receive pull requests from the SAP community as SAP adds and renames services, reducing ongoing maintenance burden.
- **SAP Community credibility.** A clean CAP + Claude Vision implementation published with a technical blog post on SAP Community builds authority in the BTP and AI Core space.
- **Consulting Trojan horse.** An architect demos the tool internally, it works, your brand is in the footer. When they need BTP implementation work, Aditheos is the first call.
- **Portfolio evidence of CAP and AI integration expertise.** The repository serves as a concrete demonstration of proper BTP credential resolution, Claude Vision tool calling, and draw.io XML generation — relevant to the services Aditheos offers.

### Negative

- **No direct revenue from the tool.** There is no subscription, usage fee, or license revenue.
- **Competitors can fork and build on it.** Apache 2.0 allows commercial use. A third party could build a hosted service on top of this codebase.
- **Maintenance obligation.** Publishing creates an implicit community expectation of responsiveness to issues and pull requests.

### Neutral

- The IAS authentication, approuter, and per-user HANA storage implemented during the POC are not needed in the open source version and will be removed to simplify deployment.
- If a revenue stream is desired later, the appropriate model is **consulting engagements** ("Aditheos builds a custom SAP landscape template pack for your organisation") rather than a packaged prompt add-on product.

---

## Alternatives Considered

**Commercial SaaS with hosted API keys:** Rejected. Security and compliance barriers block enterprise adoption. API cost absorption at scale is operationally significant.

**Freemium with Enterprise Blueprint Pack (paid prompt templates):** Rejected. The advanced templates are the primary value that drives the consulting Trojan horse effect. Putting them behind a paywall reduces tool adoption, which kills the lead funnel. The same templates are better positioned as consulting deliverables.

**Remain closed-source / internal POC only:** Rejected. Provides no community or brand benefit and leaves the POC investment with no return.
