import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  GetGoTemplateDraftResponseBodySchema,
  GoTemplateApiErrorBodySchema,
} from "@app/lib/api/assistant/go_template_types";
import { clientFetch } from "@app/lib/egress/client";
import { useSearchParam } from "@app/lib/platform";
import { isSupportedFileContentType } from "@app/types/files";
import { useContext, useEffect, useRef } from "react";

/**
 * Reads the ?go= search param, fetches the corresponding Contentful template
 * draft, pre-fills the composer, attaches any template files, and cleans up
 * the param from the URL.
 */
export function useGoTemplateFromSearchParam(workspaceId: string) {
  const goSlug = useSearchParam("go");
  const { setPendingInputText, fileUploaderService, setIsLoadingGoTemplate } =
    useContext(InputBarContext);
  const sendNotification = useSendNotification();
  const loadedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (!goSlug) {
      setIsLoadingGoTemplate(false);
      return;
    }

    if (loadedSlugRef.current === goSlug) {
      setIsLoadingGoTemplate(false);
      return;
    }

    let cancelled = false;
    setIsLoadingGoTemplate(true);

    const loadTemplate = async () => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/go-template?slug=${encodeURIComponent(goSlug)}`
        );

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          let message = "This link template could not be loaded.";
          try {
            const body = GoTemplateApiErrorBodySchema.safeParse(
              await response.json()
            );
            if (body.success && body.data.error?.message) {
              message = body.data.error.message;
            }
          } catch {
            // Keep default message.
          }
          sendNotification({
            type: "error",
            title: "Template unavailable",
            description: message,
          });
          return;
        }

        const parsed = GetGoTemplateDraftResponseBodySchema.safeParse(
          await response.json()
        );
        if (!parsed.success) {
          sendNotification({
            type: "error",
            title: "Template unavailable",
            description: "This link template could not be loaded.",
          });
          return;
        }

        const draft = parsed.data;
        loadedSlugRef.current = goSlug;

        fileUploaderService.resetUpload();
        setPendingInputText(draft.prompt, { replace: true });

        for (const attachment of draft.attachments) {
          if (!isSupportedFileContentType(attachment.contentType)) {
            continue;
          }
          fileUploaderService.addUploadedFile({
            fileId: attachment.fileId,
            filename: attachment.name,
            contentType: attachment.contentType,
            size: attachment.size,
            sourceUrl: attachment.url,
          });
        }

        if (draft.attachmentErrors.length > 0) {
          sendNotification({
            type: "info",
            title: "Some attachments could not be loaded",
            description: `${draft.attachmentErrors.length} attachment(s) were skipped.`,
          });
        }

        const params = new URLSearchParams(window.location.search);
        if (params.has("go")) {
          params.delete("go");
          const qs = params.toString();
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingGoTemplate(false);
        }
      }
    };

    void loadTemplate();

    return () => {
      cancelled = true;
      setIsLoadingGoTemplate(false);
    };
  }, [
    goSlug,
    workspaceId,
    setPendingInputText,
    setIsLoadingGoTemplate,
    fileUploaderService,
    sendNotification,
  ]);
}
