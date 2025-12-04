import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { clientFetch } from "@app/lib/egress";
import type { SkillConfigurationType } from "@app/pages/api/w/[wId]/assistant/skill_configurations";
import type { Result, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

export async function submitSkillBuilderForm({
  formData,
  owner,
}: {
  formData: SkillBuilderFormData;
  owner: WorkspaceType;
}): Promise<Result<SkillConfigurationType, Error>> {
  const response = await clientFetch(
    `/api/w/${owner.sId}/assistant/skill_configurations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formData.name,
        description: formData.description,
        instructions: formData.instructions,
        scope: "private",
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    return new Err(
      new Error(errorData.error?.message ?? "Failed to create skill")
    );
  }

  const result: { skillConfiguration: SkillConfigurationType } =
    await response.json();

  return new Ok(result.skillConfiguration);
}
