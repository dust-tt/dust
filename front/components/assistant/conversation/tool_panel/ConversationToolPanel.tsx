import { MCPServerDetailsGeneral } from "@app/components/actions/mcp/MCPServerDetailsGeneral";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useMCPServerView } from "@app/lib/swr/mcp_servers";
import type { LightWorkspaceType } from "@app/types/user";
import { Spinner } from "@dust-tt/sparkle";

interface ConversationToolPanelProps {
  owner: LightWorkspaceType;
}

interface ToolPanelBodyProps {
  owner: LightWorkspaceType;
  serverView: MCPServerViewType | null;
  isError: boolean;
}

function ToolPanelBody({ owner, serverView, isError }: ToolPanelBodyProps) {
  if (isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        This tool could not be loaded.
      </div>
    );
  }

  if (!serverView) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {getAvatar(serverView.server, "md")}
        <div>
          <div className="heading-lg text-foreground">
            {getMcpServerViewDisplayName(serverView)}
          </div>
          <div className="text-sm text-muted-foreground">
            {getMcpServerViewDescription(serverView)}
          </div>
        </div>
      </div>
      <MCPServerDetailsGeneral
        mcpServerView={serverView}
        owner={owner}
        readOnly
      />
    </>
  );
}

export function ConversationToolPanel({ owner }: ConversationToolPanelProps) {
  const { closePanel, data: toolId } = useConversationSidePanelContext();

  const { serverView: fullServerView, isMCPServerViewError: isError } =
    useMCPServerView({
      owner,
      viewId: toolId ?? null,
    });

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">Tool</span>
      </ConversationSidePanelHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <ToolPanelBody
          owner={owner}
          serverView={fullServerView ?? null}
          isError={isError}
        />
      </div>
    </div>
  );
}
