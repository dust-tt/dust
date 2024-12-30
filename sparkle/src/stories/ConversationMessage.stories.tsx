import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Citation,
  CitationIcons,
  CitationTitle,
  ConversationContainer,
  ConversationMessage,
  GithubIcon,
  Icon,
  MagnifyingGlassIcon,
  Markdown,
  SlackLogo,
  TableIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/ConversationMessage",
} satisfies Meta<typeof ConversationMessage>;

export default meta;

export const ConversationExample = () => {
  return (
    <>
      <div className="s-flex s-w-full s-max-w-[896px] s-justify-center s-gap-6">
        <ConversationContainer>
          <ConversationMessage
            type="user"
            name="Edouard"
            pictureUrl="https://dust.tt/static/droidavatar/Droid_Lime_1.jpg"
            citations={[
              <Citation href="https://www.google.com">
                <CitationIcons>
                  <Icon visual={TableIcon} size="sm" />
                </CitationIcons>
                <CitationTitle>Title</CitationTitle>
              </Citation>,
            ]}
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
            <Markdown content={example} />
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
        </ConversationContainer>
        {/* <div className="s-w-[400px]">
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
        </div> */}
      </div>
    </>
  );
};

const example = `
# Level 1 Title

## Level 2 Title

### Level 3 Title

This is a paragraph with **bold** text and *italic* text. This is \`code\` block:
\`\`\`
Block 
\`\`\`

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

# Another Level 1 Title

Demo of a list, showcasing our pets of the month:
- Soupinou
- Chawarma
- Chalom
- Anakine
- Goose

Ordered list: 
1. Soupinou
2. Chawarma
3. Chalom

---

### Demo of a quote below:

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

Another one, a short one:
> Soupinou fait des miaou miaou.

### Other stuff

~~stuff~~
link www.x.com
footnote [^1]

* [ ] to do
* [x] done

### Short Table

| Date        | High Temperature (°C) | Low Temperature (°C) |
|-------------|-----------------------|----------------------|
| October 25  | 19                    | 14                   |
| October 26  | 17                    | 12                   |
| October 27  | 16                    | 10                   |
| October 28  | 16                    | 9                    |
| October 29  | 17                    | 8                    |
| October 30  | 19                    | 8                    |
| October 31  | 19                    | 10                   |

`;
