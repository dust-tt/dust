import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { serializeMention } from "@app/lib/mentions/format";
import { useSearchParam } from "@app/lib/platform";
import { useMemberDetails } from "@app/lib/swr/assistants";
import { useContext, useEffect, useRef } from "react";

/**
 * Reads the ?user= search param, fetches the member, pre-fills the composer with
 * a user mention (and clears any selected agent), then cleans up the URL param.
 */
export function useUserFromSearchParam(workspaceId: string) {
  const userId = useSearchParam("user");
  const {
    setPendingInputText,
    setSelectedAgent,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
  } = useContext(InputBarContext);
  const appliedUserIdRef = useRef<string | null>(null);

  const { userDetails } = useMemberDetails({
    workspaceId,
    userIds: userId ? [userId] : [],
  });

  useEffect(() => {
    if (!userId || !userDetails || appliedUserIdRef.current === userId) {
      return;
    }

    appliedUserIdRef.current = userId;

    // Clear any selected agent so the new conversation starts without one.
    setSuppressDefaultAgent(true);
    setSelectedAgent(null);
    setSelectedSingleAgent(null);

    setPendingInputText(
      `${serializeMention({
        type: "user",
        id: userId,
        label: userDetails.fullName,
      })} `,
      { replace: true }
    );

    const params = new URLSearchParams(window.location.search);
    if (params.has("user")) {
      params.delete("user");
      // Also drop ?agent= so a stale agent param cannot re-select after we clear.
      params.delete("agent");
      const queryString = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`
      );
    }
  }, [
    userId,
    userDetails,
    setPendingInputText,
    setSelectedAgent,
    setSelectedSingleAgent,
    setSuppressDefaultAgent,
  ]);
}
