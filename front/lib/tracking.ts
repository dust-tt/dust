/**
 * Tracking conventions:
 * - Event name: {area}:{object}_{action}
 * - Always include area from TRACKING_AREAS
 * - Use snake_case for object names
 * - Common actions: click, submit, create, delete, connect
 *
 * @example
 * // For simple click tracking:
 * <Button onClick={withTracking(TRACKING_AREAS.BUILDER, "create_agent")} />
 *
 * @example
 * // For tracking with extra params or non-click actions:
 * trackEvent({
 *   area: TRACKING_AREAS.BUILDER,
 *   object: "create_from_template",
 *   action: "submit",
 *   extra: { template_id: "123" }
 * })
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
  NAVIGATION: "navigation",
  SOLUTIONS: "solutions",
  INDUSTRY: "industry",

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

interface TrackEventParams {
  area: TrackingArea | string;
  object: string;
  action?: TrackingAction | string;
  extra?: Record<string, any>;
}

export function trackEvent({
  area,
  object,
  action = TRACKING_ACTIONS.CLICK,
  extra,
}: TrackEventParams): void {
  if (typeof window === "undefined" || !posthog.__loaded) {
    return;
  }

  const eventName = `${area}:${object}:${action}`;
  const properties: Record<string, any> = {
    area,
    object,
    action,
    ...(extra && { extra }),
  };

  posthog.capture(eventName, properties);
}

/**
 * Wrapper for onClick handlers that includes tracking.
 * For click tracking with optional extra params.
 *
 * @example
 * // Without handler (just tracking)
 * <Button onClick={withTracking(TRACKING_AREAS.BUILDER, "create_agent")} />
 *
 * @example
 * // With handler
 * <Button onClick={withTracking(TRACKING_AREAS.BUILDER, "create_agent", handleCreate)} />
 *
 * @example
 * // With handler and extra params
 * <Button onClick={withTracking(TRACKING_AREAS.DATA, "select", handleClick, { id: "123" })} />
 */
export function withTracking<T extends Element = HTMLElement>(
  area: TrackingArea | string,
  object: string,
  handler?: (e: React.MouseEvent<T>) => void | Promise<void>,
  extra?: Record<string, any>
) {
  return (e: React.MouseEvent<T>) => {
    trackEvent({ area, object, action: TRACKING_ACTIONS.CLICK, extra });
    if (handler) {
      void handler(e);
    }
  };
}
