import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  LoadingBlock,
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
import { getConversationRoute } from "@app/lib/utils/router";
import { GLOBAL_AGENTS_SID } from "@app/types";
import { useRouter } from "next/router";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationSId}/observability/export-feedback-csv?days=${period}`;
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const dlUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `feedback_${agentConfigurationSId}_${period}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(dlUrl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
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
            // 1) Create conversation with @Fred (no attachment yet)
            const tz =
              Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
            const convRes = await fetch(
              `/api/w/${workspaceId}/assistant/conversations`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: `Observability feedback (${period}d)`,
                  visibility: "unlisted",
                  message: {
                    content:
                      "Please analyze the attached feedback CSV.\n" +
                      `:mention[Fred]{sId=${GLOBAL_AGENTS_SID.FEEDBACK_ANALYZER}}`,
                    mentions: [
                      { configurationId: GLOBAL_AGENTS_SID.FEEDBACK_ANALYZER },
                    ],
                    context: { timezone: tz, profilePictureUrl: null },
                  },
                  contentFragments: [],
                }),
              }
            );
            if (!convRes.ok) {
              throw new Error(`Create conversation failed (${convRes.status})`);
            }
            const convJson = (await convRes.json()) as {
              conversation: { sId: string };
            };

            // 2) Generate CSV
            const exportUrl = `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationSId}/observability/export-feedback-csv?days=${period}`;
            const exportRes = await fetch(exportUrl, { method: "POST" });
            if (!exportRes.ok) {
              throw new Error(`Export failed (${exportRes.status})`);
            }
            const csvBlob = await exportRes.blob();
            const fileName = `feedback_${agentConfigurationSId}_${period}d.csv`;

            // 3) Request upload slot (CSV) with conversationId metadata
            const fileReqRes = await fetch(`/api/w/${workspaceId}/files`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contentType: "text/csv",
                fileName,
                fileSize: csvBlob.size,
                useCase: "conversation",
                useCaseMetadata: { conversationId: convJson.conversation.sId },
              }),
            });
            if (!fileReqRes.ok) {
              throw new Error(`File request failed (${fileReqRes.status})`);
            }
            const fileReqJson = (await fileReqRes.json()) as {
              file: { uploadUrl: string; sId: string };
            };

            // 4) Upload CSV to storage (multipart)
            const form = new FormData();
            form.append("file", csvBlob, fileName);
            const putRes = await fetch(fileReqJson.file.uploadUrl, {
              method: "POST",
              body: form,
            });
            if (!putRes.ok) {
              throw new Error(`Upload failed (${putRes.status})`);
            }

            // 5) Attach file to the conversation
            const attachRes = await fetch(
              `/api/w/${workspaceId}/assistant/conversations/${convJson.conversation.sId}/content_fragment`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: fileName,
                  fileId: fileReqJson.file.sId,
                  context: { profilePictureUrl: null },
                }),
              }
            );
            if (!attachRes.ok) {
              throw new Error(`Attach file failed (${attachRes.status})`);
            }

            // 6) Navigate to conversation
            void router.push(
              getConversationRoute(workspaceId, convJson.conversation.sId)
            );
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(e);
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
