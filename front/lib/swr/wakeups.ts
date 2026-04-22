// TODO(wake-up): Replace stub with real SWR fetch when wake-up API endpoints land (PR 7).
// Will use useSWRWithDefaults + useFetcher pattern (see front/lib/swr/agent_memories.ts).

import type { WakeUpType } from "@app/types/assistant/wakeups";
import { useCallback, useMemo } from "react";

const STUB_ENABLED = false;
// Toggle to preview the non-owner (viewer) disabled-input state. When false,
// the active wake-up is treated as belonging to someone else, so the banner
// hides the cancel action and the input bar shows the "conversation paused"
// placeholder + disabled send button. PR 7 will replace this with an `isOwner`
// boolean on the real API response (see TODO in AgentInputBar.tsx).
const STUB_IS_OWNER = true;

const buildStubWakeUps = (agentConfigurationId: string): WakeUpType[] => [
  {
    id: 1,
    sId: "stub-wakeup-1",
    createdAt: Date.now(),
    agentConfigurationId,
    // One-shot "snooze"-style wake-up: the agent wakes up once at a specific
    // timestamp (Date.now() + N minutes). This is the common V1 flow.
    // Swap in the cron block below to preview the recurring-schedule variant.
    scheduleConfig: {
      type: "one_shot",
      fireAt: Date.now() + 45 * 60 * 1000,
    },
    // scheduleConfig: {
    //   type: "cron",
    //   cron: "38 10 * * *",
    //   timezone: "UTC",
    // },
    reason: "Check error rate post-deploy v2.4.3",
    status: "scheduled",
    fireCount: 0,
    maxFires: 1,
  },
];

export function useConversationWakeUps({
  owner,
  conversationId,
  disabled,
}: {
  owner: { sId: string };
  conversationId: string;
  disabled?: boolean;
}) {
  const wakeUps = useMemo<WakeUpType[]>(() => {
    if (disabled || !conversationId) {
      return [];
    }
    if (STUB_ENABLED) {
      return buildStubWakeUps(`stub-agent-${owner.sId}`);
    }
    return [];
  }, [disabled, conversationId, owner.sId]);

  const activeWakeUp = useMemo(
    () => wakeUps.find((w) => w.status === "scheduled") ?? null,
    [wakeUps]
  );

  const mutateWakeUps = useCallback(async () => {
    // no-op in stub
  }, []);

  return {
    wakeUps,
    activeWakeUp,
    // TODO(wake-up): PR 7 will derive this per-wake-up from the API response,
    // following the triggers isEditor pattern. For now the stub treats every
    // active wake-up as (not) owned by the current user based on STUB_IS_OWNER.
    isActiveWakeUpOwner: activeWakeUp ? STUB_IS_OWNER : false,
    isWakeUpsLoading: false,
    isWakeUpsError: false,
    mutateWakeUps,
  };
}

export function useCancelWakeUp({
  owner,
  conversationId,
}: {
  owner: { sId: string };
  conversationId: string;
}) {
  const cancelWakeUp = useCallback(
    async (wakeUpSId: string) => {
      // eslint-disable-next-line no-console
      console.log("[stub] cancelWakeUp", {
        workspaceId: owner.sId,
        conversationId,
        wakeUpSId,
      });
      return true;
    },
    [owner.sId, conversationId]
  );

  return { cancelWakeUp };
}
