import { z } from "zod";

export const importFormSchema = z.object({
  repoUrl: z.string().min(1),
});

export type ImportFormValues = z.infer<typeof importFormSchema>;
