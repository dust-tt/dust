import type { Meta } from "@storybook/react";
import React from "react";

import {
  ChatBubbleBottomCenterTextIcon,
  ContentMessage,
  HeartIcon,
  InformationCircleIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Components/ContentMessage",
  component: ContentMessage,
} satisfies Meta<typeof ContentMessage>;

export default meta;

export const ContentExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>Size "lg"</h2>
    <ContentMessage
      title="This is a title"
      size="lg"
      icon={InformationCircleIcon}
    >
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a title" variant="slate" size="lg">
      Should search internal data as this appears to be a code-related question
      specific to the company's codebase Search results show that
      Page.SectionHeader expects a string title, but code is using JSX
      expression with concatenation
    </ContentMessage>
    <ContentMessage
      title="This is a title"
      variant="emerald"
      size="lg"
      icon={InformationCircleIcon}
    >
      This is a message. It can be multiple lines long.
    </ContentMessage>

    <h2>Size "md"</h2>
    <ContentMessage
      title="Assistant Thoughts"
      variant="slate"
      icon={ChatBubbleBottomCenterTextIcon}
    >
      <ul className="purple-800 s-list-disc s-py-2 s-pl-8 first:s-pt-0 last:s-pb-0">
        <li className="purple-800 s-break-words s-py-1 first:s-pt-0 last:s-pb-0">
          <div className="purple-800 s-whitespace-pre-wrap s-break-words s-py-1 s-font-normal first:s-pt-0 last:s-pb-0">
            Should search internal data as this appears to be a code-related
            question specific to the company's codebase
          </div>
        </li>
        <li className="purple-800 s-break-words s-py-1 first:s-pt-0 last:s-pb-0">
          <div className="purple-800 s-whitespace-pre-wrap s-break-words s-py-1 s-font-normal first:s-pt-0 last:s-pb-0">
            Search results show that Page.SectionHeader expects a string title,
            but code is using JSX expression with concatenation
          </div>
        </li>
      </ul>
    </ContentMessage>
    <ContentMessage
      title="This is a title"
      variant="pink"
      icon={InformationCircleIcon}
    >
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage title="This is a cat" variant="purple" icon={HeartIcon}>
      This is a Soupinou. It is cute.
    </ContentMessage>

    <h2>Size "sm"</h2>
    <ContentMessage size="sm">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage variant="pink" size="sm">
      This is a message. It can be multiple lines long.
    </ContentMessage>
    <ContentMessage variant="emerald" size="sm" icon={InformationCircleIcon}>
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
