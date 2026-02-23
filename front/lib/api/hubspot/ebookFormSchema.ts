import type { TrackingParams } from "@app/lib/api/hubspot/contactFormSchema";

import { TrackingParamsSchema } from "@app/lib/api/hubspot/contactFormSchema";
import { z } from "zod";

export { type TrackingParams, TrackingParamsSchema };

// Zod validation schema for ebook form
export const EbookFormSchema = z.object({
  email: z
    .string()
    .min(1, "Work Email is required")
    .email("Please enter a valid email address"),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  company: z.string().optional(),
  jobtitle: z.string().optional(),
  consent_marketing: z.boolean().optional(),
});

export type EbookFormData = z.infer<typeof EbookFormSchema>;

export interface EbookSubmitResponse {
  success: boolean;
  downloadToken?: string;
  error?: string;
}
