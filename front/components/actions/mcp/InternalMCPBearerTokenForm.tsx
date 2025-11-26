import { CollapsibleComponent, Input } from "@dust-tt/sparkle";
import { useFieldArray, useFormContext } from "react-hook-form";

import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { McpServerHeaders } from "@app/components/actions/mcp/MCPServerHeaders";

export function InternalMCPBearerTokenForm() {
  const form = useFormContext<MCPServerFormValues>();
  const { fields, replace } = useFieldArray<
    MCPServerFormValues,
    "customHeaders"
  >({
    name: "customHeaders",
  });

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <CollapsibleComponent
        triggerChildren={<div className="heading-lg">Authorization</div>}
        contentChildren={
          <div className="space-y-2">
            <Input
              {...form.register("sharedSecret")}
              label="Bearer Token"
              isError={!!form.formState.errors.sharedSecret}
              message={form.formState.errors.sharedSecret?.message}
              placeholder="Paste the Bearer Token here"
            />
            <p className="text-xs text-gray-500 dark:text-gray-500-night">
              This will be sent alongside the request as a Bearer token in the
              Authorization header.
            </p>
          </div>
        }
      />
      <CollapsibleComponent
        triggerChildren={<div className="heading-lg">Headers</div>}
        contentChildren={
          <div className="space-y-2">
            <McpServerHeaders
              headers={fields.map(({ key, value }) => ({ key, value }))}
              onHeadersChange={(rows) => replace(rows)}
            />
          </div>
        }
      />
    </div>
  );
}
