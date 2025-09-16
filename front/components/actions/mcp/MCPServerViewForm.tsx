import { Button, Input } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useUpdateMCPServerView } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types";

interface MCPServerViewFormProps {
  owner: LightWorkspaceType;
  mcpServerView: MCPServerViewType;
}

const MCPFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z.string().min(1, "Description is required."),
});

export type MCPFormType = z.infer<typeof MCPFormSchema>;

export function MCPServerViewForm({
  owner,
  mcpServerView,
}: MCPServerViewFormProps) {
  const form = useForm<MCPFormType>({
    resolver: zodResolver(MCPFormSchema),
    defaultValues: {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      name: mcpServerView.name || mcpServerView.server.name,
      description: getMcpServerViewDescription(mcpServerView),
    },
  });

  // Use the serverId from state for the hooks
  const { updateServerView } = useUpdateMCPServerView(owner, mcpServerView);

  const onSubmit = useCallback(
    async (values: MCPFormType) => {
      const updated = await updateServerView({
        name: values.name,
        description: values.description,
      });
      if (updated) {
        form.reset(values);
      }
    },
    [updateServerView, form]
  );

  return (
    <div className="space-y-5 text-foreground dark:text-foreground-night">
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <Input
                {...field}
                label="Name"
                isError={!!form.formState.errors.name}
                message={form.formState.errors.name?.message}
                placeholder={mcpServerView.server.name}
              />
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <>
              <Input
                {...field}
                label="Description"
                isError={!!form.formState.errors.description?.message}
                message={form.formState.errors.description?.message}
                placeholder={getMcpServerViewDescription(mcpServerView)}
              />
              <p className="text-xs text-gray-500 dark:text-gray-500-night">
                This is only for internal reference and is not shown to the
                model.
              </p>
            </>
          )}
        />
      </div>

      {form.formState.isDirty && (
        <div className="flex flex-row items-end justify-end gap-2">
          <Button
            variant="outline"
            label={"Cancel"}
            disabled={form.formState.isSubmitting}
            onClick={() => {
              form.reset();
            }}
          />

          <Button
            variant="highlight"
            label={form.formState.isSubmitting ? "Saving..." : "Save"}
            disabled={form.formState.isSubmitting}
            onClick={async (event: Event) => {
              event.preventDefault();
              void form.handleSubmit(onSubmit)();
            }}
          />
        </div>
      )}
    </div>
  );
}
