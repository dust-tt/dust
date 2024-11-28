import { Button, ScrollArea, XMarkIcon } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useCallback } from "react";

import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { CoEditionVisualizationContent } from "@app/components/assistant/conversation/co-edition/CoEditionContext";
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

  // Only render one visualization at a time
  const renderVisualization = useCallback(
    (identifier: string, content: CoEditionVisualizationContent) => {
      return (
        <div key={`${identifier}-${content.version}`} className="p-4">
          <h1>ID: {identifier}</h1>
          <h1>Version: {content.version}</h1>
          <VisualizationActionIframe
            owner={owner}
            visualization={{
              code: content.code,
              complete: content.complete,
              identifier,
            }}
            conversationId={conversationId}
            agentConfigurationId={content.agentConfigurationId}
          />
        </div>
      );
    },
    [conversationId, owner]
  );

  // const renderContent = useCallback(
  //   (coEditionContent: CoEditionState["content"]) => {
  //     console.log("> state content has changed", coEditionContent);
  //     if (!coEditionContent) {
  //       return null;
  //     }

  //     const nodes = [];

  //     for (const [identifier, content] of Object.entries(coEditionContent)) {
  //       switch (content.type) {
  //         case "visualization":
  //           const { agentConfigurationId, code, complete } = content;

  //           nodes.push(
  //             <>
  //               <h1>ID: {identifier}</h1>
  //               <VisualizationActionIframe
  //                 owner={owner}
  //                 visualization={{
  //                   code,
  //                   complete,
  //                   identifier,
  //                 }}
  //                 key={identifier}
  //                 conversationId={conversationId}
  //                 agentConfigurationId={agentConfigurationId}
  //               />
  //             </>
  //           );
  //           break;

  //         default:
  //           return null;
  //       }
  //     }

  //     return nodes;
  //   },
  //   [conversationId, owner]
  // );

  // const nodes = useMemo(
  //   () => renderContent(state.content),
  //   [state.content, renderContent]
  // );

  return (
    <>
      {state.isVisible && (
        <div className="relative flex h-full w-full flex-col border-l border-structure-200">
          <ScrollArea>
            <div className="absolute right-2 top-2 z-10">
              <Button
                variant="primary"
                size="sm"
                icon={XMarkIcon}
                onClick={actions.hide}
              />
            </div>
            {Array.from(Object.entries(state.content)).map(
              ([identifier, content]) => {
                if (content.type === "visualization") {
                  return renderVisualization(identifier, content);
                }
                return null;
              }
            )}
          </ScrollArea>
        </div>
      )}
    </>
  );
}
