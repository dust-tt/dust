import React, { useEffect, useRef, useState } from "react";

import {
  ArrowUpIcon,
  AttachmentIcon,
  BoltIcon,
  Button,
  cn,
  MicIcon,
  RainbowEffect,
  RobotIcon,
  SquareIcon,
} from "../index_with_tw_base";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  const [isFocused, setIsFocused] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (divRef.current && !divRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <div className="s-flex s-w-[900px] s-flex-1 s-p-0">
      <RainbowEffect
        containerClassName="s-w-full"
        className="s-w-full"
        size={isFocused ? "large" : "medium"}
      >
        <div
          ref={divRef}
          onClick={handleFocus}
          className={cn(
            "s-relative s-flex s-w-full s-flex-row",
            "s-rounded-3xl s-border s-border-border/0 s-bg-primary-50 s-transition-all",
            isFocused
              ? "s-border-border s-ring-2 s-ring-highlight-300 s-ring-offset-2"
              : ""
          )}
        >
          <div className="s-flex s-w-full s-flex-col">
            <div className="s-h-full s-w-full s-p-5">Ask a question</div>
            <div className="s-flex s-w-full s-gap-2 s-p-4">
              <div className="s-flex s-gap-0">
                <Button
                  variant="ghost"
                  icon={AttachmentIcon}
                  size="xs"
                  tooltip="Attach a document"
                />
                <Button
                  variant="ghost"
                  icon={BoltIcon}
                  size="xs"
                  tooltip="Add functionality"
                />
                <Button
                  variant="ghost"
                  icon={RobotIcon}
                  size="xs"
                  tooltip="Mention an Agent"
                />
              </div>
              <div className="s-grow" />
              <div className="s-flex s-items-center s-gap-1">
                <div id="Recording" className="s-flex s-items-center s-gap-3">
                  <div className="s-heading-xs">0:03</div>
                  <div className="s-flex s-h-5 s-items-center s-gap-0.5">
                    <div className="s-h-[22%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[33%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[18%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[64%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[98%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[56%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[6%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[34%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[76%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[46%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[12%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                    <div className="s-h-[22%] s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground" />
                  </div>
                  <Button
                    id="Stop Recording Button"
                    variant="outline"
                    icon={SquareIcon}
                    size="xs"
                    tooltip="Click, or Press & Hold to record"
                    label="Stop"
                  />
                </div>
                <Button
                  id="Record Button"
                  variant="ghost"
                  icon={MicIcon}
                  size="xs"
                  tooltip="Click, or Press & Hold to record"
                />
                <Button
                  variant="highlight"
                  icon={ArrowUpIcon}
                  size="mini"
                  tooltip="Send message"
                  isRounded
                />
              </div>
            </div>
          </div>
        </div>
      </RainbowEffect>
    </div>
  );
};
