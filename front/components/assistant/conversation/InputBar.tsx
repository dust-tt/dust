import { PaperAirplaneIcon } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { classNames } from "@app/lib/utils";
import { MentionType } from "@app/types/assistant/conversation";

export function AssistantInputBar({
  onSubmit,
}: {
  onSubmit: (input: string, mentions: MentionType[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  });

  return (
    <div className="flex flex-1">
      <div className="flex flex-1 flex-row items-center">
        <div className="flex flex-1 flex-row items-end items-stretch">
          <TextareaAutosize
            minRows={1}
            placeholder={"Ask a question"}
            className={classNames(
              "flex w-full resize-none bg-white text-base ring-0 focus:ring-0",
              "rounded-sm rounded-xl border-2",
              "border-action-200 text-element-800 drop-shadow-2xl focus:border-action-300 focus:ring-0",
              "placeholder-gray-400",
              "px-3 py-3 pr-8"
            )}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
            }}
            ref={inputRef}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                void onSubmit(input, []);
                e.preventDefault();
                setInput("");
              }
            }}
            autoFocus={true}
          />
          <div className={classNames("z-10 -ml-8 flex flex-col")}>
            <PaperAirplaneIcon
              className="my-auto h-5 w-5 cursor-pointer text-action-500"
              onClick={() => {
                void onSubmit(input, []);
                setInput("");
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FixedAssistantInputBar({
  onSubmit,
}: {
  onSubmit: (input: string, mentions: MentionType[]) => void;
}) {
  return (
    <div className="4xl:px-0 fixed bottom-0 left-0 right-0 z-20 flex-initial px-2 lg:left-80">
      <div className="mx-auto max-w-4xl pb-12">
        <AssistantInputBar onSubmit={onSubmit} />
      </div>
    </div>
  );
}
