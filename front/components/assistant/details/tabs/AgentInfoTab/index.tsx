import { Avatar, Chip, cn, Markdown, Page } from "@dust-tt/sparkle";
import isString from "lodash/isString";

import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantKnowledgeSection";
import { AssistantToolsSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantToolsSection";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { AgentConfigurationType, WorkspaceType } from "@app/types";
import { GLOBAL_AGENTS_SID, SUPPORTED_MODEL_CONFIGS } from "@app/types";

export function AgentInfoTab({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  const { isDark } = useTheme();
  const isDustAgent =
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST ||
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DEEP_DIVE ||
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST_EDGE;

  const isGlobalAgent = agentConfiguration.scope === "global";
  const displayKnowledge = !isGlobalAgent || isDustAgent;
  const displayInstructions =
    !isGlobalAgent &&
    isString(agentConfiguration?.instructions) &&
    agentConfiguration.instructions.length > 0;

  const model = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === agentConfiguration.model.modelId &&
      m.providerId === agentConfiguration.model.providerId
  );

  return (
    <div className="flex flex-col gap-5">
      {agentConfiguration.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentConfiguration.tags.map((tag) => (
            <Chip key={tag.sId} color="golden" label={tag.name} size="xs" />
          ))}
        </div>
      )}

      {agentConfiguration.description && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          <Markdown
            content={agentConfiguration.description}
            forcedTextSize="text-sm"
          />
        </div>
      )}

      {displayKnowledge && (
        <>
          <Page.Separator />
          <AssistantKnowledgeSection
            agentConfiguration={agentConfiguration}
            owner={owner}
          />
        </>
      )}

      {displayInstructions && isString(agentConfiguration.instructions) && (
        <div className="dd-privacy-mask flex flex-col gap-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <div
            className={cn(
              "max-h-[400px] overflow-y-auto rounded-lg border border-border bg-muted-background px-3 py-2 " +
                "dark:border-border-night dark:bg-muted-background-night"
            )}
          >
            <AgentMessageMarkdown
              content={agentConfiguration.instructions}
              owner={owner}
            />
          </div>
        </div>
      )}

      {model && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Model
          </div>
          <div className="flex flex-row items-center gap-2">
            <Avatar
              icon={getModelProviderLogo(model.providerId, isDark)}
              size="xs"
            />
            <div>{model.displayName}</div>
          </div>
        </div>
      )}

      <AssistantToolsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
        isDustAgent={isDustAgent}
      />
    </div>
  );
}
