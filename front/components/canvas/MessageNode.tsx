import { Avatar, Button, Markdown, PlusIcon } from "@dust-tt/sparkle";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import React, { useState } from "react";

import InputBarContainer from "@app/components/assistant/conversation/input_bar/InputBarContainer";
import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { classNames } from "@app/lib/utils";
import type {
  AgentMention,
  DataSourceViewContentNode,
  LightAgentConfigurationType,
  MessageWithContentFragmentsType,
  WorkspaceType,
} from "@app/types";
import { isAgentMessageType, isUserMessageType } from "@app/types";
import type { MCPServerViewType } from "@app/types/mcp";

interface MessageNodeData {
  message: MessageWithContentFragmentsType;
  owner: WorkspaceType;
  conversationId: string;
  allAssistants: LightAgentConfigurationType[];
  isLastMessage: boolean;
  onShowInputBar: () => void;
}

export function MessageNode({ data }: NodeProps<MessageNodeData>) {
  const { message, isLastMessage, onShowInputBar } = data;

  const isUserMessage = isUserMessageType(message);
  const isAgentMessage = isAgentMessageType(message);

  const messageContent = message.content || "";
  const author = isUserMessage
    ? message.user?.fullName || message.context.username
    : isAgentMessage
      ? message.configuration.name
      : "Unknown";

  const pictureUrl = isUserMessage
    ? message.context.profilePictureUrl
    : isAgentMessage
      ? message.configuration.pictureUrl
      : null;

  return (
    <div
      className={classNames(
        "flex min-w-[400px] max-w-[600px] flex-col rounded-lg border bg-white p-4 shadow-sm",
        "dark:bg-background-night dark:border-border-night"
      )}
    >
      {/* Message Display */}
      <div className="flex gap-3">
        <Avatar size="md" visual={pictureUrl || undefined} name={author} />
        <div className="flex flex-1 flex-col gap-2">
          <div className="text-sm font-medium text-foreground dark:text-foreground-night">
            {author}
          </div>
          <div className="text-sm text-foreground dark:text-foreground-night">
            <Markdown content={messageContent} />
          </div>
        </div>
      </div>

      {/* + Button (only on last message) */}
      {isLastMessage && isAgentMessage && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            icon={PlusIcon}
            label="Ask a question"
            onClick={onShowInputBar}
          />
        </div>
      )}

      {/* Handles for connecting nodes */}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}
