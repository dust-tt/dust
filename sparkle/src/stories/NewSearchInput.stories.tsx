import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { NewSearchInput } from "../index_with_tw_base";

const meta = {
  title: "NewComponents/NewSearchInput",
} satisfies Meta;

export default meta;

export const SearchbarExample = () => {
  const [inputValue, setInputValue] = useState("");
  const [inputValue3, setInputValue3] = useState("value");

  const handleChange = (value: string) => {
    setInputValue(value);
  };
  const handleChange3 = (value: string) => {
    setInputValue3(value);
  };

  return (
    <div className="s-flex s-flex-col s-gap-12">
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <div className="s-flex s-gap-2">
          <NewSearchInput
            name="input"
            value={inputValue}
            onChange={handleChange}
          />
        </div>
        <NewSearchInput
          name="input"
          value={inputValue3}
          onChange={handleChange3}
        />
        <NewSearchInput name="input" value={"disabled"} disabled />
      </div>
    </div>
  );
};
