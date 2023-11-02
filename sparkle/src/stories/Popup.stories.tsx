import type { Meta } from "@storybook/react";
import React from "react";

import { Popup } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Popup",
  component: Popup,
} satisfies Meta<typeof Popup>;

export default meta;

export const PopupExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <Popup
      show={true}
      chipLabel={"Basic"}
      description={"Yes"}
      buttonLabel={"Ok"}
      buttonClick={function (): void {
        alert("Onclick fn");
      }}
    />

    <Popup
      show={true}
      chipLabel={"Positioned"}
      description={"Positioned bottom via className"}
      buttonLabel={"Ok"}
      buttonClick={function (): void {
        alert("Onclick fn");
      }}
      className="s-fixed s-bottom-16"
    />
  </div>
);
