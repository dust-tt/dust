import type { Meta } from "@storybook/react";
import React from "react";

import { Icon, NewButton, PlusIcon, Spinner } from "../index_with_tw_base";

const meta = {
  title: "Primitives/NewButton",
  component: NewButton,
} satisfies Meta<typeof NewButton>;

export default meta;

export const ButtonExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    XS
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs">Button</NewButton>
      <NewButton size="xs" variant="highlight">
        Button
      </NewButton>
      <NewButton size="xs" variant="secondary">
        Button
      </NewButton>
      <NewButton size="xs" variant="warning">
        Button
      </NewButton>
      <NewButton size="xs" variant="outline">
        Button
      </NewButton>
      <NewButton size="xs" variant="ghost">
        Button
      </NewButton>
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton disabled size="xs">
        <Spinner size="xs" />
        Please wait
      </NewButton>
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="xs">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="xs" variant="highlight">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="xs" variant="secondary">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="xs" variant="warning">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="xs" variant="outline">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="xs" variant="ghost">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
    </div>
    SM
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm">Button</NewButton>
      <NewButton size="sm" variant="highlight">
        Button
      </NewButton>
      <NewButton size="sm">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="warning">
        Button
      </NewButton>
      <NewButton size="sm" variant="outline">
        Button
      </NewButton>
      <NewButton size="sm" variant="ghost">
        Button
      </NewButton>
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="sm">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="highlight">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="secondary">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="warning">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="outline">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="sm" variant="ghost">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
    </div>
    MD
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md">Button</NewButton>
      <NewButton size="md" variant="highlight">
        Button
      </NewButton>
      <NewButton size="md">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="warning">
        Button
      </NewButton>
      <NewButton size="md" variant="outline">
        Button
      </NewButton>
      <NewButton size="md" variant="ghost">
        Button
      </NewButton>
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <NewButton size="md">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="highlight">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="secondary">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="warning">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="outline">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
      <NewButton size="md" variant="ghost">
        <Icon visual={PlusIcon} />
        Button
      </NewButton>
    </div>
  </div>
);
