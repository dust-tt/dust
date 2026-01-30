import type { ReactNode } from "react";

/**
 * Router event types
 */
export type RouterEventType =
  | "routeChangeStart"
  | "routeChangeComplete"
  | "routeChangeError"
  | "hashChangeComplete";

/**
 * Router events interface - matches Next.js router events
 */
export interface RouterEvents {
  on: (event: RouterEventType, handler: (url: string) => void) => void;
  off: (event: RouterEventType, handler: (url: string) => void) => void;
  emit: (event: RouterEventType, ...args: unknown[]) => void;
}

/**
 * Transition options for router navigation
 */
export interface TransitionOptions {
  shallow?: boolean;
  locale?: string | false;
  scroll?: boolean;
}

/**
 * URL object for router navigation
 */
export interface UrlObject {
  pathname?: string;
  query?: Record<string, string | string[] | undefined>;
  hash?: string;
}

/**
 * Router abstraction interface
 * Wraps Next.js router and React Router
 */
export interface AppRouter {
  push: (
    url: string | UrlObject,
    as?: string,
    options?: TransitionOptions
  ) => Promise<boolean>;
  replace: (
    url: string | UrlObject,
    as?: string,
    options?: TransitionOptions
  ) => Promise<boolean>;
  back: () => void;
  reload: () => void;
  /**
   * The route pattern with dynamic segments (e.g., "/w/[wId]/conversation/[cId]")
   */
  pathname: string;
  /**
   * The actual URL path including query string (e.g., "/w/abc123/conversation/xyz?foo=bar")
   */
  asPath: string;
  query: Record<string, string | string[] | undefined>;
  isReady: boolean;
  events: RouterEvents;
  beforePopState: (
    cb: (state: { url: string; as: string; options: unknown }) => boolean
  ) => void;
}

/**
 * Props for the Head component abstraction
 */
export interface HeadProps {
  children: ReactNode;
}

/**
 * Props for the Script component abstraction
 */
export interface ScriptProps {
  id?: string;
  src?: string;
  strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload";
  children?: string;
}

export interface ImageProps
  extends Omit<
    React.ImgHTMLAttributes<HTMLImageElement>,
    "width" | "height" | "src" | "alt"
  > {
  width?: number | `${number}` | undefined;
  height?: number | `${number}` | undefined;
  src: string;
  alt: string;
  priority?: boolean | undefined;
  sizes?: string;
}
