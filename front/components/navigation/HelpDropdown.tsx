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
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useCallback, useContext } from "react";

import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { serializeMention } from "@app/lib/mentions/format";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  AgentMention,
  MentionType,
  UserTypeWithWorkspaces,
  WorkspaceType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, isAgentMention } from "@app/types";

export function HelpDropdown({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserTypeWithWorkspaces;
}) {
  const router = useRouter();
  const sendNotification = useSendNotification();

  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });

  const { setSelectedAgent } = useContext(InputBarContext);

  const handleAskHelp = () => {
    if (router.pathname === "/w/[wId]/conversation/[cId]") {
      // If we're on /conversation/new page, we just set the selected agent on top of what's already there in the input bar if any.
      // This allows to not lose your potential input when you click on the help button.
      setSelectedAgent({
        type: "agent",
        id: GLOBAL_AGENTS_SID.HELPER,
        label: "Help",
        pictureUrl:
          "https://dust.tt/static/systemavatar/helper_avatar_full.png",
        description: "Help on how to use Dust",
      });
    } else {
      // Otherwise we just push the route and prefill the input bar with the @help mention.
      void router.push(
        getConversationRoute(
          owner.sId,
          "new",
          `agent=${GLOBAL_AGENTS_SID.HELPER}`
        )
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
          (mention) =>
            isAgentMention(mention) &&
            mention.configurationId === GLOBAL_AGENTS_SID.HELPER
        )
          ? mentions
          : [
              ...mentions,
              { configurationId: GLOBAL_AGENTS_SID.HELPER } as AgentMention,
            ];
        const conversationRes = await createConversationWithMessage({
          messageData: {
            input: inputWithHelp.replace(
              "@help",
              serializeMention({ name: "help", sId: GLOBAL_AGENTS_SID.HELPER })
            ),
            mentions: mentionsWithHelp,
            contentFragments: {
              uploaded: [],
              contentNodes: [],
            },
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
            getConversationRoute(owner.sId, conversationRes.value.sId)
          );
        }
      },
      [createConversationWithMessage, router, sendNotification]
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
          href="https://dust-community.tightknit.community/join"
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
          label="How to use agents in Slack workflow?"
          icon={ChatBubbleBottomCenterTextIcon}
          onClick={() =>
            void handleHelpSubmit("How to use agents in Slack workflow?", [])
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
