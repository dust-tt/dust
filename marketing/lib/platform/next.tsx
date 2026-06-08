// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
/**
 * Platform implementation
 *
 * Router, Link, and route param hooks use Next.js APIs (needed by
 * components shared between Next pages and SPA).
 *
 * For the Vite SPA build, the alias in vite.spa.config.ts redirects
 * imports to the SPA implementation (React Router based).
 */
import {
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import { useRouter as useNextRouter } from "next/router";
import { useMemo } from "react";

import { NextLinkWrapper } from "./NextLinkWrapper";
import type { AppRouter } from "./types";

export function useAppRouter(): AppRouter {
  const router = useNextRouter();
  return useMemo(
    () => ({
      push: router.push,
      replace: router.replace,
      back: router.back,
      reload: router.reload,
      pathname: router.pathname,
      asPath: router.asPath,
      query: router.query as Record<string, string | string[] | undefined>,
      isReady: router.isReady,
      events: router.events,
    }),
    [router]
  );
}

export const LinkWrapper = NextLinkWrapper;

/**
 * Hook to get route params in Next.js.
 * Returns route parameters from the URL (e.g., [wId], [aId]).
 */
export function usePathParams(): Record<string, string | undefined> {
  const params = useNextParams();
  if (!params) {
    return {};
  }
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = Array.isArray(value) ? value[0] : (value ?? undefined);
  }
  return result;
}

/**
 * Hook to get a single route param.
 */
export function usePathParam(name: string): string | null {
  const params = usePathParams();
  const value = params[name];
  return value ?? null;
}

/**
 * Hook to get a required route param.
 * Throws an error if the param is missing.
 */
export function useRequiredPathParam(name: string): string {
  const params = usePathParams();
  const value = params[name];
  if (!value) {
    throw new Error(`Required route parameter "${name}" is missing`);
  }
  return value;
}

/**
 * Hook to get a search/query param in Next.js.
 */
export function useSearchParam(name: string): string | null {
  const searchParams = useNextSearchParams();
  return searchParams?.get(name) ?? null;
}

/**
 * Navigation blocker - noop in Next.js.
 * In Next.js, navigation blocking is handled via routeChangeStart events
 * in useNavigationLock. This hook is only active in the SPA (React Router).
 */
export function useNavigationBlocker(
  _shouldBlock: boolean,
  _onBlock: () => Promise<boolean>
) {
  // Noop - Next.js uses routeChangeStart events for navigation blocking.
}

export type { AppRouter };
