namespace aditheos.sketch;

// All HTTP endpoints are registered as custom express routes in server.js via cds.on('bootstrap').
// This CDS definition provides the CAP service namespace for mta build integration.
@path: '/api'
service SketchService {
    // Custom endpoints: POST /convert, /convert-mermaid, /validate-only, /validate-mermaid
    // GET /health
}
