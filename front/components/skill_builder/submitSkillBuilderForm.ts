import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { clientFetch } from "@app/lib/egress/client";
import type { PostSkillConfigurationResponseBody } from "@app/pages/api/w/[wId]/assistant/skill_configurations";
import type { Result, UserType, WorkspaceType } from "@app/types";
import { Err, Ok } from "@app/types";

export async function submitSkillBuilderForm({
  formData,
  owner,
  user,
}: {
  formData: SkillBuilderFormData;
  owner: WorkspaceType;
  user: UserType;
}): Promise<
  Result<PostSkillConfigurationResponseBody["skillConfiguration"], Error>
> {
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
        scope: formData.scope,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    return new Err(
      new Error(errorData.error?.message ?? "Failed to create skill")
    );
  }

  const result: PostSkillConfigurationResponseBody = await response.json();

  const skillConfiguration = result.skillConfiguration;

  const desiredEditorIds = new Set(formData.editors.map((e) => e.sId));
  const creatorId = user.sId;

  const addEditorIds: string[] = [];
  const removeEditorIds: string[] = [];

  for (const editor of formData.editors) {
    if (editor.sId !== creatorId) {
      addEditorIds.push(editor.sId);
    }
  }

  if (!desiredEditorIds.has(creatorId)) {
    removeEditorIds.push(creatorId);
  }

  if (addEditorIds.length > 0 || removeEditorIds.length > 0) {
    await clientFetch(
      `/api/w/${owner.sId}/assistant/skill_configurations/${skillConfiguration.id}/editors`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          addEditorIds,
          removeEditorIds,
        }),
      }
    );
  }

  return new Ok(skillConfiguration);
}
