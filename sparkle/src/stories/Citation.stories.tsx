import type { Meta } from "@storybook/react";
import React from "react";

import { Citation } from "../index_with_tw_base";

const meta = {
  title: "Molecule/Citation",
  component: Citation,
} satisfies Meta<typeof Citation>;

export default meta;

export const CitationsExample = () => (
  <div className="s-flex s-flex-col s-gap-8">
    <Citation
      title="Source: Thread on #general"
      type="slack"
      href="https://www.google.com"
    />
    <div className="s-flex s-gap-2">
      <Citation
        title="Title"
        type="slack"
        index="1"
        href="https://www.google.com"
        description="Write a 120 character description of the citation here to be displayed in the citation list."
      />
      <Citation
        title="Title"
        type="github"
        index="2"
        href="https://www.google.com"
        description="Write a 120 character description of the citation here to be displayed in the citation list."
      />
      <Citation
        title="Title"
        type="google_drive"
        index="3"
        href="https://www.google.com"
        description="Write a 120 character description of the citation here to be displayed in the citation list."
        isBlinking={true}
      />
    </div>
  </div>
);
