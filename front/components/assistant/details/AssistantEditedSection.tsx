import { timeAgoFrom } from "@app/lib/utils";
import type { LightAgentConfigurationType } from "@app/types";

interface AssistantUsageSectionProps {
  agentConfiguration: LightAgentConfigurationType;
}

export function AssistantEditedSection({
  agentConfiguration,
}: AssistantUsageSectionProps) {
  const lastAuthor = agentConfiguration.lastAuthors?.[0];
  const editedSentence =
    agentConfiguration.versionCreatedAt &&
    `${timeAgoFrom(Date.parse(agentConfiguration.versionCreatedAt), {
      useLongFormat: true,
    })} ${lastAuthor ? `ago by ${lastAuthor}` : ""}`;

  return (
    <>
      {(agentConfiguration.scope === "hidden" ||
        agentConfiguration.scope === "visible") && (
        <div className="flex gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <b>Last edited: </b>
          <div>{editedSentence}</div>
        </div>
      )}
    </>
  );
}
