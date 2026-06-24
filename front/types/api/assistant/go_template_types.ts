import { z } from "zod";

const GoTemplateAttachmentSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number(),
  url: z.string(),
});

const GoTemplateAttachmentErrorSchema = z.object({
  url: z.string(),
  message: z.string(),
});

export type GoTemplateAttachment = z.infer<typeof GoTemplateAttachmentSchema>;
export type GoTemplateAttachmentError = z.infer<
  typeof GoTemplateAttachmentErrorSchema
>;

export const GetGoTemplateDraftResponseBodySchema = z.object({
  title: z.string(),
  prompt: z.string(),
  attachments: z.array(GoTemplateAttachmentSchema),
  attachmentErrors: z.array(GoTemplateAttachmentErrorSchema),
});

export const GoTemplateApiErrorBodySchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

/**
 * @swaggerschema GetGoTemplateDraftResponseBody (swagger_private_schemas.ts)
 */
export type GetGoTemplateDraftResponseBody = z.infer<
  typeof GetGoTemplateDraftResponseBodySchema
>;
