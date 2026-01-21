/**
 * Next.js platform implementation
 * Used when running in Next.js environment
 */
import NextHead from "next/head";
import { useRouter as useNextRouter } from "next/router";
import NextScript from "next/script";

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

export function Head({ children }: HeadProps) {
  return NextHead({ children });
}

export function Script({ id, src, strategy, children }: ScriptProps) {
  return NextScript({ id, src, strategy, children });
}

export type { AppRouter, HeadProps, ScriptProps };
