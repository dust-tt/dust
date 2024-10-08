import type { Meta } from "@storybook/react";
import React from "react";

import { NewCheckbox } from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/NewCheckbox",
} satisfies Meta;

export default meta;

export const CheckBoxExample = () => {
  // const handleChange = () => {
  //   // This function intentionally left blank
  // };

  return (
    <div className="s-flex s-flex-col s-gap-10">
      <div className="s-flex s-gap-4">
        <NewCheckbox id="terms1" />
        <NewCheckbox id="terms1" isPartial checked />
        <NewCheckbox id="terms1" checked />
      </div>
      <div className="s-flex s-gap-4">
        <NewCheckbox id="terms1" size="xs" />
        <NewCheckbox id="terms1" size="xs" isPartial checked />
        <NewCheckbox id="terms1" size="xs" checked />
      </div>
      <div className="s-items-top s-flex s-space-x-2">
        <NewCheckbox id="terms1" size="xs" />
        <div className="s-grid s-gap-1 s-leading-none">
          <label
            htmlFor="terms1"
            className="s-text-sm s-font-medium s-leading-none peer-disabled:s-cursor-not-allowed peer-disabled:s-opacity-70"
          >
            Accept terms and conditions
          </label>
          <p className="s-text-sm s-text-muted-foreground">
            You agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>

      {/* 
      SM
      <div className="s-flex s-gap-10">
        Selectable
        <NewCheckbox variant="selectable" onChange={handleChange} />
        <NewCheckbox
          checked="checked"
          variant="selectable"
          onChange={handleChange}
        />
        <NewCheckbox
          checked="partial"
          variant="selectable"
          onChange={handleChange}
        />
        Checkable
        <NewCheckbox variant="checkable" onChange={handleChange} />
        <NewCheckbox
          checked="checked"
          variant="checkable"
          onChange={handleChange}
        />
        <NewCheckbox
          checked="partial"
          variant="checkable"
          onChange={handleChange}
        />
      </div>
      XS
      <div className="s-flex s-gap-10">
        Selectable
        <NewCheckbox size="xs" variant="selectable" onChange={handleChange} />
        <NewCheckbox
          size="xs"
          checked="checked"
          variant="selectable"
          onChange={handleChange}
        />
        <NewCheckbox
          size="xs"
          checked="partial"
          variant="selectable"
          onChange={handleChange}
        />
        Checkable
        <NewCheckbox size="xs" variant="checkable" onChange={handleChange} />
        <NewCheckbox
          size="xs"
          checked="checked"
          variant="checkable"
          onChange={handleChange}
        />
        <NewCheckbox
          size="xs"
          checked="partial"
          variant="checkable"
          onChange={handleChange}
        />
      </div> */}
    </div>
  );
};
