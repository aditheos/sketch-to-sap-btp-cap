declare module '@sap/cds' {
  import type { Application } from 'express';

  interface CDS {
    on(event: 'bootstrap', handler: (app: Application) => void): void;
    server: unknown;
  }

  const cds: CDS;
  export default cds;
  export = cds;
}
