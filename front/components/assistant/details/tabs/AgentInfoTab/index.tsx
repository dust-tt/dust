import {
  Button,
  Chip,
  Cog6ToothIcon,
  Page,
  ReadOnlyTextArea,
} from "@dust-tt/sparkle";

import { AssistantEditedSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantEditedSection";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantKnowledgeSection";
import { AssistantToolsSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantToolsSection";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { AgentConfigurationType, WorkspaceType } from "@app/types";
import { GLOBAL_AGENTS_SID, isAdmin } from "@app/types";

export function AgentInfoTab({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  const isConfigurable = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST;
  return (
    <div className="flex flex-col gap-4">
      {agentConfiguration.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentConfiguration.tags.map((tag) => (
            <Chip key={tag.sId} color="golden" label={tag.name} size="xs" />
          ))}
        </div>
      )}

      <div className="text-sm text-foreground dark:text-foreground-night">
        {agentConfiguration.description}
      </div>
      {agentConfiguration && (
        <AssistantEditedSection agentConfiguration={agentConfiguration} />
      )}
      {isConfigurable && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          {isAdmin(owner) ? (
            <Button
              label={`Manage ${agentConfiguration.name} configuration`}
              icon={Cog6ToothIcon}
              href={getAgentBuilderRoute(owner.sId, agentConfiguration.sId)}
            />
          ) : (
            <Chip
              color="blue"
              label={`Your admin(s) can manage ${agentConfiguration.name} configuration.`}
            />
          )}
        </div>
      )}
      <Page.Separator />

      {agentConfiguration.scope !== "global" && (
        <>
          <AssistantKnowledgeSection
            agentConfiguration={agentConfiguration}
            owner={owner}
          />

          {agentConfiguration?.instructions ? (
            <div className="dd-privacy-mask flex flex-col gap-5">
              <div className="heading-lg text-foreground dark:text-foreground-night">
                Instructions
              </div>
              <ReadOnlyTextArea
                content={agentConfiguration.instructions}
                minRows={15}
              />
            </div>
          ) : (
            "This agent has no instructions."
          )}
        </>
      )}
      <AssistantToolsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
      />
    </div>
  );
}
