import { DustPodConfigurationSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { z } from "zod";

export const PodMemberRoleSchema = z.enum(["member", "editor"]);

export const PodAccessSchema = z.enum(["restricted", "open"]);

export const PodMembersToAddSchema = z.record(z.string(), PodMemberRoleSchema);

export const PodMembersToRemoveSchema = z.array(z.string());

export const PodManagerUpdateMembersInputSchema = z.object({
  membersToAdd: PodMembersToAddSchema.optional(),
  membersToRemove: PodMembersToRemoveSchema.optional(),
  dustPod: DustPodConfigurationSchema.optional(),
});

export const PodManagerEditInformationInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  access: PodAccessSchema.optional(),
  pinnedFramePath: z.string().nullable().optional(),
  dustPod: DustPodConfigurationSchema.optional(),
});

export const PodManagerMoveConversationInputSchema = z.object({
  destination: z.enum(["pod", "personal"]),
  conversationId: z.string().optional(),
  dustPod: DustPodConfigurationSchema.optional(),
});

export type PodMemberRole = z.infer<typeof PodMemberRoleSchema>;
export type PodAccess = z.infer<typeof PodAccessSchema>;
export type PodMembersToAdd = z.infer<typeof PodMembersToAddSchema>;
export type PodManagerUpdateMembersInput = z.infer<
  typeof PodManagerUpdateMembersInputSchema
>;
export type PodManagerEditInformationInput = z.infer<
  typeof PodManagerEditInformationInputSchema
>;
export type PodManagerMoveConversationInput = z.infer<
  typeof PodManagerMoveConversationInputSchema
>;

export function isPodManagerUpdateMembersInput(
  input: Record<string, unknown>
): input is PodManagerUpdateMembersInput {
  return PodManagerUpdateMembersInputSchema.safeParse(input).success;
}

export function isPodManagerEditInformationInput(
  input: Record<string, unknown>
): input is PodManagerEditInformationInput {
  return PodManagerEditInformationInputSchema.safeParse(input).success;
}

export function isPodManagerMoveConversationInput(
  input: Record<string, unknown>
): input is PodManagerMoveConversationInput {
  return PodManagerMoveConversationInputSchema.safeParse(input).success;
}

export function partitionMembersToAdd(membersToAdd: PodMembersToAdd): {
  editorIds: string[];
  memberIds: string[];
} {
  const editorIds: string[] = [];
  const memberIds: string[] = [];

  for (const [userId, role] of Object.entries(membersToAdd)) {
    if (role === "editor") {
      editorIds.push(userId);
    } else {
      memberIds.push(userId);
    }
  }

  return { editorIds, memberIds };
}
