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
              <div className="s-flex s-gap-2">
                <Button icon={StarIcon} variant={"outline"} />
                <Separator orientation="vertical" />
                <Button icon={PencilSquareIcon} variant={"outline"} />
                <Button icon={TrashIcon} variant={"outline"} />
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
            <TextArea />
          </SheetContainer>
          <SheetFooter>
            <Button type="submit" label="Cancel" variant="outline" />
            <Button type="submit" label="Save" variant="highlight" />
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
