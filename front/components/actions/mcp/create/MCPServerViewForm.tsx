import type { MCPServerFormValues } from "@app/components/actions/mcp/forms/mcpServerFormSchema";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { CheckBoxWithTextAndDescription, Input } from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

interface MCPServerViewFormProps {
  mcpServerView: MCPServerViewType;
  confirmSkillsRestrictionChange?: (
    isRestrictedToSkills: boolean
  ) => Promise<boolean>;
}

export function MCPServerViewForm({
  mcpServerView,
  confirmSkillsRestrictionChange,
}: MCPServerViewFormProps) {
  const form = useFormContext<MCPServerFormValues>();
  const { field: isRestrictedToSkillsField } = useController({
    name: "isRestrictedToSkills",
    control: form.control,
  });

  const handleSkillsRestrictionChange = async (
    isRestrictedToSkills: boolean
  ) => {
    if (confirmSkillsRestrictionChange) {
      const confirmed =
        await confirmSkillsRestrictionChange(isRestrictedToSkills);
      if (!confirmed) {
        return;
      }
    }

    isRestrictedToSkillsField.onChange(isRestrictedToSkills);
  };

  return (
    <div className="space-y-5 text-foreground">
      <div className="flex items-end space-x-2">
        <div className="flex-grow">
          <Input
            {...form.register("name")}
            label="Name"
            isError={!!form.formState.errors.name}
            message={form.formState.errors.name?.message}
            messageStatus={form.formState.errors.name ? "error" : undefined}
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
      </div>

      <CheckBoxWithTextAndDescription
        text="Restrict this tool to skills"
        description="Use this when the tool should always be accompanied by workspace context or safety rules from a skill."
        checked={isRestrictedToSkillsField.value}
        onCheckedChange={(checked) => {
          void handleSkillsRestrictionChange(checked === true);
        }}
      />
    </div>
  );
}
