import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Citation,
  CitationIcons,
  CitationTitle,
  ConversationMessage,
  GithubIcon,
  Icon,
  MagnifyingGlassIcon,
  SlackLogo,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/ConversationMessage",
  component: ConversationMessage,
} satisfies Meta<typeof ConversationMessage>;

export default meta;

export const ConversationExample = () => {
  return (
    <>
      <div className="s-flex s-w-full s-justify-center s-gap-6">
        <div className="s-w-[800px]">
          <h2 className="s-pb-6 s-text-xl s-font-bold">Size = normal</h2>
          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          >
            I only want to show citations if a citations reactnode has been
            passed
          </ConversationMessage>

          <ConversationMessage
            type="agent"
            name="@assistant"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            buttons={[
              <Button
                icon={MagnifyingGlassIcon}
                label="Search details"
                onClick={() => {}}
              />,
            ]}
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>
                  Source: Thread on #general message from @ed
                </CitationTitle>
              </Citation>,
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={GithubIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Title</CitationTitle>
              </Citation>,
            ]}
          >
            To conditionally render the citations only if a citations React node
            has been passed, you can simply add a conditional check around the
            block that renders the citations. This can be done using a logical
            && operator, which will only render the content on its right side if
            the condition on its left side is true. In this case, the condition
            is the presence of citations.
          </ConversationMessage>

          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          >
            In the invitation email to members sent by their companies, I'm
            trying to write a description of dust. I want it convey that: Dust
            is the place where they can use AI for productivity Dust is where
            they can find answers on the knwledge of the company Make 10
            proposals of short text
          </ConversationMessage>
        </div>
        <div className="s-w-[400px]">
          <h2 className="s-pb-6 s-text-xl s-font-bold">Size = compact</h2>
          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          >
            I only want to show citations if a citations reactnode has been
            passed
          </ConversationMessage>

          <ConversationMessage
            type="agent"
            name="@assistant"
            size="compact"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Pink_3.jpg"
            buttons={[
              <Button
                icon={MagnifyingGlassIcon}
                label="Search details"
                onClick={() => {}}
              />,
            ]}
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={SlackLogo} size="sm" />
                </CitationIcons>
                <CitationTitle>
                  Source: Thread on #general message from @ed
                </CitationTitle>
              </Citation>,
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={GithubIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Title</CitationTitle>
              </Citation>,
            ]}
          >
            To conditionally render the citations only if a citations React node
            has been passed, you can simply add a conditional check around the
            block that renders the citations. This can be done using a logical
            && operator, which will only render the content on its right side if
            the condition on its left side is true. In this case, the condition
            is the presence of citations.
          </ConversationMessage>

          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
          >
            In the invitation email to members sent by their companies, I'm
            trying to write a description of dust. I want it convey that: Dust
            is the place where they can use AI for productivity Dust is where
            they can find answers on the knwledge of the company Make 10
            proposals of short text
          </ConversationMessage>
        </div>
      </div>
    </>
  );
};
