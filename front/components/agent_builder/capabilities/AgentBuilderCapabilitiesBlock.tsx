import {
  Avatar,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyCTA,
  Input,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useController, useFieldArray } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AddKnowledgeDropdown } from "@app/components/agent_builder/capabilities/AddKnowledgeDropdown";
import { AddToolsDropdown } from "@app/components/agent_builder/capabilities/AddToolsDropdown";
import { CapabilitiesConfigurationSheet } from "@app/components/agent_builder/capabilities/knowledge/CapabilitiesConfigurationSheet";
import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { KnowledgeServerName } from "@app/components/agent_builder/types";
import { isKnowledgeServerName } from "@app/components/agent_builder/types";
import { useAgentBuilderTools } from "@app/hooks/useAgentBuilderTools";
import { getActionSpecification } from "@app/lib/actions/utils";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import logger from "@app/logger/logger";
import {
  EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

function ActionCard({
  action,
  onRemove,
  onEdit,
}: {
  action: AgentBuilderAction;
  onRemove: () => void;
  onEdit?: () => void;
}) {
  const spec = getActionSpecification(action.type);

  if (!spec) {
    return null;
  }

  return (
    <Card
      variant="primary"
      className="max-h-40"
      onClick={onEdit}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            onRemove();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <Avatar icon={spec.cardIcon} size="xs" />
          <div className="w-full truncate">{action.name}</div>
        </div>
        <div className="line-clamp-4 text-muted-foreground dark:text-muted-foreground-night">
          <p>{action.description}</p>
        </div>
      </div>
    </Card>
  );
}

function MaxStepsPerRunSettings() {
  const { owner } = useAgentBuilderContext();
  const { hasFeature, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { field } = useController<AgentBuilderFormData, "maxStepsPerRun">({
    name: "maxStepsPerRun",
  });

  const hasExtendedFeature = hasFeature("extended_max_steps_per_run");
  const maxLimit = hasExtendedFeature
    ? EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT
    : MAX_STEPS_USE_PER_RUN_LIMIT;

  const displayLabel = isFeatureFlagsLoading
    ? "Max steps settings"
    : `Max steps settings (up to ${maxLimit})`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={displayLabel}
          variant="outline"
          size="sm"
          isSelect
          disabled={isFeatureFlagsLoading}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 p-2" align="end">
        <DropdownMenuLabel
          label={
            isFeatureFlagsLoading
              ? "Loading..."
              : `Max steps per run (up to ${maxLimit})`
          }
        />
        <Input
          value={field.value?.toString() ?? ""}
          placeholder="10"
          name="maxStepsPerRun"
          disabled={isFeatureFlagsLoading}
          onChange={(e) => {
            const value = parseInt(e.target.value);
            if (!isNaN(value) && value >= 1 && value <= maxLimit) {
              field.onChange(value);
            }
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AgentBuilderCapabilitiesBlock() {
  const { fields, remove, append, update } = useFieldArray<
    AgentBuilderFormData,
    "actions"
  >({
    name: "actions",
  });

  const { mcpServerViewsWithKnowledge } = useAgentBuilderTools();
  const [editingAction, setEditingAction] = useState<{
    action: AgentBuilderAction;
    index: number;
  } | null>(null);

  const [openSheet, setOpenSheet] = useState<KnowledgeServerName | null>(null);

  const handleEditSave = (updatedAction: AgentBuilderAction) => {
    if (editingAction) {
      update(editingAction.index, updatedAction);
    } else {
      append(updatedAction);
    }
    setEditingAction(null);
  };

  const handleActionEdit = (action: AgentBuilderAction, index: number) => {
    setEditingAction({ action, index });

    switch (action.type) {
      case "SEARCH":
        setOpenSheet("search");
        break;
      case "INCLUDE_DATA":
        setOpenSheet("include_data");
        break;
      case "EXTRACT_DATA":
        setOpenSheet("extract_data");
        break;
    }
  };

  const handleCloseSheet = () => {
    setOpenSheet(null);
    setEditingAction(null);
  };

  const handleKnowledgeAdd = (serverName: string) => {
    setEditingAction(null);
    if (isKnowledgeServerName(serverName)) {
      setOpenSheet(serverName);
    } else {
      logger.warn({ serverName }, "Unknown knowledge server");
    }
  };

  const dropdownButtons = (
    <>
      <AddKnowledgeDropdown
        mcpServerViewsWithKnowledge={mcpServerViewsWithKnowledge}
        onItemClick={handleKnowledgeAdd}
      />
      <AddToolsDropdown tools={fields} addTools={append} />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Tools & Capabilities</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Add tools and capabilities to enhance your agent's abilities.
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            {fields.length > 0 && dropdownButtons}
            <MaxStepsPerRunSettings />
          </div>
        </div>
      </div>
      <div className="flex-1">
        {fields.length === 0 ? (
          <EmptyCTA
            message="No tools added yet. Add knowledge and tools to enhance your agent's capabilities."
            action={
              <div className="flex items-center gap-2">{dropdownButtons}</div>
            }
          />
        ) : (
          <CardGrid>
            {fields.map((field, index) => (
              <ActionCard
                key={field.id}
                action={field as AgentBuilderAction}
                onRemove={() => remove(index)}
                onEdit={() =>
                  handleActionEdit(field as AgentBuilderAction, index)
                }
              />
            ))}
          </CardGrid>
        )}
      </div>

      <CapabilitiesConfigurationSheet
        capability={openSheet}
        isOpen={openSheet !== null}
        onClose={handleCloseSheet}
        onSave={handleEditSave}
        action={editingAction?.action}
      />
    </div>
  );
}
