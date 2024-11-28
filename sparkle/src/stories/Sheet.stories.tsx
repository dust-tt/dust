import type { Meta } from "@storybook/react";
import React from "react";

import {
  Avatar,
  Button,
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
  PencilSquareIcon,
  RocketIcon,
  StarIcon,
  TrashIcon,
} from "@sparkle/icons";

const meta = {
  title: "NewLayouts/Sheet",
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
              <div className="s-flex s-gap-2">
                <Button icon={StarIcon} variant={"outline"} />
                <Separator orientation="vertical" />
                <Button icon={PencilSquareIcon} variant={"outline"} />
                <Button icon={TrashIcon} variant={"outline"} />
              </div>
            </div>
          </SheetHeader>
          <SheetContainer>
            <TextArea disabled isDisplay />
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