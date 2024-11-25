/* eslint-disable @typescript-eslint/no-unused-vars */
import type { LightWorkspaceType, UserMessageType } from "@dust-tt/client";
import type {
  ConversationMessageEmojiSelectorProps,
  ConversationMessageSizeType,
} from "@dust-tt/sparkle";
import {
  Button,
  ConversationMessage,
  HeartIcon,
  HeartStrokeIcon,
  Markdown,
} from "@dust-tt/sparkle";
import { AgentSuggestion } from "@extension/components/conversation/AgentSuggestion";
import {
  CiteBlock,
  getCiteDirective,
} from "@extension/components/markdown/CiteBlock";
import {
  MentionBlock,
  mentionDirective,
} from "@extension/components/markdown/MentionBlock";
import type { MessageWithContentFragmentsType } from "@extension/lib/conversation";
import { sendMessage } from "@extension/lib/messages";
import type { SavedAssistantConfiguration } from "@extension/lib/storage";
import { getSavedConfigurations } from "@extension/lib/storage";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";

interface UserMessageProps {
  citations?: React.ReactElement[];
  conversationId: string;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  message: UserMessageType & MessageWithContentFragmentsType;
  messageEmoji?: ConversationMessageEmojiSelectorProps;
  owner: LightWorkspaceType;
  size: ConversationMessageSizeType;
}

const hashBase64 = async (str: string) => {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(36))
    .join("");
};

export function UserMessage({
  citations,
  conversationId,
  isFirstMessage,
  isLastMessage,
  message,
  messageEmoji,
  owner,
  size,
}: UserMessageProps) {
  const [savedConfigurations, setSavedConfigurations] = useState<
    SavedAssistantConfiguration[]
  >([]);
  const [savedConfigurationId, setSavedConfigurationId] = useState<
    string | undefined
  >();
  const elRef = useRef<HTMLDivElement | null>(null);
  const additionalMarkdownComponents: Components = useMemo(
    () => ({
      sup: CiteBlock,
      mention: MentionBlock,
    }),
    []
  );

  const additionalMarkdownPlugins: PluggableList = useMemo(
    () => [getCiteDirective(), mentionDirective],
    []
  );

  const configurationIds = message.mentions.map(
    (mention) => mention.configurationId
  );

  useEffect(() => {
    const loadConfigurations = async () => {
      const saved = await getSavedConfigurations();
      if (saved.length !== savedConfigurations.length) {
        setSavedConfigurations(saved);
      }
    };
    void loadConfigurations();
  }, []);

  useEffect(() => {
    const getId = async () => {
      const hash = await hashBase64(`${configurationIds}-${message.content}`);
      const id = `ask_dust_${hash}`;
      setSavedConfigurationId(id);
    };
    void getId();
  }, []);

  const enabled = !!savedConfigurations.find(
    (c) => c.id === savedConfigurationId
  );

  const buttons = isFirstMessage
    ? [
        <Button
          variant="outline"
          size="xs"
          icon={enabled ? HeartIcon : HeartStrokeIcon}
          label="Save to context menu"
          onClick={async () => {
            if (enabled) {
              const configurations = savedConfigurations.filter(
                (c) => c.id !== savedConfigurationId
              );
              void sendMessage({
                type: "UPDATE_SAVED_CONFIGURATIONS",
                configurations,
              });
              setSavedConfigurations(configurations);
            } else {
              if (savedConfigurationId) {
                const configurations = [
                  ...savedConfigurations,
                  {
                    id: savedConfigurationId,
                    description: `Ask ${elRef.current?.innerText}`,
                    text: message.content,
                    includeContent: message.contenFragments
                      ? message.contenFragments?.some(
                          (cf) => cf.contentType === "text/plain"
                        )
                      : false,
                    includeCapture: message.contenFragments
                      ? message.contenFragments?.some(
                          (cf) => cf.contentType === "image/jpeg"
                        )
                      : false,
                    configurationIds,
                  },
                ];
                void sendMessage({
                  type: "UPDATE_SAVED_CONFIGURATIONS",
                  configurations,
                });
                setSavedConfigurations(configurations);
              }
            }
          }}
        />,
      ]
    : [];

  return (
    <ConversationMessage
      pictureUrl={message.user?.image || message.context.profilePictureUrl}
      name={message.context.fullName}
      messageEmoji={messageEmoji}
      renderName={(name) => <div className="text-base font-medium">{name}</div>}
      type="user"
      citations={citations}
      size={size}
      buttons={buttons}
    >
      <div className="flex flex-col gap-4">
        <div ref={elRef}>
          <Markdown
            content={message.content}
            isStreaming={false}
            isLastMessage={isLastMessage}
            additionalMarkdownComponents={additionalMarkdownComponents}
            additionalMarkdownPlugins={additionalMarkdownPlugins}
          />
        </div>
        {message.mentions.length === 0 && isLastMessage && (
          <AgentSuggestion
            conversationId={conversationId}
            owner={owner}
            userMessage={message}
          />
        )}
      </div>
    </ConversationMessage>
  );
}
