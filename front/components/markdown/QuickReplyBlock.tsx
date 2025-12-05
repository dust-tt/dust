import { Button } from "@dust-tt/sparkle";
import React, { useState } from "react";
import { visit } from "unist-util-visit";

import {
  trackEvent,
  TRACKING_ACTIONS,
  TRACKING_AREAS,
} from "@app/lib/tracking";

interface QuickReplyBlockProps {
  label: string;
  message: string;
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}

function QuickReplyBlock({
  label,
  message,
  disabled,
  onSend,
}: QuickReplyBlockProps) {
  const [isSending, setIsSending] = useState(false);

  const handleClick = async () => {
    if (isSending || disabled) {
      return;
    }
    trackEvent({
      area: TRACKING_AREAS.CONVERSATION,
      object: "onboarding_conversation",
      action: TRACKING_ACTIONS.CLICK,
      extra: { click_target: "quick_reply", label },
    });
    setIsSending(true);
    try {
      await onSend(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      label={label}
      onClick={handleClick}
      disabled={disabled || isSending}
      loading={isSending}
    />
  );
}

export function quickReplyDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "quickReply" && node.children?.[0]) {
        const label = node.children[0].value;
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "quickReply";
        data.hProperties = {
          label,
          message: node.attributes?.message ?? label,
        };
      }
    });
  };
}

export function getQuickReplyPlugin(
  onSend: (message: string) => Promise<void>,
  isLastMessage: boolean
) {
  function QuickReplyPlugin({
    label,
    message,
  }: {
    label: string;
    message: string;
  }) {
    return (
      <QuickReplyBlock
        label={label}
        message={message}
        disabled={!isLastMessage}
        onSend={onSend}
      />
    );
  }

  return QuickReplyPlugin;
}
