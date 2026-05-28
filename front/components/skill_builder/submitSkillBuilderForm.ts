import {
  isPendingSkillBuilderFileAttachment,
  type PendingSkillBuilderFileAttachment,
  type PersistedSkillBuilderFileAttachment,
  type SkillBuilderFileAttachment,
  type SkillBuilderFormData,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { clientFetch } from "@app/lib/egress/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { FileUploadRequestResponseBody } from "@app/pages/api/w/[wId]/files";
import type { FileUploadedRequestResponseBody } from "@app/pages/api/w/[wId]/files/[fileId]";
import type { PostSkillResponseBody } from "@app/pages/api/w/[wId]/skills";
import type { PatchSkillResponseBody } from "@app/pages/api/w/[wId]/skills/[sId]";
import { type APIErrorType, isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserType, WorkspaceType } from "@app/types/user";

const SKILL_FILE_UPLOAD_CONCURRENCY = 4;
const PRE_COMMIT_SKILL_SAVE_ERROR_TYPES = new Set<APIErrorType>([
  "app_auth_error",
  "invalid_request_error",
  "skill_not_found",
]);
const JSON_HEADERS = { "Content-Type": "application/json" };

type SkillSaveResponseBody = PostSkillResponseBody | PatchSkillResponseBody;

type SubmitSkillBuilderFormResult = {
  formData: SkillBuilderFormData;
  skill: SkillSaveResponseBody["skill"];
  warnings: {
    message: string;
    type: "editors_update_failed";
  }[];
};

type UploadSkillFileAttachmentsResult = {
  attachments: PersistedSkillBuilderFileAttachment[];
  uploadedFileIds: string[];
};

type UploadedSkillFileAttachment = {
  attachment: PersistedSkillBuilderFileAttachment;
  uploadedFileId: string | null;
};

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
}): Promise<Result<SubmitSkillBuilderFormResult, Error>> {
  const uploadedAttachmentsRes = await uploadPendingSkillFileAttachments({
    attachments: formData.fileAttachments,
    owner,
    skillId,
  });
  if (uploadedAttachmentsRes.isErr()) {
    return new Err(uploadedAttachmentsRes.error);
  }

  const { attachments: persistedFileAttachments, uploadedFileIds } =
    uploadedAttachmentsRes.value;

  let persistedFormData: SkillBuilderFormData = {
    ...formData,
    fileAttachments: persistedFileAttachments,
  };

  const endpoint = skillId
    ? `/api/w/${owner.sId}/skills/${skillId}`
    : `/api/w/${owner.sId}/skills`;

  const method = skillId ? "PATCH" : "POST";

  let result: SkillSaveResponseBody;
  try {
    const response = await clientFetch(endpoint, {
      method,
      headers: JSON_HEADERS,
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
        extendedSkillId: formData.extendedSkillId,
        isDefault: formData.isDefault,
        ...(skillId ? { reinforcement: formData.reinforcement } : {}),
        tools: formData.tools.map((tool) => ({
          mcpServerViewId: tool.configuration.mcpServerViewId,
        })),
        fileAttachments: persistedFileAttachments.map((f) => ({
          fileId: f.fileId,
        })),
        attachedKnowledge: formData.attachedKnowledge ?? [],
        additionalRequestedSpaceIds: formData.additionalSpaces,
      }),
    });
    if (!response.ok) {
      let errorMessage = `Failed to ${skillId ? "update" : "create"} skill`;
      let shouldCleanupUploadedFiles = false;

      try {
        const errorData: unknown = await response.json();
        if (isAPIErrorResponse(errorData)) {
          errorMessage = errorData.error.message;
          shouldCleanupUploadedFiles = PRE_COMMIT_SKILL_SAVE_ERROR_TYPES.has(
            errorData.error.type
          );
        }
      } catch {
        // Keep the generic error message.
      }

      if (shouldCleanupUploadedFiles) {
        await cleanupUploadedFiles({ fileIds: uploadedFileIds, owner });
      }

      return new Err(new Error(errorMessage));
    }

    result = await response.json();
  } catch (error) {
    const normalizedError = normalizeError(error);
    return new Err(
      new Error(
        `Unexpected error ${skillId ? "updating" : "creating"} skill: ${normalizedError.message}`
      )
    );
  }

  const { skill } = result;
  const warnings: SubmitSkillBuilderFormResult["warnings"] = [];

  // Only sync editors for existing skills (updates), not for newly created skills.
  // When creating a skill, the backend automatically adds the creator to the editors group.
  if (skillId) {
    const desiredEditorIds = new Set(formData.editors.map((e) => e.sId));
    const currentEditorIds = new Set(currentEditors.map((e) => e.sId));

    const addEditorIds = formData.editors
      .filter((editor) => !currentEditorIds.has(editor.sId))
      .map((editor) => editor.sId);
    const removeEditorIds = currentEditors
      .filter((editor) => !desiredEditorIds.has(editor.sId))
      .map((editor) => editor.sId);

    if (addEditorIds.length > 0 || removeEditorIds.length > 0) {
      try {
        const editorsResponse = await clientFetch(
          `/api/w/${owner.sId}/skills/${skill.sId}/editors`,
          {
            method: "PATCH",
            headers: JSON_HEADERS,
            body: JSON.stringify({
              addEditorIds,
              removeEditorIds,
            }),
          }
        );
        if (!editorsResponse.ok) {
          let errorMessage = "Failed to update skill editors";
          try {
            const errorData: unknown = await editorsResponse.json();
            if (isAPIErrorResponse(errorData)) {
              errorMessage = errorData.error.message;
            }
          } catch {
            // Keep the generic error message.
          }

          throw new Error(errorMessage);
        }
      } catch (error) {
        const normalizedError = normalizeError(error);
        persistedFormData = {
          ...persistedFormData,
          editors: currentEditors,
        };
        warnings.push({
          type: "editors_update_failed",
          message: normalizedError.message || "Failed to update skill editors",
        });
      }
    }
  }

  return new Ok({ formData: persistedFormData, skill, warnings });
}

async function uploadPendingSkillFileAttachments({
  attachments,
  owner,
  skillId,
}: {
  attachments: SkillBuilderFileAttachment[];
  owner: WorkspaceType;
  skillId?: string;
}): Promise<Result<UploadSkillFileAttachmentsResult, Error>> {
  const uploadResults = await concurrentExecutor(
    attachments,
    async (attachment): Promise<Result<UploadedSkillFileAttachment, Error>> => {
      if (!isPendingSkillBuilderFileAttachment(attachment)) {
        return new Ok({
          attachment: {
            fileId: attachment.fileId,
            fileName: attachment.fileName,
          },
          uploadedFileId: null,
        });
      }

      const uploadRes = await uploadSkillFileAttachment({
        attachment,
        owner,
        skillId,
      });
      if (uploadRes.isErr()) {
        return uploadRes;
      }

      return new Ok({
        attachment: uploadRes.value,
        uploadedFileId: uploadRes.value.fileId,
      });
    },
    { concurrency: SKILL_FILE_UPLOAD_CONCURRENCY }
  );

  const persistedAttachments: PersistedSkillBuilderFileAttachment[] = [];
  const uploadedFileIds: string[] = [];
  const errors: Error[] = [];

  for (const result of uploadResults) {
    if (result.isErr()) {
      errors.push(result.error);
      continue;
    }

    persistedAttachments.push(result.value.attachment);
    if (result.value.uploadedFileId) {
      uploadedFileIds.push(result.value.uploadedFileId);
    }
  }

  if (errors.length > 0) {
    await cleanupUploadedFiles({ fileIds: uploadedFileIds, owner });

    const firstError = errors[0];
    if (!firstError) {
      return new Err(new Error("Failed to upload skill files."));
    }

    return new Err(
      new Error(
        errors.length === 1
          ? firstError.message
          : `${firstError.message} (${errors.length} files failed)`
      )
    );
  }

  return new Ok({ attachments: persistedAttachments, uploadedFileIds });
}

async function uploadSkillFileAttachment({
  attachment,
  owner,
  skillId,
}: {
  attachment: PendingSkillBuilderFileAttachment;
  owner: WorkspaceType;
  skillId?: string;
}): Promise<Result<PersistedSkillBuilderFileAttachment, Error>> {
  let fileIdToCleanup: string | null = null;

  try {
    const uploadRequestResponse = await clientFetch(
      `/api/w/${owner.sId}/files`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          contentType: attachment.contentType,
          fileName: attachment.fileName,
          fileSize: attachment.file.size,
          useCase: "skill_attachment",
          useCaseMetadata: skillId ? { skillId } : undefined,
        }),
      }
    );
    if (!uploadRequestResponse.ok) {
      let errorMessage = "Failed to create file upload";
      try {
        const errorData: unknown = await uploadRequestResponse.json();
        if (isAPIErrorResponse(errorData)) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Keep the generic error message.
      }

      throw new Error(errorMessage);
    }

    const uploadRequestBody: FileUploadRequestResponseBody =
      await uploadRequestResponse.json();
    const { file: fileUploadRequest } = uploadRequestBody;
    fileIdToCleanup = fileUploadRequest.sId;

    const uploadFormData = new FormData();
    uploadFormData.append("file", attachment.file);

    const uploadResponse = await clientFetch(fileUploadRequest.uploadUrl, {
      method: "POST",
      body: uploadFormData,
    });
    if (!uploadResponse.ok) {
      let errorMessage = "Failed to upload file content";
      try {
        const errorData: unknown = await uploadResponse.json();
        if (isAPIErrorResponse(errorData)) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Keep the generic error message.
      }

      throw new Error(errorMessage);
    }

    const uploadBody: FileUploadedRequestResponseBody =
      await uploadResponse.json();
    const { file: uploadedFile } = uploadBody;

    return new Ok({
      fileId: fileUploadRequest.sId,
      fileName: uploadedFile.fileName,
    });
  } catch (error) {
    if (fileIdToCleanup) {
      await cleanupUploadedFiles({
        fileIds: [fileIdToCleanup],
        owner,
      });
    }

    const normalizedError = normalizeError(error);
    return new Err(
      new Error(
        `Failed to upload file "${attachment.fileName}": ${normalizedError.message || "Unknown error"}`
      )
    );
  }
}

async function cleanupUploadedFiles({
  fileIds,
  owner,
}: {
  fileIds: string[];
  owner: WorkspaceType;
}): Promise<void> {
  if (fileIds.length === 0) {
    return;
  }

  await concurrentExecutor(
    fileIds,
    async (fileId) => {
      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/files/${fileId}`,
          {
            method: "DELETE",
            headers: JSON_HEADERS,
          }
        );
        if (!response.ok) {
          throw new Error("Failed to delete file");
        }
      } catch {
        // Best-effort cleanup only. Preserve the original save/upload error.
      }
    },
    { concurrency: SKILL_FILE_UPLOAD_CONCURRENCY }
  );
}
