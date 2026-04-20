import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { GetReinforcementTestCaseResponseBody } from "@app/pages/api/poke/workspaces/[wId]/conversations/[cId]/reinforcement_test_case";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

export function useCopyReinforcementTestCase({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const [isLoading, setIsLoading] = useState(false);

  const copyTestCase = async () => {
    setIsLoading(true);
    try {
      const response = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/reinforcement_test_case`
      );
      const data = await response.json();
      if (!response.ok) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        throw new Error(data.error?.message || "Failed to generate test case");
      }
      const { testCase } = data as GetReinforcementTestCaseResponseBody;
      await navigator.clipboard.writeText(JSON.stringify(testCase, null, 2));
      sendNotification({
        title: "Copied",
        description: "Reinforcement test case copied to clipboard.",
        type: "success",
      });
    } catch (e) {
      sendNotification({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { copyTestCase, isLoading };
}
