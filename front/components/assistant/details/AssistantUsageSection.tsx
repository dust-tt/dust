import { useMemo } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { useAgentUsage } from "@app/lib/swr/assistants";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

interface AssistantUsageSectionProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: LightWorkspaceType;
}

export function AssistantUsageSection({
  agentConfiguration,
  owner,
}: AssistantUsageSectionProps) {
  const agentUsageRes = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  const usageSentence = useMemo(
    () =>
      assistantUsageMessage({
        assistantName: agentConfiguration?.name ?? null,
        usage: agentUsageRes.agentUsage,
        isLoading: agentUsageRes.isAgentUsageLoading,
        isError: agentUsageRes.isAgentUsageError,
        shortVersion: true,
      }),
    [agentConfiguration.name, agentUsageRes]
  );

  const editedSentence =
    agentConfiguration.versionCreatedAt &&
    `Last edited ${timeAgoFrom(
      Date.parse(agentConfiguration.versionCreatedAt),
      { useLongFormat: true }
    )} ago`;

  return (
    <>
      {agentConfiguration.scope === "global" && usageSentence && (
        <div className="text-xs">{usageSentence}</div>
      )}

      {(agentConfiguration.scope === "workspace" ||
        agentConfiguration.scope === "published") && (
        <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {agentConfiguration.lastAuthors && (
            <div>
              <span className="font-medium">By: </span>{" "}
              {agentConfiguration.lastAuthors.join(", ")}
            </div>
          )}
          {usageSentence ? (
            <div>
              {editedSentence + ", "}
              {usageSentence}
            </div>
          ) : (
            <div className="justify-self-end">{editedSentence}</div>
          )}
        </div>
      )}
    </>
  );
}
