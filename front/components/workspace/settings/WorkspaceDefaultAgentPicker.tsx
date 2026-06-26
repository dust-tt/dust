import { AgentPicker } from "@app/components/assistant/AgentPicker";
import { ConfirmContext } from "@app/components/Confirm";
import { useWorkspaceDefaultAgent } from "@app/hooks/useWorkspaceDefaultAgent";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, Button, ContextItem, Robot } from "@dust-tt/sparkle";
import { useContext } from "react";

const ROBOT_VISUAL = <Robot className="h-6 w-6" />;

interface WorkspaceDefaultAgentPickerProps {
  owner: WorkspaceType;
}

export function WorkspaceDefaultAgentPicker({
  owner,
}: WorkspaceDefaultAgentPickerProps) {
  const confirm = useContext(ConfirmContext);
  const { workspaceDefaultAgentId, isChanging, doUpdateWorkspaceDefaultAgent } =
    useWorkspaceDefaultAgent({ owner });

  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  const dustAgent =
    agentConfigurations.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST) ?? null;

  // Fall back to @dust when the configured default agent isn't available (e.g.
  // unpublished/deleted). `agentConfigurations` only contains viewable agents.
  const displayedDefaultAgent =
    (workspaceDefaultAgentId &&
      agentConfigurations.find((a) => a.sId === workspaceDefaultAgentId)) ||
    dustAgent;

  const saveDefaultAgent = async (agentId: string | null) => {
    // Selecting dust clears the stored workspaceDefaultAgentId in the DB.
    const nextAgentId = agentId === GLOBAL_AGENTS_SID.DUST ? null : agentId;

    // Warn about the implications of using another default agent before
    // switching. Resetting back to @dust needs no confirmation.
    if (nextAgentId) {
      const confirmed = await confirm({
        title: "Warning",
        message:
          "@dust is designed to give your users the best experience by default. A custom default agent may not handle every request as reliably. Do you want to set it as the workspace default anyway?",
        validateVariant: "warning",
        validateLabel: "Yes",
        cancelLabel: "No",
      });
      if (!confirmed) {
        return;
      }
    }
    await doUpdateWorkspaceDefaultAgent(nextAgentId);
  };

  return (
    <ContextItem
      title="Default agent"
      subElement="The agent pre-selected when anyone starts a new conversation in this workspace."
      visual={ROBOT_VISUAL}
      hasSeparatorIfLast={true}
      action={
        <AgentPicker
          owner={owner}
          agents={agentConfigurations}
          isLoading={isLoading}
          disabled={isChanging}
          showFooterButtons={false}
          onItemClick={(agent) => void saveDefaultAgent(agent.sId)}
          pickerButton={
            <Button
              variant="outline"
              size="sm"
              isSelect
              disabled={isChanging || isLoading}
              icon={
                displayedDefaultAgent
                  ? () => (
                      <Avatar
                        size="xxs"
                        visual={displayedDefaultAgent.pictureUrl}
                      />
                    )
                  : Robot
              }
              label={displayedDefaultAgent?.name ?? "@dust"}
            />
          }
        />
      }
    />
  );
}
