import { actionSchema } from "@app/components/shared/tools_picker/types";
import { SKILL_REINFORCEMENT_MODES } from "@app/types/assistant/skill_configuration";
import { editorUserSchema } from "@app/types/editors";
import {
  isSupportedFileContentType,
  type SupportedFileContentType,
} from "@app/types/files";
import { createContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

const AGENT_FACING_DESCRIPTION_MAX_LENGTH = 750;

export const attachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});
export type AttachedKnowledgeFormData = z.infer<typeof attachedKnowledgeSchema>;

const persistedFileAttachmentSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
});

const pendingFileAttachmentSchema = z.object({
  fileId: z.null(),
  fileName: z.string(),
  file: z.custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File,
    "File is required"
  ),
  contentType: z.custom<SupportedFileContentType>(
    (value) => typeof value === "string" && isSupportedFileContentType(value),
    "Unsupported file type"
  ),
});

const fileAttachmentSchema = z.union([
  persistedFileAttachmentSchema,
  pendingFileAttachmentSchema,
]);

export const skillBuilderFormSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Skill name is required")),
  agentFacingDescription: z
    .string()
    .min(1, "Description of when to use the skill is required")
    .max(
      AGENT_FACING_DESCRIPTION_MAX_LENGTH,
      `Description must be ${AGENT_FACING_DESCRIPTION_MAX_LENGTH} characters or less`
    ),
  userFacingDescription: z.string().min(1, "Skill description is required"),
  instructions: z.string().min(1, "Skill instructions are required"),
  instructionsHtml: z.string(),
  editors: z.array(editorUserSchema),
  tools: z.array(actionSchema),
  icon: z.string().nullable(),
  extendedSkillId: z.string().nullable(),
  isDefault: z.boolean(),
  reinforcement: z.enum(SKILL_REINFORCEMENT_MODES),
  fileAttachments: z.array(fileAttachmentSchema),
  attachedKnowledge: z.array(attachedKnowledgeSchema).optional(),
  additionalSpaces: z.array(z.string()),
});

export type SkillBuilderFormData = z.infer<typeof skillBuilderFormSchema>;

export type SkillBuilderFileAttachment =
  SkillBuilderFormData["fileAttachments"][number];

export type PendingSkillBuilderFileAttachment = Extract<
  SkillBuilderFileAttachment,
  { fileId: null }
>;

export type PersistedSkillBuilderFileAttachment = Extract<
  SkillBuilderFileAttachment,
  { fileId: string }
>;

export function isPendingSkillBuilderFileAttachment(
  attachment: SkillBuilderFileAttachment
): attachment is PendingSkillBuilderFileAttachment {
  return attachment.fileId === null;
}

export const SkillBuilderFormContext =
  createContext<UseFormReturn<SkillBuilderFormData> | null>(null);
