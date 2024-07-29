import {
  ArrowRightIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  FolderIcon,
  Item,
  LightbulbIcon,
  Modal,
  Page,
  QuestionMarkCircleIcon,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  MentionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useCallback, useContext } from "react";

import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";

const topPicks = [
  {
    title: "How to create assistants?",
    href: "https://docs.dust.tt/docs/prompting-101-how-to-talk-to-your-assistants",
    icon: ArrowRightIcon,
  },
  {
    title: "How to add new connections?",
    href: "https://docs.dust.tt/docs/google-drive-connection",
    icon: ArrowRightIcon,
  },
  {
    title: "What can I use Dust for?",
    href: "https://docs.dust.tt/docs/use-cases",
    icon: ArrowRightIcon,
  },
];

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
          href={link.href}
          onClick={link.onClick}
          key={index}
          description={link.description}
          target="_blank"
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
  const sendNotification = useContext(SendNotificationsContext);

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
        <div>
          <LinksList
            linksList={
              isBuilder(owner)
                ? [
                    {
                      title: "Quickstart Guide",
                      onClick: () => setShowQuickGuide(true),
                      icon: LightbulbIcon,
                    },
                    {
                      title: "All help content",
                      href: "https://docs.dust.tt",
                      description: "Guides, best practices, and more",
                      icon: FolderIcon,
                    },
                    {
                      title: "Community Support",
                      href: "https://docs.dust.tt/discuss",
                      description: "Stuck? Ask your questions to the community",
                      icon: QuestionMarkCircleIcon,
                    },
                  ]
                : [
                    {
                      title: "Quickstart Guide",
                      href: "https://docs.dust.tt/docs/getting-started",
                      icon: LightbulbIcon,
                    },
                  ]
            }
          />
          {isBuilder(owner) && (
            <LinksList linksList={topPicks} title="Top Picks" />
          )}
        </div>
        {!isBuilder(owner) && (
          <Button.List isWrapping={true}>
            <div className="flex flex-col gap-8">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="tertiary"
                  icon={ChatBubbleBottomCenterTextIcon}
                  label={"What can I use the assistants for?"}
                  size="sm"
                  hasMagnifying={false}
                  onClick={() => {
                    void handleHelpSubmit(
                      "@help What can I use the assistants for?",
                      [{ configurationId: GLOBAL_AGENTS_SID.HELPER }]
                    );
                  }}
                />
                <Button
                  variant="tertiary"
                  icon={ChatBubbleBottomCenterTextIcon}
                  label={"What are the limitations of assistants?"}
                  size="sm"
                  hasMagnifying={false}
                  onClick={() => {
                    void handleHelpSubmit(
                      "@help What are the limitations of assistants?",
                      [{ configurationId: GLOBAL_AGENTS_SID.HELPER }]
                    );
                  }}
                />
              </div>
            </div>
          </Button.List>
        )}
        <div className="flex flex-col gap-4 [&>*]:pl-px">
          <Page.SectionHeader title="Ask questions" />
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
