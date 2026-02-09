/**
 * SPA platform implementation
 * Used when running in Vite SPA environment (React Router)
 */
import { ReactRouterLinkWrapper } from "@spa/lib/ReactRouterLinkWrapper";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useBlocker,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

import type {
  AppRouter,
  HeadProps,
  ImageProps,
  RouterEvents,
  ScriptProps,
  TransitionOptions,
  UrlObject,
} from "@dust-tt/front/lib/platform/types";

/**
 * Safe wrapper around useNavigate that handles the case where
 * we're not inside a Router context (can happen during production build initialization)
 */
function useSafeNavigate() {
  try {
    return useNavigate();
  } catch {
    return null;
  }
}

/**
 * Safe wrapper around useLocation that handles the case where
 * we're not inside a Router context
 */
function useSafeLocation() {
  try {
    return useLocation();
  } catch {
    return null;
  }
}

/**
 * Safe wrapper around useSearchParam that handles the case where
 * we're not inside a Router context
 */
function useSafeSearchParams() {
  try {
    return useRouterSearchParams();
  } catch {
    return [new URLSearchParams(window.location.search), () => {}] as const;
  }
}

/**
 * Convert URL object to string
 */
function urlToString(url: string | UrlObject): string {
  if (typeof url === "string") {
    return url;
  }
  let result = url.pathname ?? "";
  if (url.query && Object.keys(url.query).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(url.query)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v));
        } else {
          params.append(key, value);
        }
      }
    }
    const queryString = params.toString();
    if (queryString) {
      result += "?" + queryString;
    }
  }
  if (url.hash) {
    result += url.hash;
  }
  return result;
}

/**
 * Global event emitter for router events in SPA
 * This mimics Next.js router events to work with NavigationLoadingContext
 */
type RouterEventCallback = (...args: unknown[]) => void;

const routerEventListeners: Map<string, Set<RouterEventCallback>> = new Map();

function createRouterEvents(): RouterEvents {
  return {
    on: (event: string, callback: RouterEventCallback) => {
      if (!routerEventListeners.has(event)) {
        routerEventListeners.set(event, new Set());
      }
      routerEventListeners.get(event)!.add(callback);
    },
    off: (event: string, callback: RouterEventCallback) => {
      routerEventListeners.get(event)?.delete(callback);
    },
    emit: (event: string, ...args: unknown[]) => {
      routerEventListeners.get(event)?.forEach((callback) => callback(...args));
    },
  };
}

// Singleton events object so all useAppRouter calls share the same listeners
const routerEvents = createRouterEvents();

export function useAppRouter(): AppRouter {
  const navigate = useSafeNavigate();
  const location = useSafeLocation();
  const [searchParams] = useSafeSearchParams();

  // Force re-render when location changes via window (fallback mode)
  const [, setForceUpdate] = useState(0);
  useEffect(() => {
    if (!location) {
      // We're in fallback mode, listen to popstate to update
      const handlePopState = () => setForceUpdate((n) => n + 1);
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, [location]);

  // Emit router events when location changes
  // Track previous location to detect hash-only changes and skip initial mount
  const previousLocationRef = useRef<{
    pathname: string;
    search: string;
    hash: string;
  } | null>(null);

  // Track location for route change events
  useEffect(() => {
    if (location) {
      const currentLocation = {
        pathname: location.pathname,
        search: location.search,
        hash: window.location.hash,
      };

      const previousLocation = previousLocationRef.current;

      // Skip initial mount - don't emit event on first render
      if (previousLocation !== null) {
        // Only emit if pathname or search changed (not hash - that's handled by hashchange listener)
        if (
          previousLocation.pathname !== currentLocation.pathname ||
          previousLocation.search !== currentLocation.search
        ) {
          const fullUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
          queueMicrotask(() => {
            routerEvents.emit("routeChangeComplete", fullUrl);
          });
        }
      }

      previousLocationRef.current = currentLocation;
    }
  }, [location]);

  // Listen for hash changes (React Router doesn't track these)
  useEffect(() => {
    const handleHashChange = () => {
      const fullUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      routerEvents.emit("hashChangeComplete", fullUrl);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const push = useCallback(
    async (
      url: string | UrlObject,
      _as?: string,
      _options?: TransitionOptions
    ) => {
      const urlString = urlToString(url);
      if (
        navigate &&
        !urlString.startsWith("http://") &&
        !urlString.startsWith("https://")
      ) {
        await navigate(urlString);
      } else {
        // Fallback to window.location if not in Router context
        window.location.href = urlString;
      }
      return true;
    },
    [navigate]
  );

  const replace = useCallback(
    async (
      url: string | UrlObject,
      _as?: string,
      _options?: TransitionOptions
    ) => {
      const urlString = urlToString(url);
      if (
        navigate &&
        !urlString.startsWith("http://") &&
        !urlString.startsWith("https://")
      ) {
        await navigate(urlString, { replace: true });
      } else {
        // Fallback to window.location if not in Router context
        window.location.replace(urlString);
      }
      return true;
    },
    [navigate]
  );

  const back = useCallback(async () => {
    if (navigate) {
      await navigate(-1);
    } else {
      window.history.back();
    }
  }, [navigate]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  const query = useMemo(() => {
    const result: Record<string, string | string[] | undefined> = {};
    searchParams.forEach((value: string, key: string) => {
      const existing = result[key];
      if (existing !== undefined) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          result[key] = [existing, value];
        }
      } else {
        result[key] = value;
      }
    });
    return result;
  }, [searchParams]);

  const pathname = location?.pathname ?? window.location.pathname;
  const search = location?.search ?? window.location.search;
  // React Router doesn't track hash - always use window.location.hash
  const hash = window.location.hash;

  // In SPA mode, router is always ready (no SSR hydration needed)
  const isReady = true;

  return {
    push,
    replace,
    back,
    reload,
    pathname,
    asPath: pathname + search + hash,
    query,
    isReady,
    events: routerEvents,
    // beforePopState is a noop in SPA mode (not supported in React Router)
    // TODO: Check usage in AppContentLayout and remove it.
    beforePopState: () => {},
  };
}

/**
 * Head component for SPA - manages document head elements
 * This is a simplified implementation that extracts title and link elements
 */
export function Head({ children }: HeadProps) {
  useEffect(() => {
    const cleanupFns: (() => void)[] = [];

    Children.forEach(children, (child) => {
      if (!isValidElement(child)) {
        return;
      }

      const props = child.props as Record<string, unknown>;

      if (child.type === "title") {
        const previousTitle = document.title;
        document.title = Children.toArray(props.children).join("") ?? "";
        cleanupFns.push(() => {
          document.title = previousTitle;
        });
      } else if (child.type === "link") {
        const link = document.createElement("link");
        Object.entries(props).forEach(([key, value]) => {
          if (key !== "children" && value !== undefined) {
            link.setAttribute(key, String(value));
          }
        });
        document.head.appendChild(link);
        cleanupFns.push(() => {
          document.head.removeChild(link);
        });
      } else if (child.type === "meta") {
        const meta = document.createElement("meta");
        Object.entries(props).forEach(([key, value]) => {
          if (key !== "children" && value !== undefined) {
            meta.setAttribute(key, String(value));
          }
        });
        document.head.appendChild(meta);
        cleanupFns.push(() => {
          document.head.removeChild(meta);
        });
      }
    });

    return () => {
      cleanupFns.forEach((fn) => fn());
    };
  }, [children]);

  return null;
}

/**
 * Script component for SPA - loads external scripts
 */
export function Script({ id, src, children }: ScriptProps) {
  useEffect(() => {
    const script = document.createElement("script");

    if (id) {
      script.id = id;
    }

    if (src) {
      script.src = src;
      script.async = true;
    } else if (children) {
      script.textContent = children;
    }

    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [id, src, children]);

  return null;
}

export const LinkWrapper = ReactRouterLinkWrapper;

/**
 * Image component for SPA - renders a standard img element
 * In Next.js this uses next/image for optimization, but in SPA we use a regular img
 */
export function Image({
  width,
  height,
  src,
  alt,
  className,
  sizes,
  priority: _priority,
  ...rest
}: ImageProps) {
  return (
    <img
      width={width}
      height={height}
      src={src}
      alt={alt}
      className={className}
      sizes={sizes}
      {...rest}
    />
  );
}

/**
 * Hook to get page context (auth data) in SPA
 * Uses React Router's outlet context
 */
export function usePageContext<T>(): T | null {
  try {
    return useOutletContext<T>();
  } catch {
    return null;
  }
}

/**
 * Hook to get route params in SPA
 * Returns route parameters from the URL (e.g., :wId, :aId)
 */
export function usePathParams(): Record<string, string | undefined> {
  try {
    return useRouterParams();
  } catch {
    return {};
  }
}

/**
 * Hook to get a required route param
 * Throws an error if the param is missing
 */
export function usePathParam(name: string): string | null {
  const params = usePathParams();
  const value = params[name];
  return value ?? null;
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
 * Hook to get a search/query param in SPA
 * Returns the value of the specified query parameter or null
 */
export function useSearchParam(name: string): string | null {
  const [searchParams] = useSafeSearchParams();
  return searchParams.get(name);
}

/**
 * Navigation blocker for SPA using React Router's useBlocker.
 * Intercepts ALL navigation (browser back/forward, links, programmatic)
 * and calls onBlock to determine whether to proceed or cancel.
 */
export function useNavigationBlocker(
  shouldBlock: boolean,
  onBlock: () => Promise<boolean>
) {
  const blocker = useBlocker(shouldBlock);

  // Use a ref for onBlock to avoid re-triggering the blocked effect when the
  // callback reference changes. Only update the ref inside an effect.
  const onBlockRef = useRef(onBlock);
  useEffect(() => {
    onBlockRef.current = onBlock;
  }, [onBlock]);

  useEffect(() => {
    if (blocker.state === "blocked") {
      void onBlockRef.current().then((proceed) => {
        if (proceed) {
          blocker.proceed?.();
        } else {
          blocker.reset?.();
        }
      });
    }
  }, [blocker]);
}

export type { AppRouter, HeadProps, ImageProps, ScriptProps };
