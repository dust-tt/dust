import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { fn } from "storybook/test";

import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Input,
  Page,
  Separator,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  TextArea,
} from "@sparkle/components";

import {
  DotsHorizontal,
  Edit04,
  Folder,
  Globe01,
  Rocket02,
  Trash01,
} from "@sparkle/icons/v2-stroke";
import { CloudArrowLeftRight, Star01 } from "@sparkle/icons/v2-stroke";

const meta = {
  title: "Overlays/Sheet",
  parameters: {
    docs: {
      description: {
        component: `A panel that slides in from an edge of the screen, built on Radix Dialog. It composes from **SheetTrigger**, **SheetContent** (with a \`side\` and \`size\`), **SheetHeader** (**SheetTitle**, **SheetDescription**), **SheetContainer** for the scrollable body, and **SheetFooter**, which renders up to three actions via \`leftButtonProps\`, \`rightButtonProps\`, and \`rightEndButtonProps\`.

**When to use**
- For secondary tasks, detail views, or forms that benefit from more room than a popover but shouldn't navigate away.

**Guidelines**
- Always give **SheetContent** a **SheetHeader** with a **SheetTitle** for context and accessibility.
- Put scrollable body content inside **SheetContainer** and keep actions in **SheetFooter**.
- For a multi-step flow inside a sheet, use **MultiPageSheet**; for a focus-blocking centered modal, use **Dialog**.`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The canonical composition: a trigger opens a left-side sheet holding a small
 * form, with a header, a scrollable **SheetContainer** body, and a
 * **SheetFooter** carrying Cancel / Save actions.
 * @summary Form sheet with header, body, and footer actions.
 */
export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" label="Edit profile" />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader hideButton>
          <SheetTitle>About me</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <Input label="Firstname" placeholder="John" />
            <Input label="Lastname" placeholder="Doe" />
            <div className="text-xs text-muted-foreground">
              Tip: Press Cmd/Ctrl + Enter to Save
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          sheetCloseClassName="flex gap-2"
          leftButtonProps={{ label: "Cancel", variant: "warning" }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: fn(),
          }}
        />
      </SheetContent>
    </Sheet>
  ),
};

/**
 * A large (`size="xl"`) sheet whose body holds long rich content: the
 * **SheetContainer** scrolls independently while the header stays pinned.
 * @summary Extra-large sheet with long scrollable content.
 */
export const WithScrollableContent: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" label="Open quick guide" />
      </SheetTrigger>
      <SheetContent size="xl">
        <SheetHeader>
          <Page.Header title={<>Quick Guide for new members</>} />
        </SheetHeader>
        <SheetContainer>
          <QuickGuide />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  ),
};

const AgentActionsMenu = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={DotsHorizontal}
          onClick={(event) => {
            event.currentTarget.focus();
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <DropdownMenuItem label="Duplicate" />
        <DropdownMenuItem label="Copy link" />
        <DropdownMenuItem label="Archive" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * **SheetHeader** accepts arbitrary content: here an agent profile with an
 * **Avatar**, a title and description, and a row of action buttons including
 * a dropdown menu.
 * @summary Custom header with avatar and action buttons.
 */
export const WithCustomHeader: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" label="View agent" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <div className="flex flex-col gap-2">
            <Avatar
              size="md"
              name="Aria Doe"
              visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
            />
            <div className="flex flex-col gap-0">
              <SheetTitle>@coucou</SheetTitle>
              <SheetDescription>
                The agent that always says hello.
              </SheetDescription>
            </div>
            <div className="flex gap-2">
              <Button icon={Star01} variant={"outline"} />
              <Separator orientation="vertical" />
              <Button icon={Edit04} variant={"outline"} />
              <Button icon={Trash01} variant={"outline"} />
              <AgentActionsMenu />
            </div>
          </div>
        </SheetHeader>
        <SheetContainer>
          <TextArea placeholder="Describe what the agent should do…" />
        </SheetContainer>
      </SheetContent>
    </Sheet>
  ),
};

const QuickGuide: React.FC = () => (
  <div className="flex flex-col gap-5">
    <Page.Horizontal>
      <Page.Vertical>
        <Page.H>
          👩‍🎨🦸‍♀️🥷🧑‍🚀
          <br /> Why multiple
          <br /> Agents?
        </Page.H>

        <Page.P>
          The basic agent is{" "}
          <span className="font-bold text-success-500">@gpt4</span>. It is a raw
          model. “Raw” means it does not have particular instructions or access
          to knowledge.
        </Page.P>
        <Page.P>
          You also have access to agents that use a raw model (gpt4 for
          instance), AND give them specific instructions and access to
          knowledge.{" "}
          <span className="font-bold">
            They can answer specific questions, really well.
          </span>
        </Page.P>
        <Page.P>
          Agents can be provided by Dust, by your company (Company agents), or
          by your coworkers (Shared agents).
        </Page.P>
      </Page.Vertical>

      <Page.Vertical>
        <Page.H>
          🛠️
          <br />
          How to make
          <br />
          an Agent?
        </Page.H>
        <Page.P>You can build agents!</Page.P>
        <Page.P>
          Agents start with an “instruction”. A simple text, explaining what you
          want them to do.
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
          With the right Data source, agents can answer demands like
          <span className="italic">“Have we been working with company X”</span>,{" "}
          <span className="italic">“How do we manage expenses”</span>,{" "}
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
        To augment your agents with knowledge, you give them data.
        <br /> Data can come in different ways in Dust.{" "}
        <span className="font-bold">Here are the three main ways:</span>
      </Page.P>
      <Page.Horizontal>
        <Page.Vertical sizing="grow">
          <div className="flex items-center gap-2">
            <Icon visual={CloudArrowLeftRight} />{" "}
            <Page.H variant="h6">Connections</Page.H>
          </div>
          <Page.P>
            Notion, Slack, Google Drive... Dust can connect to multiple
            platforms and synchronize your data.
          </Page.P>
        </Page.Vertical>
        <Page.Vertical sizing="grow">
          <Page.Horizontal>
            <div className="flex items-center gap-2">
              <Icon visual={Folder} /> <Page.H variant="h6">Folders</Page.H>
            </div>
          </Page.Horizontal>
          <Page.P>Upload files (text, pdf, csv) directly in Dust.</Page.P>
        </Page.Vertical>
        <Page.Vertical sizing="grow">
          <Page.Horizontal>
            <div className="flex items-center gap-2">
              <Icon visual={Globe01} /> <Page.H variant="h6">Websites</Page.H>
            </div>
          </Page.Horizontal>
          <Page.P>
            Any public website can be synced in Dust. Think FAQ, Wikipedia
            pages, documentation...
          </Page.P>
        </Page.Vertical>
      </Page.Horizontal>
    </Page.Vertical>
    <Page.Vertical sizing="grow">
      <Page.H>
        👋 <br />
        Hello <br /> <span className="text-success-500">@mentions</span>
      </Page.H>
      <Page.P>
        In Dust, you won't find just one AI agent, but multiple ones.
      </Page.P>
      <Page.P>
        You can call any agent at any time by typing “@” and the name of the
        agent.
      </Page.P>
    </Page.Vertical>
  </div>
);

/**
 * **SheetFooter** renders up to three actions: `leftButtonProps` (Cancel),
 * `rightButtonProps` (Save), and `rightEndButtonProps` for a third,
 * typically destructive, action.
 * @summary Footer with three action buttons.
 */
export const WithThreeFooterButtons: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" label="Edit entry" />
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit entry</SheetTitle>
          <SheetDescription>
            Update the entry or delete it permanently.
          </SheetDescription>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <Input label="Name" placeholder="Quarterly report" />
          </div>
        </SheetContainer>
        <SheetFooter
          sheetCloseClassName="flex gap-2"
          leftButtonProps={{ label: "Cancel", variant: "warning" }}
          rightButtonProps={{ label: "Save", variant: "primary" }}
          rightEndButtonProps={{
            label: "Delete",
            variant: "warning",
            icon: Trash01,
          }}
        />
      </SheetContent>
    </Sheet>
  ),
};

/**
 * **SheetTitle** accepts an `icon` rendered before the title text, useful to
 * reinforce what the sheet is about at a glance.
 * @summary Title with a leading icon.
 */
export const WithIconInTitle: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" label="Edit profile" />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader hideButton>
          <SheetTitle icon={Rocket02}>About me</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-6">
            <Input label="Firstname" placeholder="John" />
            <Input label="Lastname" placeholder="Doe" />
          </div>
        </SheetContainer>
        <SheetFooter
          sheetCloseClassName="flex gap-2"
          leftButtonProps={{ label: "Cancel", variant: "warning" }}
          rightButtonProps={{ label: "Save", disabled: true }}
        />
      </SheetContent>
    </Sheet>
  ),
};
