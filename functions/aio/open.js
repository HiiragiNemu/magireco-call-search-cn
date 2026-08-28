// Cloudflare Pages discovers Functions only from the repository-root /functions tree.
// Keep the production handler authoritative in public/edge-functions so EdgeOne and
// Pages execute exactly the same router implementation.
export { default } from '../../public/edge-functions/aio/open.js';
