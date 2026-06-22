import { DustPodConfigurationSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { z } from "zod";

export const PodMemberRoleSchema = z.enum(["member", "editor"]);

export const PodMembersToAddSchema = z.record(z.string(), PodMemberRoleSchema);

export const PodMembersToRemoveSchema = z.array(z.string());

export const PodManagerUpdateMembersInputSchema = z.object({
  membersToAdd: PodMembersToAddSchema.optional(),
  membersToRemove: PodMembersToRemoveSchema.optional(),
  dustPod: DustPodConfigurationSchema.optional(),
});

export type PodMemberRole = z.infer<typeof PodMemberRoleSchema>;
export type PodMembersToAdd = z.infer<typeof PodMembersToAddSchema>;
export type PodManagerUpdateMembersInput = z.infer<
  typeof PodManagerUpdateMembersInputSchema
>;

export function isPodManagerUpdateMembersInput(
  input: Record<string, unknown>
): input is PodManagerUpdateMembersInput {
  return PodManagerUpdateMembersInputSchema.safeParse(input).success;
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
