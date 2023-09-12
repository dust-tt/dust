import { Avatar } from "@dust-tt/sparkle";

import { UserMessageType } from "@app/types/assistant/conversation";

export function UserMessage({ message }: { message: UserMessageType }) {
  return (
    <div className="bg-structure-50 py-6">
      <div className="mx-auto flex max-w-4xl gap-4 px-6">
        <div className="flex-shrink-0">
          {message.user && <Avatar visual={message?.user.image} size="sm" />}
        </div>
        <div className="flex-grow">
          <div className="flex flex-col gap-4">
            <div className="text-sm font-medium">
              {message.context.fullName}
            </div>
            <div className="text-base font-normal">{message.content}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
