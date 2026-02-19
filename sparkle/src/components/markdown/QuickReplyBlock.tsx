// biome-ignore lint/suspicious/noImportCycles: Button -> index -> markdown -> this file
import { Button } from "@sparkle/components/Button";
import { ChatBubbleLeftRightIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import React, { useContext, useState } from "react";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

interface QuickReplyBlockProps {
  label: string;
  message?: string;
  onSend?: (message: string) => Promise<void>;
  onTrack?: (label: string) => void;
  disabled?: boolean;
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

export function QuickReplyContainer({
  children,
  className,
}: QuickReplyContainerProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <QuickReplyContainerContext.Provider
      value={{ onItemExecuted: () => setIsOpen(false) }}
    >
      <div
        className={cn(
          "s-overflow-hidden s-transition-all s-duration-200 s-ease-in-out",
          isOpen ? "s-max-h-[500px] s-opacity-100" : "s-max-h-0 s-opacity-0",
          className
        )}
        aria-hidden={!isOpen}
      >
        <div className="s-flex s-flex-col s-gap-1">{children}</div>
      </div>
    </QuickReplyContainerContext.Provider>
  );
}

export function QuickReplyBlock({
  label,
  message,
  onSend,
  onTrack,
  disabled = false,
  icon = ChatBubbleLeftRightIcon,
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
    <span className={cn("s-float-left s-clear-left s-my-0.5", className)}>
      <Button
        size="sm"
        variant="outline"
        label={label}
        icon={icon}
        onClick={handleClick}
        disabled={disabled || isSending || !onSend}
        isLoading={isSending}
        className={cn(
          "s-h-auto s-whitespace-normal s-py-1.5 s-text-left",
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
