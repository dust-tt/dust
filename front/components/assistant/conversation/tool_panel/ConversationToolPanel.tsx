import { MCPServerDetailsInfo } from "@app/components/actions/mcp/MCPServerDetailsInfo";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import { useResolvedMCPServerView } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface ConversationToolPanelProps {
  owner: LightWorkspaceType;
}

export function ConversationToolPanel({ owner }: ConversationToolPanelProps) {
  const { closePanel, data: toolId } = useConversationSidePanelContext();

  const { serverView: fullServerView, isServerViewError: isError } =
    useResolvedMCPServerView({
      owner,
      mcpServerViewId: toolId ?? null,
    });

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Tool</span>
      </ConversationSidePanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {isError ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            This tool could not be loaded.
          </div>
        ) : !fullServerView ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {getAvatar(fullServerView.server, "md")}
              <div>
                <div className="heading-lg text-foreground">
                  {getMcpServerViewDisplayName(fullServerView)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {getMcpServerViewDescription(fullServerView)}
                </div>
              </div>
            </div>
            <MCPServerDetailsInfo
              mcpServerView={fullServerView}
              owner={owner}
              readOnly
            />
          </>
        )}
      </div>
    </div>
  );
}
