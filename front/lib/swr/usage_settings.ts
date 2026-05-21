// TODO: Wire up real API endpoints once the backend for usage settings and
// notifications is implemented. The hooks below expose the shape the rest of
// the frontend should expect; the data is currently held in a module-level
// store so toggling/editing in the UI works during development.

import { useSendNotification } from "@app/hooks/useNotification";
import { useCallback, useSyncExternalStore } from "react";

export interface UsageSettings {
  allowUpgradeRequest: boolean;
  autoUpgradeFreeToPro: boolean;
  defaultUsageLimitCredits: number;
}

export interface UsageNotifications {
  creditUsageAlertPercent: number;
  creditCapWarning: boolean;
  upgradeRequestEmail: boolean;
}

const DEFAULT_USAGE_SETTINGS: UsageSettings = {
  allowUpgradeRequest: false,
  autoUpgradeFreeToPro: false,
  defaultUsageLimitCredits: 1000,
};

const DEFAULT_USAGE_NOTIFICATIONS: UsageNotifications = {
  creditUsageAlertPercent: 80,
  creditCapWarning: true,
  upgradeRequestEmail: true,
};

const usageSettingsStore = new Map<string, UsageSettings>();
const usageNotificationsStore = new Map<string, UsageNotifications>();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function getUsageSettings(workspaceId: string): UsageSettings {
  return usageSettingsStore.get(workspaceId) ?? DEFAULT_USAGE_SETTINGS;
}

function getUsageNotifications(workspaceId: string): UsageNotifications {
  return (
    usageNotificationsStore.get(workspaceId) ?? DEFAULT_USAGE_NOTIFICATIONS
  );
}

export function useUsageSettings({ workspaceId }: { workspaceId: string }) {
  const settings = useSyncExternalStore(
    subscribe,
    () => getUsageSettings(workspaceId),
    () => DEFAULT_USAGE_SETTINGS
  );

  return {
    usageSettings: settings,
    isUsageSettingsLoading: false,
    isUsageSettingsError: false,
  };
}

export function useUpdateUsageSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateUsageSettings = useCallback(
    async (patch: Partial<UsageSettings>): Promise<boolean> => {
      const next = { ...getUsageSettings(workspaceId), ...patch };
      usageSettingsStore.set(workspaceId, next);
      notify();
      // TODO: replace with a real POST request once the backend is available.
      sendNotification({
        type: "success",
        title: "Usage settings updated",
        description: "Changes are not persisted yet — backend coming soon.",
      });
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateUsageSettings };
}

export function useUsageNotifications({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const notifications = useSyncExternalStore(
    subscribe,
    () => getUsageNotifications(workspaceId),
    () => DEFAULT_USAGE_NOTIFICATIONS
  );

  return {
    usageNotifications: notifications,
    isUsageNotificationsLoading: false,
    isUsageNotificationsError: false,
  };
}

export function useUpdateUsageNotifications({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doUpdateUsageNotifications = useCallback(
    async (patch: Partial<UsageNotifications>): Promise<boolean> => {
      const next = { ...getUsageNotifications(workspaceId), ...patch };
      usageNotificationsStore.set(workspaceId, next);
      notify();
      // TODO: replace with a real POST request once the backend is available.
      sendNotification({
        type: "success",
        title: "Notification settings updated",
        description: "Changes are not persisted yet — backend coming soon.",
      });
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doUpdateUsageNotifications };
}
