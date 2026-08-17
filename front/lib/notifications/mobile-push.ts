type MobilePushProviderPayload = {
  data: Record<string, string>;
  priority: "normal" | "high";
};

const MOBILE_PUSH_TTL_MS = 24 * 60 * 60 * 1000;

// Novu must select data mode before it merges the Framework provider output.
export const FCM_DATA_ONLY_TRIGGER_OVERRIDES = {
  providers: {
    fcm: {
      type: "data",
    },
  },
} as const;

export const buildFcmDataOnlyProviderOutput = (
  push: MobilePushProviderPayload
) => ({
  data: push.data,
  android: {
    priority: push.priority,
    ttl: MOBILE_PUSH_TTL_MS,
  },
});
