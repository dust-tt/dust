/**
 * Platform abstraction layer
 *
 * This module provides a unified API for platform-specific features
 * (router, head management, script loading) that works across both
 * Next.js and Vite SPA environments.
 *
 * The default export uses Next.js implementations.
 * For Vite SPA builds, the alias in vite.spa.config.ts redirects
 * imports to the SPA implementation.
 */
export {
  Head,
  Image,
  LinkWrapper,
  Script,
  useAppRouter,
  useNavigationBlocker,
  usePathParam,
  usePathParams,
  useRequiredPathParam,
  useSearchParam,
} from "./next";
export type { AppRouter, HeadProps, ScriptProps } from "./types";
