import type {
  GetGoTemplateDraftResponseBody,
  GoTemplateAttachment,
  GoTemplateAttachmentError,
} from "@app/lib/api/assistant/go_template_types";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  getConversationDraftBySlug,
  isHttpsUrl,
} from "@app/lib/contentful/client";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type { GetGoTemplateDraftResponseBody } from "@app/lib/api/assistant/go_template_types";
export {
  GetGoTemplateDraftResponseBodySchema,
  GoTemplateApiErrorBodySchema,
} from "@app/lib/api/assistant/go_template_types";

export type GoTemplateError =
  | { type: "template_not_found"; slug: string }
  | { type: "contentful_fetch_failed" };

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
