import {
  Avatar,
  Card,
  CardActionButton,
  CardGrid,
  EmptyCTA,
  Page,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import type {
  AgentBuilderAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { AddKnowledgeDropdown } from "@app/components/agent_builder/capabilities/AddKnowledgeDropdown";
import { AddToolsDropdown } from "@app/components/agent_builder/capabilities/AddToolsDropdown";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

function ActionCard({
  action,
  onRemove,
}: {
  action: AgentBuilderAction;
  onRemove: () => void;
}) {
  const spec =
    action.type === "DATA_VISUALIZATION"
      ? DATA_VISUALIZATION_SPECIFICATION
      : null;

  if (!spec) {
    return null;
  }

  return (
    <Card
      variant="primary"
      className="max-h-40"
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

export function AgentBuilderCapabilitiesBlock() {
  const { field } = useController<AgentBuilderFormData, "actions">({
    name: "actions",
  });

  function removeAction(actionToRemove: AgentBuilderAction) {
    const updatedActions = field.value.filter(
      (action) => action.id !== actionToRemove.id
    );
    field.onChange(updatedActions);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Tools & Capabilities</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Add tools and capabilities to enhance your agent's abilities.
          </span>
        </Page.P>
        {field.value.length > 0 && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex items-center gap-2">
              <AddKnowledgeDropdown />
              <AddToolsDropdown />
            </div>
          </div>
        )}
      </div>
      <div className="flex-1">
        {field.value.length === 0 ? (
          <EmptyCTA
            message="No tools added yet. Add knowledge and tools to enhance your agent's capabilities."
            action={
              <div className="flex items-center gap-2">
                <AddKnowledgeDropdown />
                <AddToolsDropdown />
              </div>
            }
          />
        ) : (
          <CardGrid>
            {field.value.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onRemove={() => removeAction(action)}
              />
            ))}
          </CardGrid>
        )}
      </div>
    </div>
  );
}
