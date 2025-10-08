import { Spinner } from "@dust-tt/sparkle";
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Edge, Node } from "@xyflow/react";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import { MessageNode } from "@app/components/canvas/MessageNode";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useAgentConfigurations } from "@app/lib/swr/assistants";
import { useConversationMessages } from "@app/lib/swr/conversations";
import type {
  AgentMention,
  LightAgentConfigurationType,
  MessageWithContentFragmentsType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { isAgentMessageType, isUserMessageType } from "@app/types";

interface CanvasProps {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
}

function Canvas({
  owner,
  user,
  conversationId: initialConversationId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { cId } = router.query;
  const conversationId =
    typeof cId === "string" ? cId : initialConversationId;

  const [showInputBar, setShowInputBar] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: [],
  });

  const allAssistants: LightAgentConfigurationType[] = useMemo(
    () => agentConfigurations,
    [agentConfigurations]
  );

  const { messages, isMessagesLoading, mutateMessages } =
    useConversationMessages({
      conversationId,
      workspaceId: owner.sId,
      limit: 50,
    });

  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "conversation",
  });

  const handleEnterKeyDown = useCallback(
    async (
      isEmpty: boolean,
      { content, mentions }: { content: string; mentions: AgentMention[] },
      resetEditorCallback: () => void,
      setLoadingCallback: (loading: boolean) => void
    ) => {
      if (isEmpty || isSending) {
        return;
      }

      setIsSending(true);
      setLoadingCallback(true);

      try {
        const res = await fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content,
              context: {
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                profilePictureUrl: user.image,
              },
              mentions,
            }),
          }
        );

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error?.message || "Failed to send message");
        }

        await mutateMessages();
        resetEditorCallback();
        setShowInputBar(false);
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setIsSending(false);
        setLoadingCallback(false);
      }
    },
    [conversationId, owner.sId, user.image, isSending, mutateMessages]
  );

  const nodeTypes = useMemo(
    () => ({
      message: MessageNode,
    }),
    []
  );

  // Convert messages to nodes and edges.
  const initialNodesAndEdges = useMemo(() => {
    const allMessages = messages.flatMap((page) => page.messages);

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    let yPosition = 50;
    const xPosition = 50;
    const baseVerticalSpacing = 100;

    // Filter to only user and agent messages.
    const displayMessages = allMessages.filter(
      (msg) => isUserMessageType(msg) || isAgentMessageType(msg)
    );

    displayMessages.forEach((message, index) => {
      const messageWithFragments: MessageWithContentFragmentsType = message;
      const isLastMessage = index === displayMessages.length - 1;

      nodes.push({
        id: message.sId,
        type: "message",
        position: { x: xPosition, y: yPosition },
        data: {
          message: messageWithFragments,
          owner,
          conversationId,
          allAssistants,
          isLastMessage,
          onShowInputBar: () => setShowInputBar(true),
        },
        draggable: true,
      });

      // Create edge from previous message to current.
      if (index > 0) {
        const prevMessage = displayMessages[index - 1];
        edges.push({
          id: `${prevMessage.sId}-${message.sId}`,
          source: prevMessage.sId,
          target: message.sId,
          type: "straight",
        });
      }

      // Calculate dynamic spacing based on content length.
      const contentLength = message.content?.length || 0;
      const minHeight = 150;
      const estimatedHeight = Math.max(
        minHeight,
        Math.min(500, minHeight + Math.floor(contentLength / 100) * 30)
      );

      yPosition += estimatedHeight + baseVerticalSpacing;
    });

    return { nodes, edges };
  }, [messages, owner, conversationId, allAssistants]);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodesAndEdges.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialNodesAndEdges.edges
  );

  // Update nodes when messages change.
  useEffect(() => {
    setNodes(initialNodesAndEdges.nodes);
    setEdges(initialNodesAndEdges.edges);
  }, [initialNodesAndEdges, setNodes, setEdges]);

  if (isMessagesLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner variant="color" size="lg" />
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={false}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {/* Fixed Input Bar at Bottom */}
      {showInputBar && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white p-4 shadow-lg dark:border-border-night dark:bg-background-night">
          <div className="mx-auto max-w-4xl">
            <InputBarContainer
              allAssistants={allAssistants}
              agentConfigurations={allAssistants}
              onEnterKeyDown={handleEnterKeyDown}
              owner={owner}
              selectedAssistant={null}
              stickyMentions={[]}
              actions={["assistants-list"]}
              disableAutoFocus={false}
              disableSendButton={isSending}
              disableTextInput={isSending}
              fileUploaderService={fileUploaderService}
              onNodeSelect={() => {}}
              onNodeUnselect={() => {}}
              attachedNodes={[]}
              onMCPServerViewSelect={() => {}}
              onMCPServerViewDeselect={() => {}}
              selectedMCPServerViews={[]}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = withDefaultUserAuthRequirements<CanvasProps>(
  async (context, auth) => {
    const owner = auth.workspace();
    const user = auth.user();

    if (!owner || !user) {
      return {
        notFound: true,
      };
    }

    const { cId } = context.params || {};
    const conversationId = typeof cId === "string" ? cId : null;

    if (!conversationId) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        owner,
        user: user.toJSON(),
        conversationId,
      },
    };
  }
);

export default Canvas;
