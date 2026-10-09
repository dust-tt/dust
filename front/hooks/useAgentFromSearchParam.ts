import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useActiveConversationId } from "@app/hooks/useActiveConversationId";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { toRichAgentMentionType } from "@app/types/assistant/mentions";
import { useContext, useEffect, useRef } from "react";

/**
 * Keeps the ?agent= search param and the input bar's selected agent in sync on the new
 * conversation page so the URL can always be shared. The param wins on arrival, the
 * picker wins afterwards.
 */
export function useAgentFromSearchParam(workspaceId: string) {
  const router = useAppRouter();
  const agent = useSearchParam("agent");
  const user = useSearchParam("user");
  const activeConversationId = useActiveConversationId();
  const { selectedSingleAgent, setSelectedAgent, suppressDefaultAgent } =
    useContext(InputBarContext);
  // Last ?agent= value whose selection we have observed in the composer (isSynced).
  // Intentionally not set when we merely call setSelectedAgent — that would let a
  // still-stale selection be mirrored into the URL as a fake picker change.
  const appliedParamRef = useRef<string | null>(null);
  const prevConversationIdRef = useRef(activeConversationId);
  // Bumped when entering /conversation/new so the URL→composer effect re-runs after
  // appliedParamRef is cleared (refs alone do not invalidate effects).
  const newConversationVisitRef = useRef(0);

  // While ?user= is still in the URL, member deep-link owns the composer — do not
  // apply or mirror ?agent=. Once ?user= is consumed, suppressDefaultAgent only
  // blocks writing a stale default agent back into the URL; an explicit ?agent=
  // (e.g. Cmd+K → New conversation with agent) must still apply and keeps
  // existing composer content.
  const isUserParamActive = !!user;

  // Entering /conversation/new from an existing conversation remounts the homepage
  // InputBar. Clear the applied marker so we re-push ?agent= through setSelectedAgent;
  // otherwise an already-matching selection looks "synced" without that push and can
  // lose to the @dust default, which then gets mirrored back into the URL.
  if (prevConversationIdRef.current !== activeConversationId) {
    const enteredNewConversation =
      activeConversationId === null && prevConversationIdRef.current !== null;
    prevConversationIdRef.current = activeConversationId;
    if (enteredNewConversation) {
      appliedParamRef.current = null;
      newConversationVisitRef.current += 1;
    }
  }
  const newConversationVisit = newConversationVisitRef.current;

  const isSynced = !!agent && selectedSingleAgent?.id === agent;
  const isUrlAgentPending =
    !!agent && appliedParamRef.current !== agent && !isUserParamActive;

  const { agentConfiguration, isAgentConfigurationError } =
    useAgentConfiguration({
      workspaceId,
      agentConfigurationId: agent,
      disabled: !isUrlAgentPending,
    });

  // URL to composer. When url param "agent" is not yet reflected in the composer,
  // push it via setSelectedAgent. Re-push even when selection already matches so a
  // remounted InputBar can mark it as an external/URL selection.
  useEffect(() => {
    // Read the visit counter so entering /conversation/new re-runs this effect after
    // appliedParamRef is cleared.
    void newConversationVisit;

    if (isUserParamActive) {
      return;
    }

    if (!agent || appliedParamRef.current === agent) {
      return;
    }

    // The composer autofocuses on mount. Focusing it again once the arrival agent resolves
    // lands late and scrolls the composer back into view, e.g. away from Discover.
    const focus = appliedParamRef.current !== null;

    if (selectedSingleAgent?.id === agent) {
      setSelectedAgent(selectedSingleAgent, { focus });
      return;
    }

    if (!agentConfiguration) {
      return;
    }

    setSelectedAgent(toRichAgentMentionType(agentConfiguration), { focus });
  }, [
    agent,
    agentConfiguration,
    isUserParamActive,
    newConversationVisit,
    selectedSingleAgent,
    setSelectedAgent,
  ]);

  // Composer to URL. On a new conversation, once the URL agent has been applied, a picker
  // change is mirrored into the url param "agent" so the address bar always reflects the selected agent.
  useEffect(() => {
    // Block while ?user= is active, or after a user deep-link until an agent is
    // explicitly chosen (suppressDefaultAgent). Applying ?agent= clears suppress
    // via setSelectedSingleAgent, so mirroring resumes for that selection.
    if (isUserParamActive || suppressDefaultAgent) {
      return;
    }

    if (isSynced) {
      appliedParamRef.current = agent;
    }

    const isNewConversation = activeConversationId === null;
    const isUrlAgentNotFound =
      isAgentConfigurationError?.error?.type ===
      "agent_configuration_not_found";
    const isPending =
      !!agent && appliedParamRef.current !== agent && !isUrlAgentNotFound;

    if (isSynced || !isNewConversation || !selectedSingleAgent || isPending) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("agent", selectedSingleAgent.id);
    // Never keep a stale ?user= when syncing an agent selection.
    params.delete("user");
    void router.replace(
      `${window.location.pathname}?${params.toString()}${window.location.hash}`
    );
  }, [
    activeConversationId,
    agent,
    isAgentConfigurationError,
    isSynced,
    isUserParamActive,
    router,
    selectedSingleAgent,
    suppressDefaultAgent,
  ]);
}
