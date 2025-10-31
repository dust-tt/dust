import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useExportFeedbackCsv } from "@app/lib/swr/agent_observability";
import { normalizeError } from "@app/types";

import { useAgentBuilderContext } from "../AgentBuilderContext";
import { useObservability } from "./ObservabilityContext";

export interface ExportFeedbackCsvButtonProps {
  agentConfigurationSId: string;
}

export function ExportFeedbackCsvButton({
  agentConfigurationSId,
}: ExportFeedbackCsvButtonProps) {
  const { owner } = useAgentBuilderContext();
  const [downloading, setDownloading] = useState(false);
  const { downloadFeedbackCsv } = useExportFeedbackCsv();
  const { period } = useObservability();
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
      label={downloading ? "Generating..." : "Export Feedback CSV"}
      size="xs"
      variant="outline"
      onClick={handleDownload}
      disabled={downloading}
    />
  );
}
