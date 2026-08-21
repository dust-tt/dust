import { Button } from "@sparkle/components/Button";
import { MessageChatSquare } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { useContext, useMemo, useState } from "react";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface QuickReplyBlockProps {
  label: string;
  /** Message sent when tapped; defaults to `label`. */
  message?: string;
  /** Async send handler — the block shows a pending state until the promise settles, so return the actual send promise. */
  onSend?: (message: string) => Promise<void>;
  /** Analytics callback invoked with the label when the reply is tapped. */
  onTrack?: (label: string) => void;
  disabled?: boolean;
  /** Icon shown on the button (defaults to MessageChatSquare). */
  icon?: React.ComponentType;
  className?: string;
  buttonClassName?: string;
}

interface QuickReplyContainerProps {
  children: React.ReactNode;
  className?: string;
}

type QuickReplyContainerContextValue = {
  onItemExecuted?: () => void;
};

const QuickReplyContainerContext =
  React.createContext<QuickReplyContainerContextValue | null>(null);

/**
 * Groups QuickReplyBlock children, laying them out vertically and collapsing
 * the whole group once one reply has been sent. Always wrap quick replies in
 * this container rather than rendering loose buttons; remount via a React
 * `key` to reset it.
 * @summary Collapsing container for quick-reply suggestions.
 */
export function QuickReplyContainer({
  children,
  className,
}: QuickReplyContainerProps) {
  const [isOpen, setIsOpen] = useState(true);

  const quickReplyContextValue = useMemo(
    () => ({ onItemExecuted: () => setIsOpen(false) }),
    []
  );

  return (
    <QuickReplyContainerContext.Provider value={quickReplyContextValue}>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
          className
        )}
        aria-hidden={!isOpen}
      >
        <div className="flex flex-col gap-1">{children}</div>
      </div>
    </QuickReplyContainerContext.Provider>
  );
}

/**
 * A tappable suggested-reply button that sends a predefined message back to
 * the agent (e.g. "Summarize this", "Tell me more") — shown after an agent
 * response, with a pending state while the async `onSend` resolves. Rendered
 * inside Markdown output via the `:quickReply` directive.
 * @summary One-tap suggested reply for agent messages.
 */
export function QuickReplyBlock({
  label,
  message,
  onSend,
  onTrack,
  disabled = false,
  icon = MessageChatSquare,
  className,
  buttonClassName,
}: QuickReplyBlockProps) {
  const containerContext = useContext(QuickReplyContainerContext);
  const [isSending, setIsSending] = useState(false);
  const resolvedMessage = message ?? label;

  const handleClick = async () => {
    if (isSending || disabled || !onSend) {
      return;
    }

    onTrack?.(label);
    setIsSending(true);
    try {
      await onSend(resolvedMessage);
      containerContext?.onItemExecuted?.();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <span className={cn("float-left clear-left my-0.5", className)}>
      <Button
        size="sm"
        variant="outline"
        label={label}
        icon={icon}
        onClick={handleClick}
        disabled={disabled || isSending || !onSend}
        isLoading={isSending}
        className={cn(
          "h-auto whitespace-normal py-1.5 text-left",
          buttonClassName
        )}
      />
    </span>
  );
}

type QuickReplyDirectiveNode = Node & {
  name?: string;
  children?: { value?: string }[];
  data?: {
    hName?: string;
    hProperties?: {
      label?: string;
      message?: string;
    };
  };
  attributes?: {
    message?: string;
  };
};

/**
 * Remark plugin turning `:quickReply[label]{message="..."}` text directives in
 * Markdown content into `quickReply` elements handled by getQuickReplyPlugin.
 * @summary Remark directive for quick replies.
 */
export function quickReplyDirective() {
  return (tree: Node) => {
    visit(tree, ["textDirective"], (node) => {
      const directive = node as QuickReplyDirectiveNode;
      if (directive.name === "quickReply" && directive.children?.[0]) {
        const label = directive.children[0].value;
        const data = directive.data || (directive.data = {});
        data.hName = "quickReply";
        data.hProperties = {
          label,
          message: directive.attributes?.message ?? label,
        };
      }
    });
  };
}

/**
 * Builds the react-markdown component that renders `quickReply` elements as
 * QuickReplyBlock, binding the send handler and disabling replies on messages
 * that are not the last one.
 * @summary Factory for the quickReply Markdown component.
 */
export function getQuickReplyPlugin(
  onSend: (message: string) => Promise<void>,
  isLastMessage: boolean,
  {
    onTrack,
    icon,
    className,
    buttonClassName,
  }: {
    onTrack?: (label: string) => void;
    icon?: React.ComponentType;
    className?: string;
    buttonClassName?: string;
  } = {}
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
        onTrack={onTrack}
        icon={icon}
        className={className}
        buttonClassName={buttonClassName}
      />
    );
  }

  return QuickReplyPlugin;
}
