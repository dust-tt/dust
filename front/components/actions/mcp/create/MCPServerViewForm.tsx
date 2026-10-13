import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getMcpServerViewDisplayDescription } from "@app/lib/dust_provided_descriptions";
import { Input, Label, TextArea } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useFormContext } from "react-hook-form";

interface MCPServerViewFormProps {
  mcpServerView: MCPServerViewType;
}

export function MCPServerViewForm({ mcpServerView }: MCPServerViewFormProps) {
  const { t } = useLingui();
  const form = useFormContext<MCPServerFormValues>();

  return (
    <div className="space-y-5 text-foreground">
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Input
            {...form.register("name")}
            label={t`Name`}
            isError={!!form.formState.errors.name}
            message={form.formState.errors.name?.message}
            messageStatus={form.formState.errors.name ? "error" : undefined}
            placeholder={mcpServerView.server.name}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mcp-server-view-description">
          <Trans>Description</Trans>
        </Label>
        <TextArea
          id="mcp-server-view-description"
          {...form.register("description")}
          error={form.formState.errors.description?.message}
          showErrorLabel
          minRows={3}
          resize="vertical"
          placeholder={getMcpServerViewDisplayDescription(t, mcpServerView)}
        />
      </div>
    </div>
  );
}
