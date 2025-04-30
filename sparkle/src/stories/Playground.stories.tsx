import React from "react";

import { Avatar, Button, FlexSplitButton, Icon } from "@sparkle/components";
import { ArrowUpIcon, ChevronDownIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  return (
    <div className="s-flex s-h-full s-w-full s-cursor-pointer s-flex-col s-gap-2">
      <div className="s-group s-flex s-max-w-[200px] s-items-center s-gap-2 s-bg-muted-background s-p-4">
        <Avatar
          size="sm"
          visual="https://lh3.googleusercontent.com/a/ACg8ocItxZ3wFv94own6Sh86W9zOFy4RA_L9A0NtNz2sM0uftazvbhU=s96-c"
          clickable
        />
        <div className="s-flex s-flex-col s-items-start">
          <span
            className={cn(
              "s-heading-sm s-transition-colors s-duration-200",
              "s-text-foreground group-hover:s-text-primary-600 group-active:s-text-primary-950 dark:s-text-foreground-night dark:group-hover:s-text-muted-foreground-night dark:group-active:s-text-primary-950-night"
            )}
          >
            Edouard
          </span>
          <span className="-s-mt-1 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            Dust
          </span>
        </div>
        <Icon
          visual={ChevronDownIcon}
          className="s-text-muted-foreground group-hover:s-text-primary-400 group-active:s-text-primary-950 dark:s-text-foreground-night dark:group-hover:s-text-muted-foreground-night dark:group-active:s-text-primary-950-night"
        />
      </div>
      <div className="s-flex s-gap-3">
        <FlexSplitButton
          label="Send"
          variant={"highlight"}
          icon={ArrowUpIcon}
          splitAction={
            <Button size="mini" variant={"highlight"} icon={ChevronDownIcon} />
          }
        />
        <FlexSplitButton
          label="Send"
          variant={"primary"}
          icon={ArrowUpIcon}
          splitAction={
            <Button size="mini" variant={"primary"} icon={ChevronDownIcon} />
          }
        />
        <FlexSplitButton
          label="Send"
          variant={"outline"}
          icon={ArrowUpIcon}
          splitAction={
            <Button size="mini" variant={"outline"} icon={ChevronDownIcon} />
          }
        />
        <FlexSplitButton
          label="Send"
          variant={"ghost"}
          icon={ArrowUpIcon}
          splitAction={
            <Button size="mini" variant={"ghost"} icon={ChevronDownIcon} />
          }
        />
      </div>
    </div>
  );
};
