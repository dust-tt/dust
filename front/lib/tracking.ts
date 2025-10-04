/**
 * Minimal PostHog tracking utilities
 *
 * Uses PostHog's native data-ph-capture-attribute-* format
 * Maintains a clean topology: {area}:{object}_{action}
 */

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

export type TrackingArea = typeof TRACKING_AREAS[keyof typeof TRACKING_AREAS];

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

export type TrackingAction = typeof TRACKING_ACTIONS[keyof typeof TRACKING_ACTIONS];

/**
 * PostHog native attribute format
 * These attributes are automatically captured by PostHog
 */
export interface TrackingAttributes {
  'data-ph-capture-attribute-tracking'?: string;
  'data-ph-capture-attribute-area'?: string;
  'data-ph-capture-attribute-object'?: string;
  'data-ph-capture-attribute-action'?: string;
  [key: `data-ph-capture-attribute-${string}`]: string | undefined;
}

/**
 * Build PostHog tracking attributes
 *
 * @example
 * <Button {...trackingProps(TRACKING_AREAS.ASSISTANT, "card", TRACKING_ACTIONS.CLICK)} />
 *
 * Produces:
 * data-ph-capture-attribute-tracking="assistant:card_click"
 * data-ph-capture-attribute-area="assistant"
 * data-ph-capture-attribute-object="card"
 * data-ph-capture-attribute-action="click"
 */
export function trackingProps(
  area: TrackingArea | string,
  object: string,
  action: TrackingAction | string = TRACKING_ACTIONS.CLICK,
  extra?: Record<string, string>
): TrackingAttributes {
  const trackingId = `${area}:${object}_${action}`;

  const attributes: TrackingAttributes = {
    'data-ph-capture-attribute-tracking': trackingId,
    'data-ph-capture-attribute-area': area,
    'data-ph-capture-attribute-object': object,
    'data-ph-capture-attribute-action': action,
  };

  // Add any extra attributes
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      attributes[`data-ph-capture-attribute-${key}`] = value;
    }
  }

  return attributes;
}

/**
 * Shorthand for click tracking (most common case)
 */
export function trackClick(area: TrackingArea | string, object: string): TrackingAttributes {
  return trackingProps(area, object, TRACKING_ACTIONS.CLICK);
}

/**
 * Shorthand for submit tracking
 */
export function trackSubmit(area: TrackingArea | string, object: string): TrackingAttributes {
  return trackingProps(area, object, TRACKING_ACTIONS.SUBMIT);
}