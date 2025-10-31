import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  LoadingBlock,
  useSendNotification,
} from "@dust-tt/sparkle";
import React from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { FeedbackDistributionChart } from "@app/components/agent_builder/observability/charts/FeedbackDistributionChart";
import { ToolLatencyChart } from "@app/components/agent_builder/observability/charts/ToolLatencyChart";
import { ToolUsageChart } from "@app/components/agent_builder/observability/charts/ToolUsageChart";
import { UsageMetricsChart } from "@app/components/agent_builder/observability/charts/UsageMetricsChart";
import {
  CHART_CONTAINER_HEIGHT_CLASS,
  OBSERVABILITY_TIME_RANGE,
} from "@app/components/agent_builder/observability/constants";
import {
  ObservabilityProvider,
  useObservability,
} from "@app/components/agent_builder/observability/ObservabilityContext";
import { useExportFeedbackCsv } from "@app/lib/swr/agent_observability";
import { useAgentConfiguration } from "@app/lib/swr/assistants";
import { getConversationRoute } from "@app/lib/utils/router";
import { GLOBAL_AGENTS_SID, normalizeError } from "@app/types";
import { useRouter } from "next/router";
import { createConversationWithMessage } from "../assistant/conversation/lib";

interface AgentBuilderObservabilityProps {
  agentConfigurationSId: string;
}

export function AgentBuilderObservability({
  agentConfigurationSId,
}: AgentBuilderObservabilityProps) {
  const { owner } = useAgentBuilderContext();

  const { agentConfiguration, isAgentConfigurationLoading } =
    useAgentConfiguration({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationSId,
    });

  if (!agentConfiguration) {
    return null;
  }

  return (
    <ObservabilityProvider>
      <div className="flex h-full flex-col space-y-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Observability
            </h2>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground">
              Monitor key metrics and performance indicators for your agent.
            </span>
          </div>
          <HeaderActions
            workspaceId={owner.sId}
            agentConfigurationSId={agentConfiguration.sId}
          />
        </div>

        <div className="grid grid-cols-1 gap-6">
          {isAgentConfigurationLoading ? (
            <>
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
              <ChartContainerSkeleton />
            </>
          ) : (
            <>
              <UsageMetricsChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <FeedbackDistributionChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <ToolUsageChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
              <ToolLatencyChart
                workspaceId={owner.sId}
                agentConfigurationId={agentConfiguration.sId}
              />
            </>
          )}
        </div>
      </div>
    </ObservabilityProvider>
  );
}

function HeaderPeriodDropdown() {
  const { period, setPeriod } = useObservability();
  return (
    <div className="flex items-center gap-2 pr-2">
      <Label>Period:</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button label={`${period}d`} size="xs" variant="outline" isSelect />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {OBSERVABILITY_TIME_RANGE.map((p) => (
            <DropdownMenuItem
              key={p}
              label={`${p}d`}
              onClick={() => setPeriod(p)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HeaderActions({
  workspaceId,
  agentConfigurationSId,
}: {
  workspaceId: string;
  agentConfigurationSId: string;
}) {
  const { period } = useObservability();
  const [downloading, setDownloading] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const router = useRouter();

  const { owner, user } = useAgentBuilderContext();
  const { downloadFeedbackCsv, exportFeedbackCsv } = useExportFeedbackCsv();
  const sendNotification = useSendNotification();

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadFeedbackCsv({
        workspaceId,
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
    <div className="flex items-center gap-2">
      <HeaderPeriodDropdown />
      <ExportFeedbackCsvButton
        onClick={handleDownload}
        downloading={downloading}
      />
      <Button
        label={starting ? "Starting..." : "Start Conversation with Fred"}
        size="xs"
        variant="outline"
        disabled={starting || downloading}
        onClick={async () => {
          setStarting(true);
          try {
            // 1) Generate CSV and upload as file directly
            const exportJson = await exportFeedbackCsv({
              workspaceId,
              agentConfigurationId: agentConfigurationSId,
              days: period,
            });

            // 2) Create conversation with feedback CSV
            const convRes = await createConversationWithMessage({
              owner,
              user,
              messageData: {
                input: "Please analyze the attached feedback CSV.",
                mentions: [
                  { configurationId: GLOBAL_AGENTS_SID.FEEDBACK_ANALYZER },
                ],
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
            void router.push(getConversationRoute(workspaceId, convJson.sId));
          } catch (e) {
            sendNotification({
              title: "Export failed",
              description: normalizeError(e).message,
              type: "error",
            });
          } finally {
            setStarting(false);
          }
        }}
      />
    </div>
  );
}

function ExportFeedbackCsvButton({
  onClick,
  downloading,
}: {
  onClick: () => void;
  downloading: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        label={downloading ? "Generating..." : "Export Feedback CSV"}
        size="xs"
        variant="outline"
        onClick={onClick}
        disabled={downloading}
      />
    </div>
  );
}

function ChartContainerSkeleton() {
  return (
    <div
      className={cn(
        "bg-card flex flex-col rounded-lg border border-border p-4",
        CHART_CONTAINER_HEIGHT_CLASS
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <LoadingBlock className="h-6 w-40 rounded-md" />
      </div>
      <div className="flex-1">
        <LoadingBlock className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}
