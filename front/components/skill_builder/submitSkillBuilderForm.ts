import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { clientFetch } from "@app/lib/egress/client";
import type {
  PatchSkillResponseBody,
  PostSkillResponseBody,
} from "@app/types/api/skills";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightUserType, WorkspaceType } from "@app/types/user";

type SubmittedSkill =
  | PostSkillResponseBody["skill"]
  | PatchSkillResponseBody["skill"];

export interface SubmitSkillBuilderFormResult {
  skill: SubmittedSkill;
  /**
   * Set when the skill itself was saved but its editors could not be. Reported apart from the
   * `Err` channel so callers do not present a saved skill as a failed save.
   */
  editorsError: Error | null;
}

export async function submitSkillBuilderForm({
  formData,
  owner,
  skillId,
  currentEditors = [],
}: {
  formData: SkillBuilderFormData;
  owner: Pick<WorkspaceType, "sId">;
  skillId?: string;
  /**
   * The editors the skill has before this save. On create the server seeds the editors group with
   * the creator alone, so callers pass the creator rather than an empty list.
   */
  currentEditors?: LightUserType[];
}): Promise<Result<SubmitSkillBuilderFormResult, Error>> {
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
        instructionsHtml:
          formData.instructionsHtml.trim() === ""
            ? null
            : formData.instructionsHtml,
        icon: formData.icon,
        availability: formData.availability,
        reinforcement: formData.reinforcement,
        tools: formData.tools.map((tool) => ({
          mcpServerViewId: tool.configuration.mcpServerViewId,
        })),
        fileAttachments: formData.fileAttachments.map((f) => ({
          fileId: f.fileId,
        })),
        attachedKnowledge: formData.attachedKnowledge ?? [],
        additionalRequestedSpaceIds: formData.additionalSpaces,
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

    // Editors live behind their own endpoint, so they need a second request whether we just created
    // the skill or updated it. `skill.sId` is used rather than `skillId` so this also addresses a
    // skill that did not exist a moment ago.
    const desiredEditorIds = new Set(formData.editors.map((e) => e.sId));
    const currentEditorIds = new Set(currentEditors.map((e) => e.sId));

    const addEditorIds = formData.editors
      .filter((editor) => !currentEditorIds.has(editor.sId))
      .map((editor) => editor.sId);
    const removeEditorIds = currentEditors
      .filter((editor) => !desiredEditorIds.has(editor.sId))
      .map((editor) => editor.sId);

    if (addEditorIds.length === 0 && removeEditorIds.length === 0) {
      return new Ok({ skill, editorsError: null });
    }

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
      return new Ok({
        skill,
        editorsError: new Error(
          errorData.error?.message ?? "Failed to update skill editors"
        ),
      });
    }

    return new Ok({ skill, editorsError: null });
  } catch (error) {
    const normalizedError = normalizeError(error);
    return new Err(
      new Error(
        `Unexpected error ${skillId ? "updating" : "creating"} skill: ${normalizedError.message}`
      )
    );
  }
}
