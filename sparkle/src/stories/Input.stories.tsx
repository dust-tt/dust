import type { Meta } from "@storybook/react";
import React from "react";

import { Input } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;

export const InputExample = () => (
  <div className="s-flex s-flex-col s-gap-20">
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <Input placeholder="placeholder" name="input" />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored"}
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"disabled"}
        disabled={true}
        showErrorLabel
      />
    </div>
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <Input placeholder="placeholder" name="input" />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored"}
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"value"}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Input
        placeholder="placeholder"
        name="input"
        value={"disabled"}
        showErrorLabel
      />
    </div>
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <Input
        placeholder="placeholder"
        name="input"
        label="Firstname"
        showErrorLabel
      />
      <Input
        placeholder="placeholder"
        name="input"
        label="Lastname"
        showErrorLabel
      />
    </div>
  </div>
);
