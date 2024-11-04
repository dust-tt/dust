import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  FolderIcon,
  Item,
  LightbulbIcon,
  Modal,
  Page,
  UserGroupIcon,
  useSendNotification,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  MentionType,
  RoleType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { GLOBAL_AGENTS_SID } from "@dust-tt/types";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useCallback } from "react";

import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useSubmitFunction } from "@app/lib/client/utils";

// describe the type of userContent where the

const userContent: Record<
  RoleType,
  {
    helpIceBreakers: string[];
  }
> = {
  user: {
    helpIceBreakers: [
      "What are assistants?",
      "What are the limitations of assistants?",
    ],
  },
  builder: {
    helpIceBreakers: [
      "How to upload a file to a folder in Dust?",
      "What are good use-cases for Customer support?",
      "What does the Extract Data tool do?",
    ],
  },
  admin: {
    helpIceBreakers: [
      "How to invite a new user?",
      "How to use assistants in Slack workflows?",
      "How to manage billing?",
    ],
  },
  none: {
    helpIceBreakers: [],
  },
};

function LinksList({
  linksList,
  title,
}: {
  linksList: {
    title: string;
    href?: string;
    onClick?: () => void;
    icon?: ComponentType;
    description?: string;
  }[];
  title?: string;
}) {
  return (
    <Item.List>
      {title && <Item.SectionHeader label={title} variant="secondary" />}
      {linksList.map((link, index) => (
        <Item.Link
          icon={link.icon}
          label={link.title}
          link={link.href ? { href: link.href, target: "_blank" } : undefined}
          onClick={link.onClick}
          key={index}
          description={link.description}
        />
      ))}
    </Item.List>
  );
}

export function HelpDrawer({
  owner,
  user,
  show,
  onClose,
  setShowQuickGuide,
}: {
  owner: WorkspaceType;
  user: UserType;
  show: boolean;
  onClose: () => void;
  setShowQuickGuide: (show: boolean) => void;
}) {
  const router = useRouter();
  const sendNotification = useSendNotification();

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
          // We start the push before creating the message to optimize for instantaneity as well.
          void router.push(
            `/w/${owner.sId}/assistant/${conversationRes.value.sId}`
          );
        }
      },
      [owner, user, router, sendNotification]
    )
  );

  return (
    <Modal isOpen={show} variant="side-sm" hasChanged={false} onClose={onClose}>
      <div className="flex flex-col gap-5 pt-5">
        <Page.SectionHeader title="Learn about Dust" />
        <LinksList
          linksList={[
            {
              title: "Quickstart Guide",
              description: "Learn the basics of Dust in 3 minutes",
              onClick: () => setShowQuickGuide(true),
              icon: LightbulbIcon,
            },
            {
              title: "Guides & Documentation",
              href: "https://docs.dust.tt",
              description: "Explore the full documentation",
              icon: FolderIcon,
            },
            {
              title: "Join the Slack community",
              href: "https://join.slack.com/t/dustcommunity/shared_invite/zt-2tu2obwzo-ZyT1dUR6~qwSncVpIy7yTA",
              description: "Stuck? Ask your questions to the community",
              icon: UserGroupIcon,
            },
          ]}
        />

        <div className="flex flex-col gap-4 [&>*]:pl-px">
          <Page.SectionHeader title="Ask questions to @help" />
          <div className="flex gap-2">
            <div className="flex flex-col gap-8">
              <div className="flex flex-wrap gap-2">
                {userContent[owner.role].helpIceBreakers.map(
                  (iceBreaker, index) => (
                    <Button
                      variant="ghost"
                      icon={ChatBubbleBottomCenterTextIcon}
                      label={iceBreaker}
                      size="sm"
                      onClick={() => {
                        void handleHelpSubmit(`@help ${iceBreaker}`, [
                          { configurationId: GLOBAL_AGENTS_SID.HELPER },
                        ]);
                      }}
                      key={index}
                    />
                  )
                )}
              </div>
            </div>
          </div>
          <AssistantInputBar
            owner={owner}
            onSubmit={handleHelpSubmit}
            conversationId={null}
            actions={[]}
            disableAutoFocus={true}
            isFloatingWithoutMargin={true}
          />
        </div>
      </div>
    </Modal>
  );
}
