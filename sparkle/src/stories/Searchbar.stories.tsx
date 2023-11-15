import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Searchbar } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Searchbar",
  component: Searchbar,
} satisfies Meta<typeof Searchbar>;

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
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={inputValue}
          onChange={handleChange}
        />
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={inputValue3}
          onChange={handleChange3}
        />
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={"disabled"}
          disabled
        />
      </div>
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={inputValue}
          onChange={handleChange}
          size="xs"
        />
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={inputValue3}
          onChange={handleChange3}
          size="xs"
        />
        <Searchbar
          placeholder="placeholder"
          name="input"
          value={"disabled"}
          size="xs"
          disabled
        />
      </div>
    </div>
  );
};
