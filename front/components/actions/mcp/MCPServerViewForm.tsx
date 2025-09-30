import { Input } from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

import type { InfoFormValues } from "@app/components/actions/mcp/forms/infoFormSchema";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";

interface MCPServerViewFormProps {
  mcpServerView: MCPServerViewType;
}

export function MCPServerViewForm({ mcpServerView }: MCPServerViewFormProps) {
  const form = useFormContext<InfoFormValues>();

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Input
            {...form.register("name")}
            label="Name"
            isError={!!form.formState.errors.name}
            message={form.formState.errors.name?.message}
            placeholder={mcpServerView.server.name}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Input
          {...form.register("description")}
          label="Description"
          isError={!!form.formState.errors.description?.message}
          message={form.formState.errors.description?.message}
          placeholder={getMcpServerViewDescription(mcpServerView)}
        />
        <p className="text-xs text-gray-500 dark:text-gray-500-night">
          This is only for internal reference and is not shown to the model.
        </p>
      </div>
    </div>
  );
}
