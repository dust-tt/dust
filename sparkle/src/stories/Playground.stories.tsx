import React from "react";

import { Button, FlexSplitButton } from "@sparkle/components";
import { ArrowUpIcon, ChevronDownIcon } from "@sparkle/icons/app";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-gap-2">
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
