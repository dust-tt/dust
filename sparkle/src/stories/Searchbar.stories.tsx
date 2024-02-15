import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Searchbar } from "../index_with_tw_base";

const meta = {
  title: "Components/Searchbar",
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
        <div className="s-flex s-gap-2">
          <Searchbar
            placeholder="Placeholder"
            name="input"
            value={inputValue}
            onChange={handleChange}
            size="md"
          />
          <div>
            <Button variant="tertiary" size="md" label="Hello" />
          </div>
        </div>
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={inputValue3}
          onChange={handleChange3}
          size="md"
        />
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={"disabled"}
          size="md"
          disabled
        />
      </div>
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <div className="s-flex s-gap-2">
          <Searchbar
            placeholder="Placeholder"
            name="input"
            value={inputValue}
            onChange={handleChange}
          />
          <div>
            <Button variant="tertiary" size="sm" label="Hello" />
          </div>
        </div>
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={inputValue3}
          onChange={handleChange3}
        />
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={"disabled"}
          disabled
        />
      </div>
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <div className="s-flex s-gap-2">
          <Searchbar
            placeholder="Placeholder"
            name="input"
            value={inputValue}
            onChange={handleChange}
            size="xs"
          />
          <div>
            <Button variant="tertiary" size="xs" label="Hello" />
          </div>
        </div>
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={inputValue3}
          onChange={handleChange3}
          size="xs"
        />
        <Searchbar
          placeholder="Placeholder"
          name="input"
          value={"disabled"}
          size="xs"
          disabled
        />
      </div>
    </div>
  );
};
