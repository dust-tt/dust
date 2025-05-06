import type { Meta } from "@storybook/react";
import React from "react";

import { EmptyCTA, EmptyCTAButton } from "@sparkle/components";
import { CloudArrowDownIcon } from "@sparkle/icons/app";

const meta = {
  title: "Components/EmptyCTA",
} satisfies Meta;

export default meta;

export const Demo = () => {
  return (
    <div>
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
    </div>
  );
};
