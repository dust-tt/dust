import type { Meta } from "@storybook/react";
import React from "react";

import { ChatBubbleLeftRightIcon } from "@sparkle/icons/solid";

import {
  Avatar,
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowLeftRightIcon,
  ContextItem,
  FolderIcon,
  GlobeAltIcon,
  Icon,
  Page,
  RocketIcon,
} from "../index_with_tw_base";

const meta = {
  title: "Modules/Page",
  component: Page,
} satisfies Meta<typeof Page>;

export default meta;

export const PageSimpleExample = () => {
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
      <Page.Layout direction="horizontal">
        <div className="s-h-16 s-w-16 s-bg-brand" />
      </Page.Layout>
    </Page>
  );
};

export const QIGExample = () => {
  return (
    <Page>
      <Page.Header
        icon={RocketIcon}
        title={
          <>
            Get Started: <br />
            Quick Guide for new members
          </>
        }
      />

      <Page.Horizontal>
        <Page.Vertical sizing="grow">
          <Page.H>
            👋 <br />
            Hello <br /> <span className="text-success-500">@mentions</span>
          </Page.H>
          <Page.P>
            In Dust, you won't find just one AI assistant, but multiple ones.
          </Page.P>
          <Page.P>
            You can call any assistant at any time by typing “@” and the name of
            the assistant.
          </Page.P>
        </Page.Vertical>
        <Page.Vertical sizing="grow">
          <img src="/static/quick_start_guide_input_bar.png" />
        </Page.Vertical>
      </Page.Horizontal>
      <Page.Horizontal>
        <Page.Vertical>
          <Page.H>
            👩‍🎨🦸‍♀️🥷🧑‍🚀
            <br /> Why multiple
            <br /> Assistants?
          </Page.H>

          <Page.P>
            The basic assistant is{" "}
            <span className="font-bold text-success-500">@gpt4</span>. It is a
            raw model. “Raw” means it does not have particular instructions or
            access to knowledge.
          </Page.P>
          <Page.P>
            You also have access to assistants that use a raw model (gpt4 for
            instance), AND give them specific instructions and access to
            knowledge.{" "}
            <span className="font-bold">
              They can answer specific questions, really well.
            </span>
          </Page.P>
          <Page.P>
            Assistants can be provided by Dust, by your company (Company
            assistants), by your coworkers (Shared assistants).
          </Page.P>
        </Page.Vertical>

        <Page.Vertical>
          <Page.H>
            🛠️
            <br />
            How to make
            <br />
            an Assistant?
          </Page.H>
          <Page.P>You can build Assistants!</Page.P>
          <Page.P>
            Assistants starts with an “instruction”. A simple text, explaining
            what you want them to do.
          </Page.P>
          <Page.P>
            For instance, <span className="italic">“Act as a doctor”</span>,{" "}
            <span className="italic">“Summarise this document”</span>,{" "}
            <span className="italic">“What do you know about X”</span>.
          </Page.P>
          <Page.P>
            You can give them access to knowledge.
            <br />
            We call them <span className="font-bold">Data sources.</span>
          </Page.P>
          <Page.P>
            With the right Data source, assistants can answer demands like
            <span className="italic">
              “Have we been working with company X”
            </span>
            , <span className="italic">“How do we manage expenses”</span>,{" "}
            <span className="italic">
              “Write an intro email using the company tone of voice”...
            </span>
          </Page.P>
        </Page.Vertical>
      </Page.Horizontal>

      <Page.Vertical>
        <Page.H>
          📚
          <br />
          What are
          <br />
          Data sources?
        </Page.H>

        <Page.P>
          To augment your assistants with knowledge, you give them data.
          <br /> Data can comes in different ways in Dust.{" "}
          <span className="font-bold">Here are the three main ways:</span>
        </Page.P>
        <Page.Horizontal>
          <Page.Vertical sizing="grow">
            <div className="flex items-center gap-2">
              <Icon visual={CloudArrowLeftRightIcon} />{" "}
              <Page.H variant="h6">Connections</Page.H>
            </div>
            <Page.P>
              Notion, Slack, Google Drive... Dust can connect to multiple
              platforms and make syncronise your data.
            </Page.P>
          </Page.Vertical>
          <Page.Vertical sizing="grow">
            <Page.Horizontal>
              <div className="flex items-center gap-2">
                <Icon visual={FolderIcon} />{" "}
                <Page.H variant="h6">Folders</Page.H>
              </div>
            </Page.Horizontal>
            <Page.P>Upload files (text, pdf, csv) directly in Dust.</Page.P>
          </Page.Vertical>
          <Page.Vertical sizing="grow">
            <Page.Horizontal>
              <div className="flex items-center gap-2">
                <Icon visual={GlobeAltIcon} />{" "}
                <Page.H variant="h6">Websites</Page.H>
              </div>
            </Page.Horizontal>
            <Page.P>
              Any public website can be synced in Dust. Think FAQ, wikipedia
              pages, documentation...
            </Page.P>
          </Page.Vertical>
        </Page.Horizontal>
      </Page.Vertical>
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
      <Page.Layout direction="horizontal">
        <Page.Layout direction="vertical" sizing="grow" gap="lg">
          <Page.H variant="h2">Identity</Page.H>
          <Page.Layout direction="vertical" gap="xs">
            <Page.H variant="h4">Name / Handle</Page.H>
            <Page.P variant="secondary">
              The handle of your Droid will be used to call your Droïd with an
              “@” hand (for instance @myAssistant).
            </Page.P>
          </Page.Layout>
          <Page.Layout direction="vertical" gap="xs">
            <Page.H variant="h4">Description</Page.H>
            <Page.P variant="secondary">
              The description helps your collaborators and Dust to understand
              the purpose of the assistant. It must be descriptive and short.
            </Page.P>
          </Page.Layout>
        </Page.Layout>
        <Page.Layout direction="vertical" align="center">
          <Avatar
            size="xl"
            visual="https://dust.tt/static/droidavatar/Droid_Black_2.jpg/"
          />
          <Button size="sm" variant="tertiary" label="Change" />
        </Page.Layout>
      </Page.Layout>
      <Page.Separator />
      <Page.Layout direction="vertical" sizing="grow" gap="xs">
        <Page.H variant="h2">Instructions</Page.H>
        <Page.P variant="secondary">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
          euismod a massa quis lacinia. Donec euismod nisl eget nunc Lorem ipsum
          dolor sit amet, consectetur adipiscing elit. Nullam euismod a massa
          quis lacinia. Donec euismod nisl eget nunc
        </Page.P>
      </Page.Layout>
      <Page.Separator />
      <Page.Layout direction="vertical" sizing="grow" gap="lg">
        <Page.Layout direction="vertical" sizing="grow" gap="xs">
          <Page.H variant="h2">Actions</Page.H>
          <Page.P variant="secondary">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
            euismod a massa quis lacinia. Donec euismod nisl eget nunc Lorem
            ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod a
            massa quis lacinia. Donec euismod nisl eget nunc
          </Page.P>
        </Page.Layout>
        <Page.Layout direction="horizontal">
          <Page.Layout direction="vertical" gap="xs" sizing="grow">
            <Page.H variant="h5">
              Setting data sources is not an obligation.
            </Page.H>
            <Page.P variant="secondary">
              By default, your assistant will follow your instructions and
              answer based on commun knowledge.
            </Page.P>
          </Page.Layout>
          <Page.Layout direction="vertical" gap="xs" sizing="grow">
            <Page.H variant="h5">Choose your data sources with care.</Page.H>
            <Page.P variant="secondary">
              Giving a lot of data is does not always give better results.
              Selecting only the right data is better.
            </Page.P>
          </Page.Layout>
        </Page.Layout>
      </Page.Layout>
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
      <Page.Layout direction="vertical" gap="xs" align="left">
        <Page.SectionHeader title="Getting started?" />
        <Page.P variant="secondary">
          Using assistant is easy as asking a question to a friend or a
          coworker.
          <br />
          Try it out:
        </Page.P>
        <Button
          variant="primary"
          label="Hey @helper, how do I use the assistant ?"
          icon={ChatBubbleLeftRightIcon}
        />
      </Page.Layout>
      <Page.Separator />
      <Page.Layout direction="vertical" gap="xs">
        <Page.SectionHeader title="Meet your smart friends" />
        <Page.P variant="secondary">
          Dust is not just a single assistant, it’s a full team at your service.{" "}
          <br />
          Each member has a set of specific set skills.
        </Page.P>
        <Page.P variant="secondary">Meet some your Droid team:</Page.P>
      </Page.Layout>
      <Page.Separator />
      <Page.Layout direction="vertical" gap="xs">
        <Page.SectionHeader title="Frequently asked questions" />
        <Page.Layout direction="fluid" gap="sm">
          <Button
            variant="secondary"
            label="Hey @helper, how do I use the assistant?"
            icon={ChatBubbleLeftRightIcon}
            hasMagnifying={false}
          />
          <Button
            variant="secondary"
            label="Hey @helper, What is assistant not good at?"
            icon={ChatBubbleLeftRightIcon}
            hasMagnifying={false}
          />
          <Button
            variant="secondary"
            label="Hey @helper, Anything I should know?"
            icon={ChatBubbleLeftRightIcon}
            hasMagnifying={false}
          />
        </Page.Layout>
      </Page.Layout>
    </Page>
  );
};
