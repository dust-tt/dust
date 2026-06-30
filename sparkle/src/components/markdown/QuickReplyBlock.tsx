import { Button } from "@sparkle/components/Button";
import { MessageChatSquare } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, { useContext, useMemo, useState } from "react";
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
