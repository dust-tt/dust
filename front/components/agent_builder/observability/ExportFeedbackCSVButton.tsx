import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useObservabilityContext } from "@app/components/agent_builder/observability/ObservabilityContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useExportFeedbackCsv } from "@app/lib/swr/agent_observability";
import { normalizeError } from "@app/types";

export interface ExportFeedbackCsvButtonProps {
  agentConfigurationSId: string;
}

export function ExportFeedbackCsvButton({
  agentConfigurationSId,
}: ExportFeedbackCsvButtonProps) {
  const { owner } = useAgentBuilderContext();
  const [downloading, setDownloading] = useState(false);
  const { downloadFeedbackCsv } = useExportFeedbackCsv();
  const { period } = useObservabilityContext();
  const sendNotification = useSendNotification();
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadFeedbackCsv({
        workspaceId: owner.sId,
        agentConfigurationId: agentConfigurationSId,
        days: period,
      });
    } catch (e) {
      sendNotification({
        title: "Export failed",
        description: normalizeError(e).message,
        type: "error",
      });
      return;
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      label="Export all feedback as CSV"
      size="xs"
      variant="outline"
      onClick={handleDownload}
      disabled={downloading}
    />
  );
}
