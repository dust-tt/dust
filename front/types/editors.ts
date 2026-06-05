import { z } from "zod";

export const editorUserSchema = z.object({
  sId: z.string(),
  fullName: z.string(),
  image: z.string().nullable(),
  id: z.number().optional(),
  createdAt: z.number().optional(),
  provider: z
    .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
    .nullable()
    .optional(),
  username: z.string().optional(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  lastLoginAt: z.number().nullable().optional(),
});
