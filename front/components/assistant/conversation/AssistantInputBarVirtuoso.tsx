import { Button } from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { ArrowBigDownDashIcon } from "lucide-react";

import { AssistantInputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import { isUserMessage } from "@app/components/assistant/conversation/types";
import { emptyArray } from "@app/lib/swr/swr";
import type { AgentMention } from "@app/types";
import { isAgentMention } from "@app/types";

export const AssistantInputBarVirtuoso = ({
  context,
}: {
  context: VirtuosoMessageListContext;
}) => {
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const lastUserMessage = methods.data
    .get()
    .findLast(
      (m) =>
        isUserMessage(m) &&
        m.user?.id === context.user.id &&
        m.visibility !== "deleted"
    );

  const agentMentions =
    !lastUserMessage || !isUserMessage(lastUserMessage)
      ? emptyArray<AgentMention>()
      : lastUserMessage.mentions.filter(isAgentMention);

  const { bottomOffset } = useVirtuosoLocation();
  const distanceUntilButtonVisibe = 100;
  const distanceToFullOpacity = 200;
  const hidden = bottomOffset < distanceUntilButtonVisibe;
  const opacity = Math.min(
    1,
    bottomOffset < distanceUntilButtonVisibe
      ? 0
      : (bottomOffset - distanceUntilButtonVisibe) / distanceToFullOpacity
  );
  const hiddenRotation = 180;
  const rotation = hiddenRotation * (1 - opacity);

  return (
    <div
      className={
        "z-20 mx-auto flex max-h-screen w-full py-2 sm:w-full sm:max-w-3xl sm:py-4"
      }
    >
      <div
        className="align-center"
        style={{
          position: "absolute",
          top: "-30px",
          right: "50%",
          opacity,
          transform: `rotate(${rotation}deg)`,
          visibility: hidden ? "hidden" : "visible",
        }}
      >
        <Button
          size="xs"
          icon={ArrowBigDownDashIcon}
          variant="outline"
          onClick={() => {
            methods.scrollToItem({
              index: "LAST",
              align: "end",
              behavior: "smooth",
            });
          }}
        />
      </div>
      <AssistantInputBar
        owner={context.owner}
        onSubmit={context.handleSubmit}
        stickyMentions={agentMentions}
        conversationId={context.conversationId}
        disableAutoFocus={false}
      />
    </div>
  );
};
