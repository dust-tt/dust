import type { Meta } from "@storybook/react";
import React from "react";

import { Searchbar } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Searchbar",
  component: Searchbar,
} satisfies Meta<typeof Searchbar>;

export default meta;

export const SearchbarExample = () => (
  <div className="s-grid s-grid-cols-3 s-gap-4">
    <Searchbar placeholder="placeholder" name="input" value={null} />
    <Searchbar
      placeholder="placeholder"
      name="input"
      value={"value"}
      error={"errored because it's a very long message"}
      showErrorLabel
    />
    <Searchbar
      placeholder="placeholder"
      name="input"
      value={"value"}
      error={"errored"}
    />
    <Searchbar
      placeholder="placeholder"
      name="input"
      value={"value"}
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
