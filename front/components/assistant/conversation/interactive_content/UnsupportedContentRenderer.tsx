import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { CenteredState } from "@app/components/assistant/conversation/interactive_content/CenteredState";
import { AlertCircle, ContentMessage } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface UnsupportedContentRendererProps {
  contentType: string;
  fileName?: string;
}

export function UnsupportedContentRenderer({
  contentType,
  fileName,
}: UnsupportedContentRendererProps) {
  const { t } = useLingui();
  const { closePanel } = useConversationSidePanelContext();

  return (
    <div className="flex h-full flex-col">
      <ConversationSidePanelHeader onClose={closePanel} />

      <div className="flex-1 overflow-hidden">
        <CenteredState>
          <ContentMessage
            icon={AlertCircle}
            size="md"
            title={t`Unsupported content type`}
            variant="warning"
          >
            <div className="space-y-2">
              <p>
                <Trans>
                  This content type is not yet supported in the Frame drawer.
                </Trans>
              </p>
              <div className="text-xs opacity-75">
                <p>
                  <Trans>
                    <strong>Content type:</strong> {contentType}
                  </Trans>
                </p>
                {fileName && (
                  <p>
                    <Trans>
                      <strong>File:</strong> {fileName}
                    </Trans>
                  </p>
                )}
              </div>
            </div>
          </ContentMessage>
        </CenteredState>
      </div>
    </div>
  );
}
