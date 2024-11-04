import type { Meta } from "@storybook/react";
import React from "react";

import { Button, PlusIcon, RobotIcon, Separator } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;

const IconButtonExamples = () => (
  <>
    <h3>Icon buttons</h3>
    <div className="s-flex s-items-center s-gap-4 s-bg-muted">
      <Button size="xs" icon={PlusIcon} label="hello" isPulsing />
      <Button size="xs" variant="outline" label="hello" icon={PlusIcon} />
      <Button size="xs" variant="highlight" label="hello" icon={PlusIcon} />
      <Button size="xs" variant="warning" label="hello" icon={PlusIcon} />
      <Button size="xs" variant="ghost" label="hello" icon={PlusIcon} />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size="sm" icon={PlusIcon} isPulsing />
      <Button size="sm" variant="outline" icon={PlusIcon} />
      <Button size="sm" variant="highlight" icon={PlusIcon} />
      <Button size="sm" variant="warning" icon={PlusIcon} />
      <Button size="sm" variant="ghost" icon={PlusIcon} />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size="md" icon={PlusIcon} isPulsing />
      <Button size="md" variant="outline" icon={PlusIcon} />
      <Button size="md" variant="highlight" icon={PlusIcon} />
      <Button size="md" variant="warning" icon={PlusIcon} />
      <Button size="md" variant="ghost" icon={PlusIcon} />
    </div>
  </>
);

const ButtonExamplesBySize = ({
  size,
}: {
  size: React.ComponentProps<typeof Button>["size"];
}) => (
  <>
    <Separator />
    <h3>{size?.toUpperCase()}</h3>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} label="Button" />
      <Button size={size} variant="outline" label="Button" />
      <Button size={size} variant="highlight" label="Button" />
      <Button size={size} variant="warning" label="Button" />
      <Button size={size} variant="ghost" label="Button" />
      <Button
        size={size}
        variant="primary"
        label="Button with href"
        href="hello"
      />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} label="Button" isLoading />
      <Button size={size} variant="outline" label="Button" isLoading />
      <Button size={size} variant="highlight" label="Button" isLoading />
      <Button size={size} variant="warning" label="Button" isLoading />
      <Button size={size} variant="ghost" label="Button" isLoading />
    </div>
    <div className="s-flex s-items-center s-gap-4">
      <Button size={size} icon={PlusIcon} label="Button" />
      <Button size={size} variant="outline" icon={PlusIcon} label="Button" />
      <Button size={size} variant="highlight" icon={PlusIcon} label="Button" />
      <Button size={size} variant="warning" icon={PlusIcon} label="Button" />
      <Button size={size} variant="ghost" icon={PlusIcon} label="Button" />
    </div>
  </>
);

export const ButtonExamples = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <IconButtonExamples />
    <ButtonExamplesBySize size="xs" />
    <ButtonExamplesBySize size="sm" />
    <ButtonExamplesBySize size="md" />
  </div>
);

export const DropdownButtonExample = () => (
  <div>
    <Button icon={RobotIcon} variant="outline" isSelect />
  </div>
);

export const DisabledButtonExample = () => (
  <div>
    <Button icon={RobotIcon} variant="outline" isSelect disabled={true} />
  </div>
);
