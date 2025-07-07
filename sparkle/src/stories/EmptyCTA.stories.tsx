import type { Meta } from "@storybook/react";
import React from "react";

import { Button } from "@sparkle/components/Button";
import { EmptyCTA, EmptyCTAButton } from "@sparkle/components/EmptyCTA";
import { CloudArrowDownIcon, PlusIcon } from "@sparkle/icons/app";

const meta = {
  title: "Components/EmptyCTA",
} satisfies Meta;

export default meta;

export const Demo = () => {
  return (
    <div className="s-flex s-flex-col s-gap-4">
      <div className="s-flex s-items-center s-space-x-2">
        <EmptyCTA
          action={
            <EmptyCTAButton
              icon={CloudArrowDownIcon}
              label="Create a new space"
            />
          }
          message="You don't have any spaces yet."
        />
      </div>
      <div className="s-flex s-items-center s-space-x-2">
        <EmptyCTA action={<Button icon={PlusIcon} label="Add domain" />} />
      </div>
    </div>
  );
};
