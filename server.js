'use strict';

// Shim: register ts-node so CDS can load server.ts without needing cds-ts CLI.
require('ts-node').register({
  project: `${__dirname}/tsconfig.json`,
  transpileOnly: true,
  compilerOptions: { module: 'CommonJS', moduleResolution: 'node' },
});
require('./server.ts'); // side-effect: registers cds.on('bootstrap', ...)

const cds = require('@sap/cds');
module.exports = cds.server;
