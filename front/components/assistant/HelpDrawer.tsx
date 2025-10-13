import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  FolderIcon,
  LightbulbIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ComponentType } from "react";
import { useCallback, useState } from "react";

import type { EditorMention } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { createConversationWithMessage } from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import type { DustError } from "@app/lib/error";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result, RoleType, UserType, WorkspaceType } from "@app/types";
import { Err, GLOBAL_AGENTS_SID, Ok } from "@app/types";

// describe the type of userContent where the

const userContent: Record<
  RoleType,
  {
    helpIceBreakers: string[];
  }
> = {
  user: {
    helpIceBreakers: [
      "What are agents?",
      "What are the limitations of agents?",
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
      "How to use agents in Slack workflows?",
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
    <div className="flex flex-col gap-2">
      {title && (
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
      )}
      {linksList.map((link, index) => (
        <div key={index}>
          <Button
            icon={link.icon}
            variant="ghost"
            label={link.title}
            link={link.href ? { href: link.href, target: "_blank" } : undefined}
            onClick={link.onClick}
            description={link.description}
          />
        </div>
      ))}
    </div>
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleHelpSubmit = useCallback(
    async (
      input: string,
      mentions: EditorMention[]
    ): Promise<Result<undefined, DustError>> => {
      if (isSubmitting) {
        return new Err({
          code: "internal_error",
          name: "Already submitting",
          message: "Please wait for the previous submission to finish",
        });
      }

      setIsSubmitting(true);

      const inputWithHelp = input.includes("@help")
        ? input
        : `@help ${input.trimStart()}`;
      const mentionsWithHelp = mentions.some(
        (mention) => mention.id === GLOBAL_AGENTS_SID.HELPER
      )
        ? mentions
        : [...mentions, { id: GLOBAL_AGENTS_SID.HELPER } as EditorMention];
      const conversationRes = await createConversationWithMessage({
        owner,
        user,
        messageData: {
          input: inputWithHelp.replace("@help", ":mention[help]{sId=helper}"),
          mentions: mentionsWithHelp.map((mention) => ({
            configurationId: mention.id,
          })),
          contentFragments: {
            uploaded: [],
            contentNodes: [],
          },
        },
      });

      setIsSubmitting(false);

      if (conversationRes.isErr()) {
        sendNotification({
          title: conversationRes.error.title,
          description: conversationRes.error.message,
          type: "error",
        });

        return new Err({
          code: "internal_error",
          name: conversationRes.error.title,
          message: conversationRes.error.message,
        });
      } else {
        // We start the push before creating the message to optimize for instantaneity as well.
        void router.push(getConversationRoute(owner.sId, conversationRes.value.sId));
        return new Ok(undefined);
      }
    },
    [isSubmitting, owner, user, sendNotification, router]
  );

  return (
    <Sheet open={show} onOpenChange={onClose}>
      <SheetContent>
        <SheetContainer>
          <div className="flex flex-col gap-5">
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
                  href: "https://dust-community.tightknit.community/join",
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
                              { id: GLOBAL_AGENTS_SID.HELPER, label: "Help" },
                            ]);
                          }}
                          key={index}
                        />
                      )
                    )}
                  </div>
                </div>
              </div>
              <InputBar
                owner={owner}
                onSubmit={handleHelpSubmit}
                conversationId={null}
                actions={[]}
                disableAutoFocus={true}
                isFloatingWithoutMargin={true}
              />
            </div>
          </div>
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
