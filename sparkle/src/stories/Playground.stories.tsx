import React from "react";

import { MiniButton, SplitButton2 } from "@sparkle/components";
import { ArrowUpIcon, ChevronDownIcon } from "@sparkle/icons";

export default {
  title: "Playground/Demo",
};

export const Demo = () => {
  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-gap-2">
      <div className="s-flex s-gap-3">
        <SplitButton2
          label="Send"
          variant={"highlight"}
          icon={ArrowUpIcon}
          splitAction={
            <MiniButton variant={"highlight"} icon={ChevronDownIcon} />
          }
        />
        <SplitButton2
          label="Send"
          variant={"primary"}
          icon={ArrowUpIcon}
          splitAction={
            <MiniButton variant={"primary"} icon={ChevronDownIcon} />
          }
        />
        <SplitButton2
          label="Send"
          variant={"outline"}
          icon={ArrowUpIcon}
          splitAction={
            <MiniButton variant={"outline"} icon={ChevronDownIcon} />
          }
        />
        <SplitButton2
          label="Send"
          variant={"ghost"}
          icon={ArrowUpIcon}
          splitAction={<MiniButton variant={"ghost"} icon={ChevronDownIcon} />}
        />
      </div>
    </div>
  );
};
