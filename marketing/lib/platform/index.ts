/**
 * Platform abstraction layer
 *
 * Provides a unified API for platform-specific features (router, link,
 * route params) that works across both Next.js and Vite SPA environments.
 *
 * The default export uses Next.js implementations.
 * For Vite SPA builds, the alias in vite.spa.config.ts redirects
 * imports to the SPA implementation.
 */
export {
  LinkWrapper,
  useAppRouter,
  useNavigationBlocker,
  usePathParam,
  usePathParams,
  useRequiredPathParam,
  useSearchParam,
} from "./next";
export type { AppRouter } from "./types";
