/**
 * Minimal PostHog tracking utilities
 *
 * Uses PostHog's native data-ph-capture-attribute-* format
 * Maintains a clean topology: {area}:{object}_{action}
 */

import posthog from "posthog-js";

/**
 * Tracking areas - logical sections of the application
 */
export const TRACKING_AREAS = {
  // Public
  HOME: "home",
  PRICING: "pricing",
  AUTH: "auth",

  // Product
  ASSISTANT: "assistant",
  CONVERSATION: "conversation",
  WORKSPACE: "workspace",
  DATA_SOURCES: "datasources",
  SETTINGS: "settings",

  // Features
  BUILDER: "builder",
  SPACES: "spaces",
  LABS: "labs",
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
} as const;

export type TrackingAction =
  (typeof TRACKING_ACTIONS)[keyof typeof TRACKING_ACTIONS];

export function trackEvent(
  area: TrackingArea | string,
  object: string,
  action: TrackingAction | string = TRACKING_ACTIONS.CLICK,
  extra?: Record<string, string>
): void {
  if (typeof window === "undefined" || !posthog.__loaded) {
    return;
  }

  const eventName = `${area}:${object}_${action}`;

  const properties: Record<string, string> = {
    area,
    object,
    action,
    ...extra,
  };

  posthog.capture(eventName, properties);
}

export function trackOnClick<T extends Element = HTMLElement>(
  handler: (e: React.MouseEvent<T>) => void | Promise<void>,
  area: TrackingArea | string,
  object: string,
  action: TrackingAction | string = TRACKING_ACTIONS.CLICK,
  extra?: Record<string, string>
) {
  return (e: React.MouseEvent<T>) => {
    trackEvent(area, object, action, extra);
    return handler(e);
  };
}
