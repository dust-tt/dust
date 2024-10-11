import type { Meta } from "@storybook/react";
import React from "react";

import {
  Checkbox,
  CheckboxWithText,
  CheckBoxWithTextAndDescription,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;

const handleChange = () => {
  // This function intentionally left blank
};

export const CheckBoxSizesExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <div className="s-flex s-gap-10">
        SM
        <Checkbox onChange={handleChange} />
        <Checkbox disabled onChange={handleChange} />
        <Checkbox checked onChange={handleChange} />
        <Checkbox checked disabled onChange={handleChange} />
        <Checkbox checked="partial" onChange={handleChange} />
        <Checkbox checked="partial" disabled onChange={handleChange} />
      </div>
      <div className="s-flex s-gap-10">
        XS
        <Checkbox size="xs" onChange={handleChange} />
        <Checkbox size="xs" disabled onChange={handleChange} />
        <Checkbox size="xs" checked onChange={handleChange} />
        <Checkbox size="xs" checked disabled onChange={handleChange} />
        <Checkbox size="xs" checked="partial" onChange={handleChange} />
        <Checkbox
          size="xs"
          checked="partial"
          disabled
          onChange={handleChange}
        />
      </div>
    </div>
  );
};

export const CheckBoxWithTextExample = () => {
  return (
    <div className="s-flex s-gap-10">
      <CheckboxWithText text="Google Drive" />
    </div>
  );
};

export const CheckBoxWithTextAndDescriptionExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-3">
      <CheckBoxWithTextAndDescription
        text="Google Drive"
        description="This is a nice Google Drive description."
      />
      <CheckBoxWithTextAndDescription
        text="Microsoft"
        description="This is a nice Microsoft description."
      />
    </div>
  );
};
