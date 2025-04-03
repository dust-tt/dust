import { z } from "zod";

export const ValidateActionSchema = z.object({
  actionId: z.number(),
  approved: z.boolean(),
});

export type ValidateActionResponse = {
  success: boolean;
};

export function getActionChannel(id: number): string {
  return `action-${id}`;
}