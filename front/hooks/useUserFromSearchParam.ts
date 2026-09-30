import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { serializeMention } from "@app/lib/mentions/format";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useMemberDetails } from "@app/lib/swr/assistants";
import { useContext, useEffect, useRef } from "react";

/**
 * Reads the ?user= search param, clears any selected agent immediately, then
 * (once member details load) pre-fills the composer with a user mention and
 * removes ?user= / ?agent= from the URL via the router.
 */
export function useUserFromSearchParam(workspaceId: string) {
  const router = useAppRouter();
  const userId = useSearchParam("user");
  const {
    setPendingInputText,
    setSelectedAgent,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
  } = useContext(InputBarContext);

  // Tracks which user id we already cleared the agent for / applied a mention for.
  // Reset when ?user= leaves the URL so a later navigation with the same id re-applies.
  const clearedForUserIdRef = useRef<string | null>(null);
  const appliedMentionUserIdRef = useRef<string | null>(null);

  const { userDetails } = useMemberDetails({
    workspaceId,
    userIds: userId ? [userId] : [],
  });

  useEffect(() => {
    if (!userId) {
      clearedForUserIdRef.current = null;
      appliedMentionUserIdRef.current = null;
    }
  }, [userId]);

  // Own the composer as soon as ?user= appears — do not wait on the member fetch,
  // otherwise useAgentFromSearchParam can mirror a stale @dust selection into the URL.
  useEffect(() => {
    if (!userId || clearedForUserIdRef.current === userId) {
      return;
    }
    clearedForUserIdRef.current = userId;
    setSuppressDefaultAgent(true);
    setSelectedAgent(null);
    setSelectedSingleAgent(null);
  }, [
    userId,
    setSuppressDefaultAgent,
    setSelectedAgent,
    setSelectedSingleAgent,
  ]);

  useEffect(() => {
    if (!userId || !userDetails || appliedMentionUserIdRef.current === userId) {
      return;
    }
    appliedMentionUserIdRef.current = userId;

    setPendingInputText(
      `${serializeMention({
        type: "user",
        id: userId,
        label: userDetails.fullName,
      })} `,
      { replace: true }
    );

    const params = new URLSearchParams(window.location.search);
    params.delete("user");
    params.delete("agent");
    const queryString = params.toString();
    void router.replace(
      `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
    );
  }, [userId, userDetails, setPendingInputText, router]);
}
