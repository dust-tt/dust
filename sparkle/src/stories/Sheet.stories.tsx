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
} from "@sparkle/icons/app";

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
  const [saveCount, setSaveCount] = React.useState(0);

  return (
    <div className="s-flex s-items-center s-gap-3">
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
              <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                Tip: Press Cmd/Ctrl + Enter to Save
              </div>
            </div>
          </SheetContainer>
          <SheetFooter
            sheetCloseClassName="s-flex s-gap-2"
            leftButtonProps={{ label: "Cancel", variant: "warning" }}
            rightButtonProps={{
              label: "Save",
              variant: "primary",
              onClick: () => setSaveCount((c) => c + 1),
            }}
          />
        </SheetContent>
      </Sheet>
      <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
        Saved: {saveCount}
      </span>
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
          <Button aria-hidden="false" variant="outline" label="Agent Demo" />
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
                  The agent that allways says hello.
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
          <SheetContainer>
            <TextArea />
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
          Agents can be provided by Dust, by your company (Company agent), by s
          your coworkers (Shared agents).
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
        To augment your agents with knowledge, you give them data.
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
        In Dust, you won't find just one AI agent, but multiple ones.
      </Page.P>
      <Page.P>
        You can call any agent at any time by typing “@” and the name of the
        agent.
      </Page.P>
    </Page.Vertical>
    <Page.Horizontal>
      <Page.Vertical>
        <Page.H>
          👩‍🎨🦸‍♀️🥷🧑‍🚀
          <br /> Why multiple
          <br /> agents?
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
          Agents can be provided by Dust, by your company (Company agents), by
          your coworkers (Shared agent).
        </Page.P>
      </Page.Vertical>

      <Page.Vertical>
        <Page.H>
          🛠️
          <br />
          How to make
          <br />
          an agent?
        </Page.H>
        <Page.P>You can build agents!</Page.P>
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
          With the right Data source, agents can answer demands like
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
        To augment your agents with knowledge, you give them data.
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

export function SheetWithThreeButtons() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Three Button Demo" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet with Three Buttons</SheetTitle>
            <SheetDescription>
              Example of SheetFooter with three buttons
            </SheetDescription>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-gap-6">
              <Input label="Example Input" placeholder="Type something..." />
            </div>
          </SheetContainer>
          <SheetFooter
            sheetCloseClassName="s-flex s-gap-2"
            leftButtonProps={{ label: "Cancel", variant: "warning" }}
            rightButtonProps={{ label: "Save", variant: "primary" }}
            rightEndButtonProps={{
              label: "Delete",
              variant: "warning",
              icon: TrashIcon,
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SheetWithIconInTitle() {
  return (
    <div>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" label="Edit demo" />
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader hideButton>
            <SheetTitle icon={RocketIcon}>About me</SheetTitle>
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
