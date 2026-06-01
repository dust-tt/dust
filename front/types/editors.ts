import { z } from "zod";

// Required fields match LightMemberType; extra UserType fields are optional so
// that both full editors (from the editors API) and light members (from the
// trimmed search endpoint) pass validation.
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
  email: z.string().optional(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  lastLoginAt: z.number().nullable().optional(),
});
