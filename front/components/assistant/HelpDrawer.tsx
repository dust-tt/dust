import {
  ArrowRightIcon,
  Button,
  ChatBubbleBottomCenterTextIcon,
  FolderIcon,
  Item,
  LightbulbIcon,
  Modal,
  Page,
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
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { useSubmitFunction } from "@app/lib/client/utils";

const topPicks = [
  {
    title: "Creating Assistants",
    href: "https://www.notion.so/dust-tt/Prompting-101-How-to-Talk-to-Your-Assistants-c0212513056a4af885e41706ee742dda",
    icon: ArrowRightIcon,
  },
  {
    title: "Managing Connections",
    href: "https://www.notion.so/dust-tt/Dust-Library-1aa97619d56d4d9f9c21d7ce89d23dbb?pvs=4#4f7f969e52464e369f4cd453457d8059",
    icon: ArrowRightIcon,
  },
  {
    title: "Choosing a Model",
    href: "https://blog.dust.tt/comparing-ai-models-claude-gpt4-gemini-mistral/",
    icon: ArrowRightIcon,
  },
];

function LinksList({
  linksList,
  title,
}: {
  linksList: {
    title: string;
    href: string;
    icon?: ComponentType;
    description?: string;
  }[];
  title?: string;
}) {
  return (
    <Item.List>
      {title && <Item.SectionHeader label={title} />}
      {linksList.map((link, index) => (
        <Item.Navigation
          icon={link.icon}
          label={link.title}
          href={link.href}
          key={index}
          description={link.description}
          hasAction={false}
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
}: {
  owner: WorkspaceType;
  user: UserType;
  show: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const { setSelectedAssistant } = useContext(InputBarContext);
  setSelectedAssistant(null);

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
                      href: "https://www.notion.so/dust-tt/Getting-to-Know-Dust-b4578a3ded364762b19c8276192cc992",
                      icon: LightbulbIcon,
                    },
                    {
                      title: "All help content",
                      href: "https://www.notion.so/dust-tt/Dust-Library-1aa97619d56d4d9f9c21d7ce89d23dbb",
                      description: "Guides, best practices, and more",
                      icon: FolderIcon,
                    },
                  ]
                : [
                    {
                      title: "Quickstart Guide",
                      href: "https://www.notion.so/dust-tt/Getting-to-Know-Dust-b4578a3ded364762b19c8276192cc992",
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
        <div className="flex flex-col gap-2 [&>*]:pl-px">
          <div className="text-base font-bold">Ask questions</div>
          <AssistantInputBar
            owner={owner}
            onSubmit={handleHelpSubmit}
            conversationId={null}
            actions={[]}
            disableAutoFocus={true}
          />
        </div>
      </div>
    </Modal>
  );
}
