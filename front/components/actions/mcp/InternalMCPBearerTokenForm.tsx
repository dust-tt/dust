import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { McpServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";
import { getTokenFieldLabel } from "@app/lib/actions/mcp_internal_actions/server_token_labels";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
} from "@dust-tt/sparkle";
import { useFormContext, useWatch } from "react-hook-form";

interface InternalMCPBearerTokenFormProps {
  serverName?: string;
}

export function InternalMCPBearerTokenForm({
  serverName,
}: InternalMCPBearerTokenFormProps) {
  const form = useFormContext<MCPServerFormValues>();
  const customHeaders = useWatch<MCPServerFormValues, "customHeaders">({
    name: "customHeaders",
  });

  const { label, placeholder, tooltip } = getTokenFieldLabel(serverName);

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <Collapsible>
        <CollapsibleTrigger className="pb-2">
          <div className="heading-lg">Authorization</div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <Input
              {...form.register("sharedSecret")}
              label={label}
              isError={!!form.formState.errors.sharedSecret}
              message={form.formState.errors.sharedSecret?.message}
              placeholder={placeholder}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500-night">
              {tooltip}
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      <Collapsible>
        <CollapsibleTrigger className="pb-2">
          <div className="heading-lg">
            Headers ({(customHeaders ?? []).length})
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2">
            <McpServerHeaders />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
