export { getAttributionForGTM } from "./integrations/gtm";
export { syncAttributionToPostHog } from "./integrations/posthog";
export {
  getAttribution,
  getStoredUTMParamsFromAttribution,
  setAttribution,
} from "./storage";
export type {
  AttributionData,
  TrackingData,
  TrackingParamKey,
  UTMParams,
} from "./types";
export { TRACKING_PARAMS } from "./types";
