import type { Meta } from "@storybook/react";
import React from "react";

import { ContentMessage } from "../index_with_tw_base";

const meta = {
  title: "Atoms/ContentMessage",
  component: ContentMessage,
} satisfies Meta<typeof ContentMessage>;

export default meta;

export const ContentExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <ContentMessage
      title="This is a title"
      message="This is a message. It can be multiple lines long."
    />
  </div>
);
