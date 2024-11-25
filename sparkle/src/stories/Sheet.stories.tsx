import type { Meta } from "@storybook/react";
import React from "react";

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
  CloudArrowLeftRightIcon,
  FolderIcon,
  GlobeAltIcon,
  MoreIcon,
  PencilSquareIcon,
  RocketIcon,
  StarIcon,
  TrashIcon,
} from "@sparkle/icons";

const meta = {
  title: "Layouts/Sheet",
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <SheetDemo />
      <ContentDemo />
      <SheetCustom />
    </div>
  );
}

export function SheetDemo() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Edit demo" />
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader hideButton>
            <SheetTitle>About me</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-gap-6">
              <Input label="Firstname" placeholder="John" />
              <Input label="Lastname" placeholder="Doe" />
            </div>
          </SheetContainer>
          <SheetFooter
            sheetCloseClassName="s-flex s-gap-2"
            leftButtonProps={{ label: "Cancel", variant: "warning" }}
            rightButtonProps={{ label: "Save", disabled: true }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ContentDemo() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Content demo" />
        </SheetTrigger>
        <SheetContent size="xl">
          <SheetHeader>
            <Page.Header
              icon={RocketIcon}
              title={<>Quick Guide for new members</>}
            />
          </SheetHeader>
          <SheetContainer>
            <QIG />
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetCustom() {
  const SimpleDropdownDemo = () => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            icon={MoreIcon}
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
          <DropdownMenuItem label="My Account" />
          <DropdownMenuItem label="Profile" />
          <DropdownMenuItem label="Billing" />
          <DropdownMenuItem label="Team" />
          <DropdownMenuItem label="Subscription" />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            aria-hidden="false"
            variant="outline"
            label="Assistant Demo"
          />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <div className="s-flex s-flex-col s-gap-2">
              <Avatar
                size="md"
                name="Aria Doe"
                visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
              />
              <div className="s-flex s-flex-col s-gap-0">
                <SheetTitle>@coucou</SheetTitle>
                <SheetDescription>
                  The assistant that allways says hello.
                </SheetDescription>
              </div>
              <div className="s-flex s-gap-2">
                <Button icon={StarIcon} variant={"outline"} />
                <Separator orientation="vertical" />
                <Button icon={PencilSquareIcon} variant={"outline"} />
                <Button icon={TrashIcon} variant={"outline"} />
                <SimpleDropdownDemo />
              </div>
            </div>
          </SheetHeader>
          <SheetContainer>Hello world</SheetContainer>
          <SheetFooter>
            <Button type="submit" label="Cancel" variant="outline" />
            <Button type="submit" label="Save" variant="highlight" />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetCustom() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Edit demo" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader hideButton>
            <SheetTitle>About me</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-gap-6">
              <Input label="Firstname" placeholder="John" />
              <Input label="Lastname" placeholder="Doe" />
            </div>
          </SheetContainer>
          <SheetFooter
            sheetCloseClassName="s-flex s-gap-2"
            leftButtonProps={{ label: "Cancel", variant: "warning" }}
            rightButtonProps={{ label: "Save", disabled: true }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ContentDemo() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Content demo" />
        </SheetTrigger>
        <SheetContent size="xl">
          <SheetHeader>
            <Page.Header
              icon={RocketIcon}
              title={<>Quick Guide for new members</>}
            />
          </SheetHeader>
          <SheetContainer>
            <QIG />
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetCustom() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Assistant Demo" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <div className="s-flex s-flex-col s-gap-2">
              <Avatar
                size="md"
                name="Aria Doe"
                visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
              />
              <div className="s-flex s-flex-col s-gap-0">
                <SheetTitle>@coucou</SheetTitle>
                <SheetDescription>
                  The assistant that allways says hello.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <SheetContainer>Hello world</SheetContainer>
          <SheetFooter>
            <Button type="submit" label="Cancel" variant="outline" />
            <Button type="submit" label="Save" variant="highlight" />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetCustom() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Edit demo" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader hideButton>
            <SheetTitle>About me</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-gap-6">
              <Input label="Firstname" placeholder="John" />
              <Input label="Lastname" placeholder="Doe" />
            </div>
          </SheetContainer>
          <SheetFooter
            sheetCloseClassName="s-flex s-gap-2"
            leftButtonProps={{ label: "Cancel", variant: "warning" }}
            rightButtonProps={{ label: "Save", disabled: true }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ContentDemo() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Content demo" />
        </SheetTrigger>
        <SheetContent size="xl">
          <SheetHeader>
            <Page.Header
              icon={RocketIcon}
              title={<>Quick Guide for new members</>}
            />
          </SheetHeader>
          <SheetContainer>
            <QIG />
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetCustom() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Assistant Demo" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <div className="s-flex s-flex-col s-gap-2">
              <Avatar
                size="md"
                name="Aria Doe"
                visual="https://dust.tt/static/droidavatar/Droid_Lime_3.jpg"
              />
              <div className="s-flex s-flex-col s-gap-0">
                <SheetTitle>@coucou</SheetTitle>
                <SheetDescription>
                  The assistant that allways says hello.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <SheetContainer>
            <h1>Summarized Ideas from Slack Thread</h1>

            <h2>Create a "@WhoCan" Assistant</h2>
            <p>
              Develop an assistant that is pre-installed in workspaces, with
              real-time knowledge of all accessible workspace assistants. This
              would help users discover existing assistants more easily.
            </p>
            <h2>Improve Assistant Discovery</h2>
            <p>
              Implement features like a "Find the right assistant" button and
              improve the experience when users hit "enter" without mentioning
              an assistant. This could lead to a guided conversation to help
              users find the appropriate assistant based on their needs.
            </p>
            <h2>Assistant Orchestration</h2>
            <p>
              Enable assistants to call other assistants as actions, which could
              enhance orchestration and functionality.
            </p>
            <h2>Onboarding Assistant</h2>
            <p>
              Introduce an onboarding assistant that engages with users the
              first time they log in, asks questions, and suggests useful
              assistants. Companies could customize this onboarding experience.
            </p>
            <h2>Prompt Versioning</h2>
            <p>
              Consider implementing prompt versioning to manage the frequent
              duplication of assistants.
            </p>
            <h2>Assistant Routing and Knowledge</h2>
            <p>
              Develop a personal assistant for users that could serve as a
              default assistant, capable of routing to the right assistant, and
              having general company and personal knowledge.
            </p>
            <h2>Customizable Onboarding</h2>
            <p>
              Allow companies to customize the onboarding assistant to include
              tasks like scheduling chats with colleagues and guiding through
              the onboarding process.
            </p>
            <h2>Dataset for Descriptions</h2>
            <p>
              Experiment with using a dataset that includes a summary of tools,
              configurations, and assistant popularity to improve search and
              discovery.
            </p>
            <h2>Risk of Infinite Loops</h2>
            <p>
              Address potential risks like infinite loops when implementing
              assistant-to-assistant calling.
            </p>
            <h2>Enhance Onboarding with Assistants</h2>
            <p>
              Draw inspiration from Notion's success in onboarding, potentially
              replacing traditional methods with assistant-guided processes.
            </p>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const QIG: React.FC = () => (
  <div className="s-flex s-flex-col s-gap-5">
    <Page.Horizontal>
      <Page.Vertical>
        <Page.H>
          👩‍🎨🦸‍♀️🥷🧑‍🚀
          <br /> Why multiple
          <br /> Assistants?
        </Page.H>

        <Page.P>
          The basic assistant is{" "}
          <span className="font-bold text-success-500">@gpt4</span>. It is a raw
          model. “Raw” means it does not have particular instructions or access
          to knowledge.
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
          Assistants start with an “instruction”. A simple text, explaining what
          you want them to do.
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
          </span>, <span className="italic">“How do we manage expenses”</span>,{" "}
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
        <br /> Data can come in different ways in Dust.{" "}
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
            platforms and synchronize your data.
          </Page.P>
        </Page.Vertical>
        <Page.Vertical sizing="grow">
          <Page.Horizontal>
            <div className="flex items-center gap-2">
              <Icon visual={FolderIcon} /> <Page.H variant="h6">Folders</Page.H>
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
        In Dust, you won't find just one AI assistant, but multiple ones.
      </Page.P>
      <Page.P>
        You can call any assistant at any time by typing “@” and the name of the
        assistant.
      </Page.P>
    </Page.Vertical>
    <Page.Horizontal>
      <Page.Vertical>
        <Page.H>
          👩‍🎨🦸‍♀️🥷🧑‍🚀
          <br /> Why multiple
          <br /> Assistants?
        </Page.H>

        <Page.P>
          The basic assistant is{" "}
          <span className="font-bold text-success-500">@gpt4</span>. It is a raw
          model. “Raw” means it does not have particular instructions or access
          to knowledge.
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
          Assistants start with an “instruction”. A simple text, explaining what
          you want them to do.
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
          </span>, <span className="italic">“How do we manage expenses”</span>,{" "}
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
        <br /> Data can come in different ways in Dust.{" "}
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
            platforms and synchronize your data.
          </Page.P>
        </Page.Vertical>
        <Page.Vertical sizing="grow">
          <Page.Horizontal>
            <div className="flex items-center gap-2">
              <Icon visual={FolderIcon} /> <Page.H variant="h6">Folders</Page.H>
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
            Any public website can be synced in Dust. Think FAQ, Wikipedia
            pages, documentation...
          </Page.P>
        </Page.Vertical>
      </Page.Horizontal>
    </Page.Vertical>
  </div>
);
