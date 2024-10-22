import type { Meta } from "@storybook/react";
import React from "react";

import { Label, NewButton, NewTextarea } from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Textarea",
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <TexareBasic />
      <TextareaDisabled />
      <TextareaWithLabel />
      <TextareaWithText />
      <TextareaWithButton />
    </div>
  );
}

export const TexareBasic = () => (
  <NewTextarea placeholder="Type your message here." resize="none" />
);

export function TextareaDisabled() {
  return <NewTextarea placeholder="Type your message here." disabled />;
}

export function TextareaWithLabel() {
  return (
    <div className="s-grid s-w-full s-gap-2">
      <Label htmlFor="message">Your message</Label>
      <NewTextarea placeholder="Type your message here." id="message" />
    </div>
  );
}

export function TextareaWithText() {
  return (
    <div className="s-grid s-w-full s-gap-2">
      <Label htmlFor="message-2">Your Message</Label>
      <NewTextarea placeholder="Type your message here." id="message-2" />
      <p className="s-text-sm s-text-muted-foreground">
        Your message will be copied to the support team.
      </p>
    </div>
  );
}

export function TextareaWithButton() {
  return (
    <div className="s-grid s-w-full s-gap-2">
      <NewTextarea placeholder="Type your message here." />
      <NewButton label="Send message" />
    </div>
  );
}
