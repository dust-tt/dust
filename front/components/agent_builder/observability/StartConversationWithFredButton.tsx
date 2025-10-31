import { Button } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useObservability } from "@app/components/agent_builder/observability/ObservabilityContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import { useExportFeedbackCsv } from "@app/lib/swr/agent_observability";
import { getConversationRoute } from "@app/lib/utils/router";
import { GLOBAL_AGENTS_SID, normalizeError } from "@app/types";

interface StartConversationWithFredButtonProps {
  agentConfigurationSId: string;
  disabled?: boolean;
}

export function StartConversationWithFredButton({
  agentConfigurationSId,
  disabled = false,
}: StartConversationWithFredButtonProps) {
  const { period } = useObservability();
  const [starting, setStarting] = React.useState(false);
  const router = useRouter();

  const { owner, user } = useAgentBuilderContext();
  const { exportFeedbackCsv } = useExportFeedbackCsv();
  const sendNotification = useSendNotification();

  const handleClick = async () => {
    setStarting(true);
    try {
      // 1) Generate CSV and upload as file directly
      const exportJson = await exportFeedbackCsv({
        workspaceId: owner.sId,
        agentConfigurationId: agentConfigurationSId,
        days: period,
      });

      // 2) Create conversation with feedback CSV
      const convRes = await createConversationWithMessage({
        owner,
        user,
        messageData: {
          input: "Please analyze the attached feedback CSV.",
          mentions: [{ configurationId: GLOBAL_AGENTS_SID.FEEDBACK_ANALYZER }],
          contentFragments: {
            uploaded: [
              {
                title: exportJson.filename,
                fileId: exportJson.fileId,
                contentType: "text/csv",
              },
            ],
            contentNodes: [],
          },
        },
      });

      if (convRes.isErr()) {
        throw convRes.error;
      }

      // 3) Navigate to conversation
      const convJson = convRes.value;
      void router.push(getConversationRoute(owner.sId, convJson.sId));
    } catch (e) {
      sendNotification({
        title: "Export failed",
        description: normalizeError(e).message,
        type: "error",
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Button
      label={starting ? "Starting..." : "Start Conversation with Fred"}
      size="xs"
      variant="outline"
      disabled={starting || disabled}
      onClick={handleClick}
    />
  );
}
