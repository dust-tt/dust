import type { Meta } from "@storybook/react";
import React from "react";

import { ContentMessage, HeartIcon } from "../index_with_tw_base";

const meta = {
  title: "Components/ContentMessage",
  component: ContentMessage,
} satisfies Meta<typeof ContentMessage>;

export default meta;

export const ContentExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>Size "md"</h2>
    <ContentMessage title="This is a title">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a title" variant="pink">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a cat" variant="purple" icon={HeartIcon}>
      This is a Soupinou. It is cute.
    </ContentMessage>
    <h2>Size "sm"</h2>
    <ContentMessage title="This is a title" size="sm">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a title" variant="pink" size="sm">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a title" variant="emerald" size="sm">
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

export const ContentExamplePink = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <ContentMessage title="This is a title" variant="pink">
      This is a message. It can be multiple lines long.
    </ContentMessage>
  </div>
);
