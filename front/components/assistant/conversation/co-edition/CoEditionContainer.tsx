import { Button, XMarkIcon } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useCallback, useMemo } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { CoEditionState } from "@app/components/assistant/conversation/co-edition/CoEditionContext";
import { useCoEditionContext } from "@app/components/assistant/conversation/co-edition/CoEditionContext";

interface CoEditionContainerProps {
  conversationId: string;
  owner: LightWorkspaceType;
}

export function CoEditionContainer({
  conversationId,
  owner,
}: CoEditionContainerProps) {
  const { state, actions } = useCoEditionContext();

  const renderContent = useCallback(
    (coEditionContent: CoEditionState["content"]) => {
      if (!coEditionContent) {
        return null;
      }

      const nodes = [];

      for (const [identifier, content] of coEditionContent) {
        switch (content.type) {
          case "visualization":
            const { agentConfigurationId, code, complete } = content;

            nodes.push(
              <>
                <h1>ID: {identifier}</h1>
                <VisualizationActionIframe
                  owner={owner}
                  visualization={{
                    code,
                    complete,
                    identifier,
                  }}
                  key={identifier}
                  conversationId={conversationId}
                  agentConfigurationId={agentConfigurationId}
                />
              </>
            );
            break;

          default:
            return null;
        }
      }

      return nodes;
    },
    [conversationId, owner]
  );

  const nodes = useMemo(
    () => renderContent(state.content),
    [state.content, renderContent]
  );

  return (
    <>
      {state.isVisible && (
        <div className="relative flex h-full w-full flex-col border-l border-structure-200">
          <div className="absolute right-2 top-2 z-10">
            <Button
              variant="primary"
              size="sm"
              icon={XMarkIcon}
              onClick={actions.hide}
            />
          </div>
          {nodes}
        </div>
      )}
    </>
  );
}
