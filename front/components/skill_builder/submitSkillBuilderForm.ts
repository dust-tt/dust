import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { clientFetch } from "@app/lib/egress/client";
import type { PostSkillResponseBody } from "@app/pages/api/w/[wId]/skills";
import type { PatchSkillResponseBody } from "@app/pages/api/w/[wId]/skills/[sId]";
import type { Result, UserType, WorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export async function submitSkillBuilderForm({
  formData,
  owner,
  skillId,
  currentEditors = [],
}: {
  formData: SkillBuilderFormData;
  owner: WorkspaceType;
  skillId?: string;
  currentEditors?: UserType[];
}): Promise<
  Result<
    PostSkillResponseBody["skill"] | PatchSkillResponseBody["skill"],
    Error
  >
> {
  try {
    const endpoint = skillId
      ? `/api/w/${owner.sId}/skills/${skillId}`
      : `/api/w/${owner.sId}/skills`;

    const method = skillId ? "PATCH" : "POST";

    const response = await clientFetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formData.name,
        agentFacingDescription: formData.agentFacingDescription,
        userFacingDescription: formData.userFacingDescription,
        instructions: formData.instructions,
        icon: formData.icon,
        extendedSkillId: formData.extendedSkillId,
        tools: formData.tools.map((tool) => ({
          mcpServerViewId: tool.configuration.mcpServerViewId,
        })),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Err(
        new Error(
          errorData.error?.message ??
            (skillId ? "Failed to update skill" : "Failed to create skill")
        )
      );
    }

    const result: PostSkillResponseBody | PatchSkillResponseBody =
      await response.json();

    const { skill } = result;

    // Only sync editors for existing skills (updates), not for newly created skills
    // When creating a skill, the backend automatically adds the creator to the editors group
    if (skillId) {
      const desiredEditorIds = new Set(formData.editors.map((e) => e.sId));
      const currentEditorIds = new Set(currentEditors.map((e) => e.sId));

      const addEditorIds: string[] = [];
      const removeEditorIds: string[] = [];

      // Add editors who are in desired but not in current
      for (const editor of formData.editors) {
        if (!currentEditorIds.has(editor.sId)) {
          addEditorIds.push(editor.sId);
        }
      }

      // Remove editors who are in current but not in desired
      for (const editor of currentEditors) {
        if (!desiredEditorIds.has(editor.sId)) {
          removeEditorIds.push(editor.sId);
        }
      }

      if (addEditorIds.length > 0 || removeEditorIds.length > 0) {
        const editorsResponse = await clientFetch(
          `/api/w/${owner.sId}/skills/${skill.sId}/editors`,
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

        if (!editorsResponse.ok) {
          const errorData = await editorsResponse.json();
          return new Err(
            new Error(
              errorData.error?.message ?? "Failed to update skill editors"
            )
          );
        }
      }
    }

    return new Ok(skill);
  } catch (error) {
    const normalizedError = normalizeError(error);
    return new Err(
      new Error(
        `Unexpected error ${skillId ? "updating" : "creating"} skill: ${normalizedError.message}`
      )
    );
  }
}
