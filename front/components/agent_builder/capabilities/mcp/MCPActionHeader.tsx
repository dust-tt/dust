import { Button, Input, MoreIcon, Popover } from "@dust-tt/sparkle";
import { useFormContext, useWatch } from "react-hook-form";

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
  const error = form.formState.errors.name;
  const newName = useWatch({ name: "name" });

  // Reset the form with default value if there is an error when popup is closed
  const onClose = () => {
    if (error) {
      form.setValue("name", form.formState.defaultValues?.name ?? "");
      form.clearErrors("name");
    }
  };

  const newAction = {
    ...action,
    name: newName,
  };

  return (
    <div className="flex w-full flex-col items-start gap-4">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        {getAvatar(mcpServerView.server, "md")}
        <div className="flex grow flex-col gap-0 pr-9">
          <h2 className="heading-base line-clamp-1 text-foreground dark:text-foreground-night">
            {getMcpServerViewDisplayName(mcpServerView, newAction)}
          </h2>
          <p className="overflow-hidden text-sm text-muted-foreground dark:text-muted-foreground-night">
            {mcpServerView.server.description}
          </p>
        </div>
      </div>
      {allowNameEdit && (
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-col items-end gap-2">
            <div className="w-full grow text-sm font-bold text-muted-foreground dark:text-muted-foreground-night">
              Name of the tool
            </div>
          </div>
          <Input
            {...form.register("name", {
              onChange: () => {
                void form.trigger("name");
              },
            })}
            placeholder="My tool name…"
            message={error?.message}
            messageStatus="error"
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}
