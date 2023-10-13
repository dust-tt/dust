import { Meta } from "@storybook/react";
import React from "react";

import { RadioButton } from "@sparkle/components/RadioButton";

const meta = {
  title: "Atoms/RadioButton",
  component: RadioButton,
} satisfies Meta<typeof RadioButton>;

export default meta;

export const RadioButtonExamples = () => {
  const [value1, setValue1] = React.useState<string>("yes");
  const [value2, setValue2] = React.useState<string>("");

  return (
    <div>
      <RadioButton
        name="test1"
        choices={[
          {
            label: "yes",
            value: "yes",
            disabled: false,
          },
          {
            label: "no",
            value: "no",
            disabled: false,
          },
          {
            label: "maybe",
            value: "maybe",
            disabled: true,
          },
        ]}
        value={value1}
        onChange={(v) => {
          setValue1(v);
        }}
      />
      <br />
      <br />
      <br />
      <RadioButton
        name="test2"
        className="s-flex-col"
        choices={[
          {
            label: "more",
            value: "more",
            disabled: false,
          },
          {
            label: "less",
            value: "no",
            disabled: false,
          },
        ]}
        value={value2}
        onChange={(v) => {
          setValue2(v);
        }}
      />
    </div>
  );
};
