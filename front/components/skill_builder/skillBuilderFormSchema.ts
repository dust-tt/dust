import { actionSchema } from "@app/components/shared/tools_picker/types";
import {
  AGENT_FACING_DESCRIPTION_MAX_LENGTH,
  USER_FACING_DESCRIPTION_MAX_LENGTH,
} from "@app/lib/skills/labels";
import {
  SKILL_AVAILABILITIES,
  SKILL_REINFORCEMENT_MODES,
  SkillWithoutInstructionsAndToolsSchema,
} from "@app/types/assistant/skill_configuration";
import { editorUserSchema } from "@app/types/editors";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { z } from "zod";

const attachedKnowledgeSchema = z.object({
  dataSourceViewId: z.string(),
  nodeId: z.string(),
  spaceId: z.string(),
  title: z.string(),
});
export type AttachedKnowledgeFormData = z.infer<typeof attachedKnowledgeSchema>;

const {
  sId: skillIdSchema,
  name: skillNameSchema,
  icon: skillIconSchema,
  requestedSpaceIds: skillRequestedSpaceIdsSchema,
} = SkillWithoutInstructionsAndToolsSchema.shape;

const referencedSkillSchema = z.object({
  id: skillIdSchema,
  name: skillNameSchema,
  icon: skillIconSchema,
  requestedSpaceIds: skillRequestedSpaceIdsSchema,
});
export type ReferencedSkillFormData = z.infer<typeof referencedSkillSchema>;

const fileAttachmentSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
});

export function getSkillBuilderFormSchema(
  t: (descriptor: MessageDescriptor) => string
) {
  const getDescriptionTooLongMessage = (maxLength: number) =>
    t(msg`Description must be ${maxLength} characters or less`);

  return z.object({
    name: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(1, t(msg`Skill name is required`))),
    agentFacingDescription: z
      .string()
      .min(1, t(msg`Description of when to use the skill is required`))
      .max(
        AGENT_FACING_DESCRIPTION_MAX_LENGTH,
        getDescriptionTooLongMessage(AGENT_FACING_DESCRIPTION_MAX_LENGTH)
      ),
    userFacingDescription: z
      .string()
      .min(1, t(msg`Skill description is required`))
      .max(
        USER_FACING_DESCRIPTION_MAX_LENGTH,
        getDescriptionTooLongMessage(USER_FACING_DESCRIPTION_MAX_LENGTH)
      ),
    instructions: z.string().min(1, t(msg`Skill instructions are required`)),
    instructionsHtml: z.string(),
    editors: z.array(editorUserSchema),
    tools: z.array(actionSchema),
    icon: z.string().nullable(),
    availability: z.enum(SKILL_AVAILABILITIES),
    reinforcement: z.enum(SKILL_REINFORCEMENT_MODES),
    fileAttachments: z.array(fileAttachmentSchema),
    attachedKnowledge: z.array(attachedKnowledgeSchema).optional(),
    referencedSkills: z.array(referencedSkillSchema),
    additionalSpaces: z.array(z.string()),
  });
}

export type SkillBuilderFormData = z.infer<
  ReturnType<typeof getSkillBuilderFormSchema>
>;
