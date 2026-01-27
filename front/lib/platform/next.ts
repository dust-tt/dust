/**
 * Next.js platform implementation
 * Used when running in Next.js environment
 */
import NextHead from "next/head";
import {
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import { useRouter as useNextRouter } from "next/router";
import NextScript from "next/script";

import { NextLinkWrapper } from "./NextLinkWrapper";
import type { AppRouter, HeadProps, ScriptProps } from "./types";

export function useAppRouter(): AppRouter {
  const router = useNextRouter();
  return {
    push: router.push,
    replace: router.replace,
    back: router.back,
    reload: router.reload,
    pathname: router.pathname,
    asPath: router.asPath,
    query: router.query as Record<string, string | string[] | undefined>,
    isReady: router.isReady,
    events: router.events,
    beforePopState: router.beforePopState,
  };
}

export const LinkWrapper = NextLinkWrapper;

export function Head({ children }: HeadProps) {
  return NextHead({ children });
}

export function Script({ id, src, strategy, children }: ScriptProps) {
  return NextScript({ id, src, strategy, children });
}

/**
 * Hook to get route params in Next.js
 * Returns route parameters from the URL (e.g., [wId], [aId])
 */
export function usePathParams(): Record<string, string | undefined> {
  const params = useNextParams();
  if (!params) {
    return {};
  }
  // Convert to Record<string, string | undefined>
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = Array.isArray(value) ? value[0] : (value ?? undefined);
  }
  return result;
}

/**
 * Hook to get a required route param
 * Throws an error if the param is missing
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
 * Hook to get a search/query param in Next.js
 * Returns the value of the specified query parameter or null
 */
export function useSearchParam(name: string): string | null {
  const searchParams = useNextSearchParams();
  return searchParams?.get(name) ?? null;
}

export type { AppRouter, HeadProps, ScriptProps };
