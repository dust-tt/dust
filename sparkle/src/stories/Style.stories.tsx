import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import { Button, Dialog, Input, Page } from "../index_with_tw_base";

const meta = {
  title: "Style/Shadows",
  component: Dialog,
} satisfies Meta<typeof Dialog>;

export default meta;

export const DialogExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-12">
      box shadow
      <div className="s-flex s-gap-6">
        <div className="s-rounded-xl s-p-6 s-shadow-sm">shadow-sm</div>
        <div className="s-rounded-xl s-p-6 s-shadow">shadow</div>
        <div className="s-rounded-xl s-p-6 s-shadow-md">shadow-md</div>
        <div className="s-rounded-xl s-p-6 s-shadow-lg">shadow-lg</div>
        <div className="s-rounded-xl s-p-6 s-shadow-xl">shadow-xl</div>
        <div className="s-rounded-xl s-p-6 s-shadow-2xl">shadow-2xl</div>
      </div>
      drop shadow
      <div className="s-flex s-gap-6">
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow-sm">
          drop-shadow-sm
        </div>
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow">
          drop-shadow
        </div>
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow-md">
          drop-shadow-md
        </div>
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow-lg">
          drop-shadow-lg
        </div>
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow-xl">
          drop-shadow-xl
        </div>
        <div className="s-rounded-xl s-bg-white s-p-6 s-drop-shadow-2xl">
          drop-shadow-2xl
        </div>
      </div>
    </div>
  );
};
