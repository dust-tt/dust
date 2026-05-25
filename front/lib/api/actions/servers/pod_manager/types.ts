import { DustProjectConfigurationSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { z } from "zod";

export const PodManagerUpdateMembersInputSchema = z.object({
  addMemberIds: z.array(z.string()).optional(),
  removeMemberIds: z.array(z.string()).optional(),
  dustPod: DustProjectConfigurationSchema.optional(),
});

export type PodManagerUpdateMembersInput = z.infer<
  typeof PodManagerUpdateMembersInputSchema
>;

export function isPodManagerUpdateMembersInput(
  input: Record<string, unknown>
): input is PodManagerUpdateMembersInput {
  return PodManagerUpdateMembersInputSchema.safeParse(input).success;
}
