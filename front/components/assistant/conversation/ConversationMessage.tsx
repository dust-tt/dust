import { Avatar, IconButton } from "@dust-tt/sparkle";
import { uuid4 } from "@temporalio/workflow";
import { ComponentType, MouseEventHandler } from "react";

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  children,
  name,
  pictureUrl,
  buttons,
}: {
  children?: React.ReactNode;
  name: string | null;
  pictureUrl?: string | null;
  buttons?: {
    icon: ComponentType;
    onClick: MouseEventHandler<HTMLButtonElement>;
  }[];
}) {
  return (
    <div className="flex w-full flex-row gap-4">
      <div className="flex-shrink-0">
        <Avatar visual={pictureUrl} name={name || undefined} size="sm" />
      </div>
      <div className="min-w-0 flex-grow">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium">{name}</div>
          <div className="min-w-0 break-words text-base font-normal">
            {children}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row">
        {buttons &&
          buttons.map((button) => (
            <div key={uuid4()}>
              <IconButton
                variant="tertiary"
                size="xs"
                icon={button.icon}
                onClick={button.onClick}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
