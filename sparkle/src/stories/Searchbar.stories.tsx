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
  const [inputValue2, setInputValue2] = useState("value");
  const [inputValue3, setInputValue3] = useState("value");
  const [inputValue4, setInputValue4] = useState("value");

  const handleChange = (value: string) => {
    setInputValue(value);
  };
  const handleChange2 = (value: string) => {
    setInputValue2(value);
  };
  const handleChange3 = (value: string) => {
    setInputValue3(value);
  };
  const handleChange4 = (value: string) => {
    setInputValue4(value);
  };

  return (
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
        value={inputValue2}
        onChange={handleChange2}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={inputValue3}
        onChange={handleChange3}
        error={"errored"}
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={inputValue4}
        onChange={handleChange4}
        error={"errored because it's a very long message"}
        showErrorLabel
      />
      <Searchbar
        placeholder="placeholder"
        name="input"
        value={"disabled"}
        showErrorLabel
        disabled
      />
    </div>
  );
};
