import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  HeartIcon,
  LightbulbIcon,
  SlackLogo,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  MentionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@dust-tt/types";
import { GLOBAL_AGENTS_SID } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useContext } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useSubmitFunction } from "@app/lib/client/utils";

export function HelpDropdown({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserTypeWithWorkspaces;
}) {
  const router = useRouter();
  const sendNotification = useSendNotification();

  const { setSelectedAssistant, setAnimate } = useContext(InputBarContext);

  const handleAskHelp = () => {
    if (router.pathname === "/w/[wId]/assistant/[cId]") {
      // If we're on /assistant/new page, we just set the selected assistant on top of what's already there in the input bar if any.
      // This allows to not loose your potential input when you click on the help button.
      setSelectedAssistant({ configurationId: GLOBAL_AGENTS_SID.HELPER });
      setAnimate(true);
    } else {
      // Otherwise we just push the route and prefill the input bar with the @help mention.
      void router.push(
        `/w/${owner.sId}/assistant/new?assistant=${GLOBAL_AGENTS_SID.HELPER}`
      );
    }
  };

  const { submit: handleHelpSubmit } = useSubmitFunction(
    useCallback(
      async (input: string, mentions: MentionType[]) => {
        const inputWithHelp = input.includes("@help")
          ? input
          : `@help ${input.trimStart()}`;
        const mentionsWithHelp = mentions.some(
          (mention) => mention.configurationId === GLOBAL_AGENTS_SID.HELPER
        )
          ? mentions
          : [
              ...mentions,
              { configurationId: GLOBAL_AGENTS_SID.HELPER } as AgentMention,
            ];
        const conversationRes = await createConversationWithMessage({
          owner,
          user,
          messageData: {
            input: inputWithHelp.replace("@help", ":mention[help]{sId=helper}"),
            mentions: mentionsWithHelp,
            contentFragments: [],
          },
        });
        if (conversationRes.isErr()) {
          sendNotification({
            title: conversationRes.error.title,
            description: conversationRes.error.message,
            type: "error",
          });
        } else {
          void router.push(
            `/w/${owner.sId}/assistant/${conversationRes.value.sId}`
          );
        }
      },
      [owner, user, router, sendNotification]
    )
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" label="Help" icon={HeartIcon} isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <DropdownMenuLabel label="Learn about Dust" />
        <DropdownMenuItem
          label="Quickstart Guide"
          icon={LightbulbIcon}
          onClick={() =>
            router.push(
              {
                pathname: router.pathname,
                query: { ...router.query, quickGuide: "true" },
              },
              undefined,
              { shallow: true }
            )
          }
        />
        <DropdownMenuItem
          label="Guides & Documentation"
          icon={DocumentIcon}
          href="https://docs.dust.tt"
          target="_blank"
        />
        <DropdownMenuItem
          label="Join the Slack Community"
          icon={SlackLogo}
          href="https://join.slack.com/t/dustcommunity/shared_invite/zt-2tu2obwzo-ZyT1dUR6~qwSncVpIy7yTA"
          target="_blank"
        />
        <DropdownMenuLabel label="Ask questions" />
        <DropdownMenuItem
          label="Ask @help"
          description="Ask anything about Dust"
          icon={ChatBubbleLeftRightIcon}
          onClick={() => void handleAskHelp()}
        />
        <DropdownMenuItem
          label="How to invite new users?"
          icon={ChatBubbleBottomCenterTextIcon}
          onClick={() => void handleHelpSubmit("How to invite new users?", [])}
        />
        <DropdownMenuItem
          label="How to use assistants in Slack workflow?"
          icon={ChatBubbleBottomCenterTextIcon}
          onClick={() =>
            void handleHelpSubmit(
              "How to use assistants in Slack workflow?",
              []
            )
          }
        />
        <DropdownMenuItem
          label="How to manage billing?"
          icon={ChatBubbleBottomCenterTextIcon}
          onClick={() => void handleHelpSubmit("How to manage billing?", [])}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
