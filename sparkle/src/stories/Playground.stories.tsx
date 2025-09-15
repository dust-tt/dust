import React, { useEffect, useRef, useState } from "react";

import {
  ArrowUpIcon,
  AttachmentIcon,
  BoltIcon,
  Button,
  cn,
  MicIcon,
  PlusIcon,
  RainbowEffect,
  RobotIcon,
  SquareIcon,
} from "../index_with_tw_base";

export default {
  title: "Playground/Playground",
};

export const Demo = () => {
  const [isFocused, setIsFocused] = useState(false);
  const [recordState, setRecordState] = useState<
    "idle" | "pressAndHold" | "recording"
  >("idle");
  const [isPressAndHold, setIsPressAndHold] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const divRef = useRef<HTMLDivElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const mouseDownTimeRef = useRef<number>(0);

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

  // Timer effect for recording and press and hold states
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (recordState === "pressAndHold" || recordState === "recording") {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      // Reset timer when not recording or press and hold
      setElapsedSeconds(0);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [recordState]);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRecordMouseDown = () => {
    console.log("MouseDown - recordState:", recordState);
    mouseDownTimeRef.current = Date.now();
    if (recordState === "idle") {
      setRecordState("pressAndHold");
      setIsPressAndHold(true);
      console.log("Set to pressAndHold, isPressAndHold = true");
    }
  };

  const handleRecordMouseUp = () => {
    const holdDuration = Date.now() - mouseDownTimeRef.current;
    console.log(
      "MouseUp - recordState:",
      recordState,
      "holdDuration:",
      holdDuration
    );
    if (recordState === "pressAndHold") {
      setRecordState("idle");
      console.log("Set to idle from pressAndHold");
      // If held for more than 200ms, it was a press-and-hold, so ignore the upcoming click
      if (holdDuration > 200) {
        console.log("Was press-and-hold, keeping isPressAndHold = true");
        // Keep isPressAndHold true to ignore the click
      } else {
        console.log("Was quick click, setting isPressAndHold = false");
        setIsPressAndHold(false);
        // For quick clicks, directly start recording
        console.log("Starting recording from quick click");
        setRecordState("recording");
      }
    }
  };

  const handleRecordClick = () => {
    console.log(
      "Click - recordState:",
      recordState,
      "isPressAndHold:",
      isPressAndHold
    );

    // Handle stop recording
    if (recordState === "recording") {
      console.log("Setting to idle (stop recording)");
      setRecordState("idle");
      return;
    }

    // Only handle click if we're not in a press-and-hold sequence
    if (!isPressAndHold) {
      if (recordState === "idle") {
        console.log("Setting to recording");
        setRecordState("recording");
      }
    } else {
      console.log("Ignoring click - was press and hold");
      // Reset the flag after ignoring the click
      setIsPressAndHold(false);
    }
  };

  const handleRecordMouseLeave = () => {
    if (recordState === "pressAndHold") {
      setRecordState("idle");
      setIsPressAndHold(false);
    }
  };

  return (
    <div className="s-flex s-h-[600px] s-w-full s-items-end s-justify-center s-border s-border-warning/20 sm:s-p-0 md:s-p-6">
      <div className="s-flex s-w-full s-max-w-[900px] s-flex-1 s-p-0">
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
              "s-border s-border-border/0 s-bg-primary-50 s-transition-all md:s-rounded-3xl",
              isFocused
                ? "s-border-border md:s-ring-2 md:s-ring-highlight-300 md:s-ring-offset-2"
                : ""
            )}
          >
            <div className="s-flex s-w-full s-flex-col">
              <div className="s-h-full s-w-full s-p-5">Ask a question</div>
              <div className="s-flex s-w-full s-gap-2 s-p-4">
                <Button
                  variant="outline"
                  icon={PlusIcon}
                  size="sm"
                  tooltip="Attach a document"
                  className="md:s-hidden"
                />
                <div className="s-hidden s-gap-0 md:s-flex">
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
                <div className="s-flex s-items-center s-gap-2 md:s-gap-1">
                  <div
                    id="Recording"
                    className={cn(
                      "s-duration-600 s-flex s-items-center s-justify-end s-gap-2 s-overflow-hidden s-px-2 s-transition-all s-ease-in-out",
                      recordState === "pressAndHold" ||
                        recordState === "recording"
                        ? "s-w-24 s-opacity-100"
                        : "s-w-6 s-opacity-0"
                    )}
                  >
                    <div className="s-heading-xs s-font-mono">
                      {formatTime(elapsedSeconds)}
                    </div>
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
                  </div>
                  {/* Large */}
                  <Button
                    id={
                      recordState === "recording"
                        ? "Stop Recording Button"
                        : "Record Button"
                    }
                    className="s-hidden md:s-flex"
                    ref={recordButtonRef}
                    variant={
                      recordState === "recording" ? "highlight" : "ghost"
                    }
                    icon={recordState === "recording" ? SquareIcon : MicIcon}
                    size="xs"
                    tooltip={
                      recordState === "recording"
                        ? "Stop recording"
                        : recordState === "pressAndHold"
                          ? ""
                          : "Click, or Press & Hold to record"
                    }
                    label={recordState === "recording" ? "Stop" : undefined}
                    onClick={handleRecordClick}
                    onMouseDown={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseDown
                    }
                    onMouseUp={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseUp
                    }
                    onMouseLeave={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseLeave
                    }
                  />
                  <Button
                    variant="highlight"
                    icon={ArrowUpIcon}
                    size="mini"
                    tooltip="Send message"
                    isRounded
                    disabled={recordState === "recording"}
                    className="s-hidden md:s-flex"
                  />
                  {/* Small */}
                  <Button
                    id={
                      recordState === "recording"
                        ? "Stop Recording Button"
                        : "Record Button"
                    }
                    className="md:s-hidden"
                    ref={recordButtonRef}
                    variant={
                      recordState === "recording" ? "highlight" : "ghost"
                    }
                    icon={recordState === "recording" ? SquareIcon : MicIcon}
                    size="sm"
                    tooltip={
                      recordState === "recording"
                        ? "Stop recording"
                        : recordState === "pressAndHold"
                          ? ""
                          : "Click, or Press & Hold to record"
                    }
                    label={recordState === "recording" ? "Stop" : undefined}
                    onClick={handleRecordClick}
                    onMouseDown={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseDown
                    }
                    onMouseUp={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseUp
                    }
                    onMouseLeave={
                      recordState === "recording"
                        ? undefined
                        : handleRecordMouseLeave
                    }
                  />
                  <Button
                    variant="highlight"
                    icon={ArrowUpIcon}
                    size="sm"
                    tooltip="Send message"
                    isRounded
                    disabled={recordState === "recording"}
                    className="md:s-hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        </RainbowEffect>
      </div>
    </div>
  );
};
