import type { Meta } from "@storybook/react";
import React from "react";

import { PlusIcon } from "@sparkle/icons";
import { NewButton } from "@sparkle/index_with_tw_base";

const meta = {
  title: "NewPrimitives/Button",
} satisfies Meta;

export default meta;

export const ButtonExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    IconButton
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs" icon={PlusIcon} isPulsing />
      <NewButton size="xs" variant="outline" icon={PlusIcon} />
      <NewButton size="xs" variant="highlight" icon={PlusIcon} />
      <NewButton size="xs" variant="warning" icon={PlusIcon} />
      <NewButton size="xs" variant="ghost" icon={PlusIcon} />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm" icon={PlusIcon} />
      <NewButton size="sm" variant="outline" icon={PlusIcon} />
      <NewButton size="sm" variant="highlight" icon={PlusIcon} />
      <NewButton size="sm" variant="warning" icon={PlusIcon} />
      <NewButton size="sm" variant="ghost" icon={PlusIcon} />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md" icon={PlusIcon} />
      <NewButton size="md" variant="outline" icon={PlusIcon} />
      <NewButton size="md" variant="highlight" icon={PlusIcon} />
      <NewButton size="md" variant="warning" icon={PlusIcon} />
      <NewButton size="md" variant="ghost" icon={PlusIcon} />
    </div>
    XS
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs" label="Button" />
      <NewButton size="xs" variant="outline" label="Button" />
      <NewButton size="xs" variant="highlight" label="Button" />
      <NewButton size="xs" variant="warning" label="Button" />
      <NewButton size="xs" variant="ghost" label="Button" />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs" label="Button" isLoading />
      <NewButton size="xs" variant="outline" label="Button" disabled />
      <NewButton size="xs" variant="highlight" label="Button" disabled />
      <NewButton size="xs" variant="warning" label="Button" disabled />
      <NewButton size="xs" variant="ghost" label="Button" disabled />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs" label="Button" isLoading />
      <NewButton size="xs" variant="outline" label="Button" isLoading />
      <NewButton size="xs" variant="highlight" label="Button" isLoading />
      <NewButton size="xs" variant="warning" label="Button" isLoading />
      <NewButton size="xs" variant="ghost" label="Button" isLoading />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs" icon={PlusIcon} label="Button" />
      <NewButton size="xs" variant="outline" icon={PlusIcon} label="Button" />
      <NewButton size="xs" variant="highlight" icon={PlusIcon} label="Button" />
      <NewButton size="xs" variant="warning" icon={PlusIcon} label="Button" />
      <NewButton size="xs" variant="ghost" icon={PlusIcon} label="Button" />
    </div>
    SM
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm" label="Button" />
      <NewButton size="sm" variant="outline" label="Button" />
      <NewButton size="sm" variant="highlight" label="Button" />
      <NewButton size="sm" variant="warning" label="Button" />
      <NewButton size="sm" variant="ghost" label="Button" />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm" label="Button" isLoading />
      <NewButton size="sm" variant="outline" label="Button" isLoading />
      <NewButton size="sm" variant="highlight" label="Button" isLoading />
      <NewButton size="sm" variant="warning" label="Button" isLoading />
      <NewButton size="sm" variant="ghost" label="Button" isLoading />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm" icon={PlusIcon} label="Button" />
      <NewButton size="sm" variant="outline" icon={PlusIcon} label="Button" />
      <NewButton size="sm" variant="highlight" icon={PlusIcon} label="Button" />
      <NewButton size="sm" variant="warning" icon={PlusIcon} label="Button" />
      <NewButton size="sm" variant="ghost" icon={PlusIcon} label="Button" />
    </div>
    MD
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md" label="Button" />
      <NewButton size="md" variant="outline" label="Button" />
      <NewButton size="md" variant="highlight" label="Button" />
      <NewButton size="md" variant="warning" label="Button" />
      <NewButton size="md" variant="ghost" label="Button" />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md" label="Button" isLoading />
      <NewButton size="md" variant="outline" label="Button" isLoading />
      <NewButton size="md" variant="highlight" label="Button" isLoading />
      <NewButton size="md" variant="warning" label="Button" isLoading />
      <NewButton size="md" variant="ghost" label="Button" isLoading />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md" icon={PlusIcon} label="Button" />
      <NewButton size="md" variant="outline" icon={PlusIcon} label="Button" />
      <NewButton size="md" variant="highlight" icon={PlusIcon} label="Button" />
      <NewButton size="md" variant="warning" icon={PlusIcon} label="Button" />
      <NewButton size="md" variant="ghost" icon={PlusIcon} label="Button" />
    </div>
  </div>
);
