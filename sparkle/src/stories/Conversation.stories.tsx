import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Chip,
  Citation,
  Conversation,
  MagnifyingGlassIcon,
  MagnifyingGlassStrokeIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/Conversation",
  component: Conversation,
} satisfies Meta<typeof Conversation>;

export default meta;

export const ConversationExample = () => {
  return (
    <>
      <div className="s-flex s-w-full s-justify-center s-gap-6">
        <div className="s-w-[800px]">
          <h2 className="s-pb-6 s-text-xl s-font-bold">Size = normal</h2>
          <Conversation>
            <Conversation.Message
              type="user"
              header={{
                name: "Edouard",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
              }}
              message={{
                message:
                  "I only want to show citations if a citations reactnode has been passed",
              }}
            />
            <Conversation.Message
              type="agent"
              header={{
                name: "@assistant",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
                onClick: () => console.log("click"),
              }}
              message={{
                action: (
                  <Button
                    variant="tertiary"
                    size="xs"
                    label="Search details"
                    icon={MagnifyingGlassIcon}
                  />
                ),
                citations: (
                  <>
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      size="xs"
                      sizing="fluid"
                      index="2"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      size="xs"
                      sizing="fluid"
                      index="2"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      sizing="fluid"
                      size="xs"
                      index="2"
                      href="https://www.google.com"
                    />
                  </>
                ),
                message: (
                  <>
                    To conditionally render the citations only if a citations
                    React node has been passed, you can simply add a conditional
                    check around the block that renders the citations. This can
                    be done using a logical && operator, which will only render
                    the content on its right side if the condition on its left
                    side is true. In this case, the condition is the presence of
                    citations.
                  </>
                ),
              }}
              actions={
                <>
                  <Button variant="tertiary" size="xs" label="edit" />
                  <Button variant="tertiary" size="xs" label="edit" />
                </>
              }
            />
            <Conversation.Message
              type="user"
              header={{
                name: "Edouard",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
              }}
              message={{
                message: (
                  <>
                    In the invitation email to members sent by their companies,
                    I'm trying to write a description of dust. I want it convey
                    that: Dust is the place where they can use AI for
                    productivity Dust is where they can find answers on the
                    knwledge of the company Make 10 proposals of short text
                  </>
                ),
              }}
            />
            <Conversation.Message
              type="agent"
              header={{
                isBusy: true,
                name: "@assistant",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
                onClick: () => console.log("click"),
              }}
              message={{
                action: (
                  <Chip
                    color="pink"
                    icon={MagnifyingGlassStrokeIcon}
                    label="Searching"
                    size="sm"
                    isBusy
                  />
                ),
              }}
            />
          </Conversation>
        </div>
        <div className="s-w-[400px]">
          <h2 className="s-pb-6 s-text-xl s-font-bold">Size = compact</h2>
          <Conversation size="compact">
            <Conversation.Message
              type="user"
              header={{
                name: "Edouard",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
              }}
              message={{
                message:
                  "I only want to show citations if a citations reactnode has been passed",
              }}
            />
            <Conversation.Message
              type="agent"
              header={{
                name: "@assistant",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
                onClick: () => console.log("click"),
              }}
              message={{
                action: (
                  <Button
                    variant="tertiary"
                    size="xs"
                    label="Search details"
                    icon={MagnifyingGlassIcon}
                  />
                ),
                citations: (
                  <>
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      size="xs"
                      sizing="fluid"
                      index="2"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      size="xs"
                      sizing="fluid"
                      index="2"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Source: Thread on #general message from @ed"
                      size="xs"
                      sizing="fluid"
                      type="slack"
                      index="1"
                      href="https://www.google.com"
                    />
                    <Citation
                      title="Title"
                      type="github"
                      sizing="fluid"
                      size="xs"
                      index="2"
                      href="https://www.google.com"
                    />
                  </>
                ),
                message: (
                  <>
                    To conditionally render the citations only if a citations
                    React node has been passed, you can simply add a conditional
                    check around the block that renders the citations. This can
                    be done using a logical && operator, which will only render
                    the content on its right side if the condition on its left
                    side is true. In this case, the condition is the presence of
                    citations.
                  </>
                ),
              }}
              actions={
                <>
                  <Button variant="tertiary" size="xs" label="edit" />
                  <Button variant="tertiary" size="xs" label="edit" />
                </>
              }
            />
            <Conversation.Message
              type="user"
              header={{
                name: "Edouard",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Lime_1.jpg",
              }}
              message={{
                message: (
                  <>
                    In the invitation email to members sent by their companies,
                    I'm trying to write a description of dust. I want it convey
                    that: Dust is the place where they can use AI for
                    productivity Dust is where they can find answers on the
                    knwledge of the company Make 10 proposals of short text
                  </>
                ),
              }}
            />
            <Conversation.Message
              type="agent"
              header={{
                isBusy: true,
                name: "@assistant",
                avatarUrl:
                  "https://dust.tt/static/droidavatar/Droid_Pink_3.jpg",
                onClick: () => console.log("click"),
              }}
              message={{
                action: (
                  <Chip
                    color="pink"
                    icon={MagnifyingGlassStrokeIcon}
                    label="Searching"
                    size="sm"
                    isBusy
                  />
                ),
              }}
            />
          </Conversation>
        </div>
      </div>
    </>
  );
};
