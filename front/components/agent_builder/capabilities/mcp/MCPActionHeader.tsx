import { Button, Input, MoreIcon, Popover } from "@dust-tt/sparkle";
import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type {
  AgentBuilderAction,
  MCPFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface MCPActionHeaderProps {
  mcpServerView: MCPServerViewType;
  action: AgentBuilderAction;
  allowNameEdit?: boolean;
}

export function MCPActionHeader({
  mcpServerView,
  action,
  allowNameEdit = false,
}: MCPActionHeaderProps) {
  const form = useFormContext<MCPFormData>();
  const {
    field: nameField,
    fieldState: { error: nameError },
  } = useController<MCPFormData, "name">({
    name: "name",
  });

  // Keep the original name so that if a user closes the popover without
  // fixing the validation error, we can revert it to the original name.
  const [originalName, setOriginalName] = useState(nameField.value);

  const handleNameChange = (newName: string) => {
    form.setValue("name", newName, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const newAction = {
    ...action,
    name: nameField.value,
  };

  return (
    <div className="flex w-full flex-row items-center justify-between">
      <div className="items-top flex flex-col gap-3 sm:flex-row">
        {getAvatar(mcpServerView.server, "md")}
        <div className="flex grow flex-col gap-0 pr-9">
          <h2 className="heading-lg line-clamp-1 text-foreground dark:text-foreground-night">
            {getMcpServerViewDisplayName(mcpServerView, newAction)}
          </h2>
          <div className="line-clamp-1 overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
            {mcpServerView.server.description}
          </div>
        </div>
      </div>
      {allowNameEdit && (
        <Popover
          trigger={
            <Button
              icon={MoreIcon}
              size="sm"
              variant="ghost"
              onClick={() => {
                setOriginalName(nameField.value);
              }}
            />
          }
          popoverTriggerAsChild
          content={
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-end gap-2">
                <div className="w-full grow text-sm font-bold text-muted-foreground dark:text-muted-foreground-night">
                  Name of the tool
                </div>
              </div>
              <Input
                name="actionName"
                placeholder="My tool name…"
                value={nameField.value}
                onChange={(e) => {
                  handleNameChange(e.target.value);
                }}
                onBlur={() => {
                  if (nameError) {
                    handleNameChange(originalName);
                  }
                }}
                message={nameError?.message}
                messageStatus="error"
                className="text-sm"
              />
            </div>
          }
        />
      )}
    </div>
  );
}
