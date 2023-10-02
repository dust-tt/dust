import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Searchbar } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Searchbar",
  component: Searchbar,
} satisfies Meta<typeof Searchbar>;

export default meta;

export const SearchbarExample = () => {
  const [inputValue, setInputValue] = useState("value");

  const handleChange = (value: string) => {
    setInputValue(value);
  };

  return (
    <div className="s-grid s-grid-cols-3 s-gap-4">
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={null}
        onChange={handleChange}
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={inputValue}
        onChange={handleChange}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={inputValue}
        onChange={handleChange}
        error={"errored"}
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={inputValue}
        onChange={handleChange}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={"disabled"}
        showErrorLabel
      />
    </div>
  );
};
