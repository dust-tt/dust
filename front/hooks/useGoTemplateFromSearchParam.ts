import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useSearchParam } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { GetGoTemplateDraftResponseBodySchema } from "@app/types/api/assistant/go_template_types";
import { isSupportedFileContentType } from "@app/types/files";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          const errorData = await getErrorFromResponse(response);
          sendApiErrorNotification({
            title: t`Template unavailable`,
            error: errorData,
          });
          return;
        }

        const parsed = GetGoTemplateDraftResponseBodySchema.safeParse(
          await response.json()
        );
        if (!parsed.success) {
          sendNotification({
            type: "error",
            title: t`Template unavailable`,
            description: t`This link template could not be loaded.`,
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

        const skippedAttachmentCount = draft.attachmentErrors.length;
        if (skippedAttachmentCount > 0) {
          sendNotification({
            type: "info",
            title: t`Some attachments could not be loaded`,
            description: t`${plural(skippedAttachmentCount, { one: "# attachment was skipped.", other: "# attachments were skipped." })}`,
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
    sendApiErrorNotification,
    sendNotification,
    t,
  ]);
}
