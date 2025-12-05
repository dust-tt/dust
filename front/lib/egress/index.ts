// Re-export client-side fetch (safe to import anywhere).
;

// Re-export server-side fetch helpers. These import undici and server config,
// so they should only be used in server-side code (API routes, etc.).
export {
  getUntrustedEgressAgent,
  trustedFetch,
  untrustedFetch,
} from "./server";
