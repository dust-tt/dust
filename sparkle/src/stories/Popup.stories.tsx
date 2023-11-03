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
      description={"Basic popup"}
      buttonLabel={"Ok"}
      buttonClick={function (): void {
        alert("Onclick fn");
      }}
    />

    <Popup
      show={true}
      chipLabel={"Closeable"}
      description={"Using onClose prop"}
      buttonLabel={"Ok"}
      buttonClick={function (): void {
        alert("Onclick fn");
      }}
      onClose={function (): void {
        alert("OnClose fn");
      }}
    />

    <Popup
      show={true}
      chipLabel={"Positioned"}
      description={"Positioned right via className"}
      buttonLabel={"Ok"}
      buttonClick={function (): void {
        alert("Onclick fn");
      }}
      className="s-fixed s-right-16"
    />
  </div>
);
