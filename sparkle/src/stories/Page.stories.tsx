import type { Meta } from "@storybook/react";
import React from "react";

import { ChatBubbleLeftRight } from "@sparkle/icons/solid";
import { QuestionMarkCircle, ShakeHands } from "@sparkle/icons/stroke";

import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  ContextItem,
  FlagStrokeIcon,
  Page,
} from "../index_with_tw_base";

const meta = {
  title: "Template/Page",
  component: Page,
} satisfies Meta<typeof Page>;

export default meta;

export const PageHorExample = () => {
  return (
    <Page>
      <Page.Horizontal>
        <div className="s-h-16 s-w-16 s-bg-brand" />
      </Page.Horizontal>
      <Page.Header
        title="Title"
        description="Description"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <Page.P>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod
        a massa quis lacinia. Donec euismod nisl eget nunc Lorem ipsum dolor sit
        amet, consectetur adipiscing elit. Nullam euismod a massa quis lacinia.
        Donec euismod nisl eget nunc
      </Page.P>
      <Page.SectionHeader
        title="Section Title"
        description="Section Description"
        action={{ label: "Action", size: "sm" }}
      />
    </Page>
  );
};

export const PageExample = () => {
  return (
    <Page>
      <Page.Header
        title="Title"
        description="Description"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <Page.P>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod
        a massa quis lacinia. Donec euismod nisl eget nunc Lorem ipsum dolor sit
        amet, consectetur adipiscing elit. Nullam euismod a massa quis lacinia.
        Donec euismod nisl eget nunc
      </Page.P>
      <Page.SectionHeader
        title="Section Title"
        description="Section Description"
        action={{ label: "Action", size: "sm" }}
      />
      <ContextItem.List>
        <ContextItem
          title="@Gpt4"
          visual={
            <Avatar
              visual="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
              size="sm"
            />
          }
        >
          <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
        </ContextItem>
        <ContextItem
          title="@SalesFr"
          action={<Button variant="secondary" label="Manage" size="sm" />}
          visual={
            <Avatar
              visual="https://dust.tt/static/droidavatar/Droid_Indigo_4.jpg"
              size="sm"
            />
          }
        >
          <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
        </ContextItem>
        <ContextItem
          title="@SupportFr"
          action={<Button variant="secondary" label="Manage" size="sm" />}
          visual={
            <Avatar
              visual="https://dust.tt/static/droidavatar/Droid_Pink_4.jpg"
              size="sm"
            />
          }
        >
          <ContextItem.Description description="Lats, pricing, history of contacts, contact message" />
        </ContextItem>
      </ContextItem.List>
    </Page>
  );
};

export const AssistantBuilder = () => {
  return (
    <Page>
      <Page.Horizontal>
        <Page.Vertical sizing="grow" gap="lg">
          <Page.Vertical gap="xs">
            <Page.H variant="h2">Name / Handle</Page.H>
            <Page.P variant="secondary">
              The handle of your Droid will be used to call your Droïd with an
              “@” hand (for instance @myAssistant).
            </Page.P>
          </Page.Vertical>
          <Page.Vertical gap="xs">
            <Page.H variant="h2">Description</Page.H>
            <Page.P variant="secondary">
              The description helps your collaborators and Dust to understand
              the purpose of the assistant. It must be descriptive and short.
            </Page.P>
          </Page.Vertical>
        </Page.Vertical>
        <Page.Vertical align="center">
          <Avatar
            size="lg"
            visual="https://dust.tt/static/droidavatar/Droid_Black_2.jpg/"
          />
          <Button size="sm" variant="tertiary" label="Change" />
        </Page.Vertical>
      </Page.Horizontal>

      <Page.Vertical sizing="grow" gap="xs">
        <Page.H variant="h2">Instructions</Page.H>
        <Page.P variant="secondary">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
          euismod a massa quis lacinia. Donec euismod nisl eget nunc Lorem ipsum
          dolor sit amet, consectetur adipiscing elit. Nullam euismod a massa
          quis lacinia. Donec euismod nisl eget nunc
        </Page.P>
      </Page.Vertical>

      <Page.Vertical sizing="grow" gap="lg">
        <Page.Vertical sizing="grow" gap="xs">
          <Page.H variant="h2">Data Sources</Page.H>
          <Page.P variant="secondary">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
            euismod a massa quis lacinia. Donec euismod nisl eget nunc Lorem
            ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod a
            massa quis lacinia. Donec euismod nisl eget nunc
          </Page.P>
        </Page.Vertical>
        <Page.Horizontal>
          <Page.Vertical gap="xs" sizing="grow">
            <Page.H variant="h3">
              Setting data sources is not an obligation.
            </Page.H>
            <Page.P variant="secondary">
              By default, your assistant will follow your instructions and
              answer based on commun knowledge.
            </Page.P>
          </Page.Vertical>
          <Page.Vertical gap="xs" sizing="grow">
            <Page.H variant="h3">Choose your data sources with care.</Page.H>
            <Page.P variant="secondary">
              Giving a lot of data is does not always give better results.
              Selecting only the right data is better.
            </Page.P>
          </Page.Vertical>
        </Page.Horizontal>
      </Page.Vertical>
    </Page>
  );
};

export const HelpExample = () => {
  return (
    <Page>
      <Page.Header
        title="Welcome to Assistant"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <Page.Vertical gap="xs" align="left">
        <Page.SectionHeader title="Getting started?" visual={FlagStrokeIcon} />
        <Page.P variant="secondary">
          Using assistant is easy as asking a question to a friend or a
          coworker.
          <br />
          Try it out:
        </Page.P>
        <Button
          variant="primary"
          label="Hey @helper, how do I use the assistant ?"
          icon={ChatBubbleLeftRight}
        />
      </Page.Vertical>
      <Page.Separator />
      <Page.Vertical gap="xs">
        <Page.SectionHeader
          title="Meet your smart friends"
          visual={ShakeHands}
        />
        <Page.P variant="secondary">
          Dust is not just a single assistant, it’s a full team at your service.{" "}
          <br />
          Each member has a set of specific set skills.
        </Page.P>
        <Page.P variant="secondary">Meet some your Droid team:</Page.P>
      </Page.Vertical>
      <Page.Separator />
      <Page.Vertical gap="xs">
        <Page.SectionHeader
          title="Frequently asked questions"
          visual={QuestionMarkCircle}
        />
        <Page.Fluid>
          <Button
            variant="secondary"
            label="Hey @helper, how do I use the assistant?"
            icon={ChatBubbleLeftRight}
            hasMagnifying={false}
          />
          <Button
            variant="secondary"
            label="Hey @helper, What is assistant not good at?"
            icon={ChatBubbleLeftRight}
            hasMagnifying={false}
          />
          <Button
            variant="secondary"
            label="Hey @helper, Anything I should know?"
            icon={ChatBubbleLeftRight}
            hasMagnifying={false}
          />
        </Page.Fluid>
      </Page.Vertical>
    </Page>
  );
};
