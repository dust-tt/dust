/**
 * Tracking conventions:
 * - Event name: {area}:{object}_{action}
 * - Always include area from TRACKING_AREAS
 * - Use snake_case for object names
 * - Common actions: click, submit, create, delete, connect
 *
 * @example
 * // For simple click tracking:
 * <Button onClick={withTracking(TRACKING_AREAS.EXTENSION, "create_agent")} />
 *
 * @example
 * // For tracking with extra params or non-click actions:
 * trackEvent({
 *   area: TRACKING_AREAS.EXTENSION,
 *   object: "create_from_template",
 *   action: "submit",
 *   extra: { template_id: "123" }
 * })
 */

import { PostHog } from "posthog-js/dist/module.no-external";
// Import session recording module for Manifest v3 compatibility
import "posthog-js/dist/posthog-recorder";

/**
 * Tracking areas - logical sections of the application
 */
export const TRACKING_AREAS = {
  // Extension specific areas
  EXTENSION: "extension",
  EXTENSION_AUTH: "extension_auth",
  EXTENSION_NAVIGATION: "extension_navigation",

  // Shared areas from main app
  ASSISTANT: "assistant",
  CONVERSATION: "conversation",
  WORKSPACE: "workspace",
  DATA_SOURCES: "datasources",
  SETTINGS: "settings",
  BUILDER: "builder",
  SPACES: "spaces",
} as const;

export type TrackingArea = (typeof TRACKING_AREAS)[keyof typeof TRACKING_AREAS];

/**
 * Common actions
 */
export const TRACKING_ACTIONS = {
  CLICK: "click",
  SUBMIT: "submit",
  CREATE: "create",
  DELETE: "delete",
  CONNECT: "connect",
  SELECT: "select",
  OPEN: "open",
  CLOSE: "close",
  LOGIN: "login",
  LOGOUT: "logout",
} as const;

export type TrackingAction =
  (typeof TRACKING_ACTIONS)[keyof typeof TRACKING_ACTIONS];

export type TrackingExtra = Record<string, string | number | boolean>;

interface TrackEventParams {
  area: TrackingArea | string;
  object: string;
  action?: TrackingAction | string;
  extra?: TrackingExtra;
}

let posthog: PostHog | null = null;
let isInitialized = false;

/**
 * Get or create a unique distinct ID for the extension user
 * This ensures consistent tracking across all extension contexts
 */
async function getSharedDistinctId(): Promise<string> {
  try {
    // Check if chrome.storage is available
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(["posthog_distinct_id"]);
      if (stored.posthog_distinct_id) {
        return stored.posthog_distinct_id;
      }

      // Generate new distinct ID and store it
      const distinctId = `ext_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      await chrome.storage.local.set({ posthog_distinct_id: distinctId });
      return distinctId;
    }
  } catch (error) {
    console.warn("Unable to access chrome.storage, using fallback distinct ID", error);
  }

  // Fallback for contexts without chrome.storage access
  const fallbackId = localStorage.getItem("posthog_distinct_id");
  if (fallbackId) {
    return fallbackId;
  }

  const newId = `ext_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  localStorage.setItem("posthog_distinct_id", newId);
  return newId;
}

/**
 * Initialize Posthog tracking for the extension
 */
export async function initializeTracking(apiKey?: string, host?: string): Promise<void> {
  if (isInitialized || !apiKey || !host) {
    return;
  }

  try {
    // Get shared distinct ID for consistent tracking across contexts
    const distinctId = await getSharedDistinctId();

    // Create PostHog instance
    posthog = new PostHog();

    posthog.init(apiKey, {
      api_host: host,
      // Manifest v3 compatibility settings
      disable_external_dependency_loading: true,
      persistence: "localStorage",
      // Bootstrap with shared distinct ID
      bootstrap: {
        distinctID: distinctId,
      },
      // Extension-appropriate settings
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      // Disable features that don't work well in extensions
      disable_surveys: false, // Keep surveys for popup/options pages
      disable_session_recording: false, // Keep recording for debugging
      // Callback when loaded
      loaded: (instance) => {
        isInitialized = true;

        // Register extension context
        instance.register({
          $app_type: "extension",
          $browser: navigator.userAgent.includes("Chrome") ? "chrome" : "unknown",
        });

        // Expose for debugging in development
        if (process.env.NODE_ENV === "development") {
          (window as any).__posthog = instance;
        }
      },
    });
  } catch (error) {
    console.error("Failed to initialize PostHog tracking:", error);
  }
}

export function trackEvent({
  area,
  object,
  action = TRACKING_ACTIONS.CLICK,
  extra,
}: TrackEventParams): void {
  if (!posthog || !isInitialized) {
    return;
  }

  const eventName = `${area}:${object}:${action}`;
  const properties = {
    area,
    object,
    action,
    is_extension: true, // Always mark events as coming from extension
    ...extra, // Spread for PostHog.
    extra, // As object for Snowflake.
  };

  posthog.capture(eventName, properties);
}

/**
 * Wrapper for onClick handlers that includes tracking.
 * For click tracking with optional extra params.
 *
 * @example
 * // Without handler (just tracking)
 * <Button onClick={withTracking(TRACKING_AREAS.EXTENSION, "create_agent")} />
 *
 * @example
 * // With handler
 * <Button onClick={withTracking(TRACKING_AREAS.EXTENSION, "create_agent", handleCreate)} />
 *
 * @example
 * // With handler and extra params
 * <Button onClick={withTracking(TRACKING_AREAS.EXTENSION, "select", handleClick, { id: "123" })} />
 */
export function withTracking<T extends Element = HTMLElement>(
  area: TrackingArea | string,
  object: string,
  handler?: (e: React.MouseEvent<T>) => void | Promise<void>,
  extra?: TrackingExtra
) {
  return (e: React.MouseEvent<T>) => {
    trackEvent({ area, object, action: TRACKING_ACTIONS.CLICK, extra });
    if (handler) {
      void handler(e);
    }
  };
}

/**
 * Track user identification for authenticated sessions
 */
export function identifyUser(userId: string, userProperties?: Record<string, any>): void {
  if (!posthog || !isInitialized) {
    return;
  }

  posthog.identify(userId, userProperties);
}

/**
 * Reset user identification on logout
 */
export function resetUser(): void {
  if (!posthog || !isInitialized) {
    return;
  }

  posthog.reset();
}

/**
 * Enable debug mode for troubleshooting
 */
export function enableDebug(): void {
  if (posthog) {
    posthog.debug(true);
  }
}