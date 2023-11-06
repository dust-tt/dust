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
    <ContentMessage title="This is a title">
      This is a message. It can be multiple lines long.
    </ContentMessage>
  </div>
);

export const ContentExampleMultiLine = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <ContentMessage title="This is a title">
      <div className="s-flex s-flex-col s-gap-y-3">
        <div>This is a message. It can be multiple lines long.</div>
        <div>
          Another paragraph in the content message with al long line and some{" "}
          <strong>strong text</strong>.
        </div>
      </div>
    </ContentMessage>
  </div>
);
