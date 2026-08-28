// Cloudflare Pages discovers Functions only from the repository-root /functions tree.
// Keep the production handler authoritative in public/edge-functions so EdgeOne and
// Pages execute exactly the same router implementation.
import handler from '../../public/edge-functions/aio/open.js';

// Pages Functions route by named onRequest exports; EdgeOne consumes the default.
export const onRequest = handler;
