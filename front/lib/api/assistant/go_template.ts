import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  getConversationDraftBySlug,
  isHttpsUrl,
} from "@app/lib/contentful/client";
import type { SupportedFileContentType } from "@app/types/files";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export type GoTemplateAttachment = {
  fileId: string;
  name: string;
  contentType: SupportedFileContentType;
  size: number;
  url: string;
};

export type GoTemplateAttachmentError = {
  url: string;
  message: string;
};

export type GoTemplateError =
  | { type: "template_not_found"; slug: string }
  | { type: "contentful_fetch_failed" };

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

export async function resolveGoTemplateDraft(
  auth: Authenticator,
  slug: string
): Promise<Result<GetGoTemplateDraftResponseBody, GoTemplateError>> {
  const templateResult = await getConversationDraftBySlug(slug);
  if (templateResult.isErr()) {
    return new Err({ type: "contentful_fetch_failed" });
  }

  const template = templateResult.value;
  if (!template) {
    return new Err({ type: "template_not_found", slug });
  }

  const attachments: GoTemplateAttachment[] = [];
  const attachmentErrors: GoTemplateAttachmentError[] = [];

  for (const attachment of template.attachments) {
    const { url } = attachment;
    if (!isHttpsUrl(url)) {
      attachmentErrors.push({
        url,
        message: "Only public HTTPS URLs are supported.",
      });
      continue;
    }

    const uploadResult = await processAndStoreFromUrl(auth, {
      url,
      useCase: "conversation",
      fileName: attachment.fileName,
      contentType: attachment.contentType ?? undefined,
    });

    if (uploadResult.isErr()) {
      attachmentErrors.push({
        url,
        message: uploadResult.error.message,
      });
      continue;
    }

    const file = uploadResult.value;
    const contentType = file.contentType;
    if (!isSupportedFileContentType(contentType)) {
      attachmentErrors.push({
        url,
        message: `Unsupported content type: ${contentType}`,
      });
      continue;
    }

    attachments.push({
      fileId: file.sId,
      name: file.fileName,
      contentType,
      size: file.fileSize,
      url,
    });
  }

  return new Ok({
    title: template.title,
    prompt: template.prompt,
    attachments,
    attachmentErrors,
  });
}
