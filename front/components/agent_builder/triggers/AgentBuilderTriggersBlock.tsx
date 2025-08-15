import type { WorkspaceType } from "@dust-tt/client";
import {
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Spinner,
  TimeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { CreateScheduleModal } from "@app/components/agent_builder/triggers/CreateScheduleModal";
import { TriggerSelectorDropdown } from "@app/components/agent_builder/triggers/TriggerSelectorDropdown";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  TriggerKind,
  LightTriggerType,
} from "@app/types/assistant/triggers";

const BACKGROUND_IMAGE_STYLE_PROPS = {
  backgroundImage: `url("/static/IconBar.svg")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 14px",
  backgroundSize: "auto 60px",
  paddingTop: "90px",
};

function getIcon(kind: TriggerKind) {
  switch (kind) {
    case "schedule":
      return (
        <TimeIcon className="h-4 w-4 text-foreground dark:text-foreground-night" />
      );
    default:
      return null;
  }
}

interface TriggerCardProps {
  trigger: LightTriggerType;
  onRemove: () => void;
  onEdit?: () => void;
}

function TriggerCard({ trigger, onRemove, onEdit }: TriggerCardProps) {
  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onEdit}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          {getIcon(trigger.kind)}
          <span className="truncate">{trigger.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">
            {trigger.description}
          </span>
        </div>
      </div>
    </Card>
  );
}

interface AgentBuilderTriggersBlockProps {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
}

export function AgentBuilderTriggersBlock({
  owner,
  agentConfigurationId,
}: AgentBuilderTriggersBlockProps) {
  const { triggers, isTriggersLoading, mutateTriggers } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationId,
  });
  const sendNotification = useSendNotification();
  const [editingTrigger, setEditingTrigger] = useState<{
    trigger: LightTriggerType;
    index: number;
  } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleTriggerEdit = (trigger: LightTriggerType, index: number) => {
    setEditingTrigger({ trigger, index });
  };

  const handleCreateTrigger = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingTrigger(null);
    setIsCreateModalOpen(false);
  };

  const handleTriggerRemove = async (trigger: LightTriggerType) => {
    if (!trigger.sId || !agentConfigurationId) {
      return;
    }

    const res = await fetch(
      `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${trigger.sId}`,
      {
        method: "DELETE",
      }
    );

    if (res.ok) {
      void mutateTriggers();
      sendNotification({
        type: "success",
        title: `Successfully deleted ${trigger.name}`,
        description: `Trigger "${trigger.name}" was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to delete trigger",
        description: `Error: ${errorData.message}`,
      });
    }
  };

  return (
    <AgentBuilderSectionContainer
      title="Triggers"
      description="Triggers agent execution based on events."
      headerActions={
        triggers.length > 0 ? (
          <TriggerSelectorDropdown onCreateTrigger={handleCreateTrigger} />
        ) : undefined
      }
    >
      <div className="flex-1">
        {isTriggersLoading ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : triggers.length === 0 ? (
          <EmptyCTA
            action={
              <TriggerSelectorDropdown onCreateTrigger={handleCreateTrigger} />
            }
            className="pb-5"
            style={BACKGROUND_IMAGE_STYLE_PROPS}
          />
        ) : (
          <CardGrid>
            {triggers.map((trigger, index) => (
              <TriggerCard
                key={trigger.sId || index}
                trigger={trigger}
                onRemove={() => handleTriggerRemove(trigger)}
                onEdit={() => handleTriggerEdit(trigger, index)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      {/* Create/Edit Schedule Modal */}
      <CreateScheduleModal
        trigger={editingTrigger?.trigger}
        isOpen={editingTrigger !== null || isCreateModalOpen}
        onClose={handleCloseModal}
        workspaceId={owner.sId}
        agentConfigurationId={agentConfigurationId || ""}
      />
    </AgentBuilderSectionContainer>
  );
}
