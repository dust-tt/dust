import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Avatar } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Avatar",
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvatarExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div>With nothing</div>
    <div className="s-flex s-gap-4">
      <Avatar size="xs" />
      <Avatar size="sm" />
      <Avatar size="md" />
      <Avatar size="lg" />
    </div>
    <div>With name</div>
    <div className="s-flex s-gap-4">
      <Avatar size="xs" name="Isabelle Doe" />
      <Avatar size="sm" name="Rafael Doe" />
      <Avatar size="md" name="Aria Doe" />
      <Avatar size="lg" name="Omar Doe" />
    </div>
    <div className="s-flex s-gap-4">
      <Avatar size="sm" name="Eleanor Wright" />
      <Avatar size="sm" name="Mason Johnson" />
      <Avatar size="sm" name="Oliver Bennett" />
      <Avatar size="sm" name="Sophia Garcia" />
      <Avatar size="sm" name="Lucas Adams" />
      <Avatar size="sm" name="Ava Torres" />
      <Avatar size="sm" name="Liam White" />
      <Avatar size="sm" name="Emma Jenkins" />
      <Avatar size="sm" name="Noah Martinez" />
      <Avatar size="sm" name="Isabella Thompson" />
      <Avatar size="sm" name="Ethan Roberts" />
      <Avatar size="sm" name="Charlotte Turner" />
      <Avatar size="sm" name="Benjamin Foster" />
      <Avatar size="sm" name="Mia Evans" />
      <Avatar size="sm" name="Alexander Perry" />
      <Avatar size="sm" name="Harper Sanchez" />
      <Avatar size="sm" name="William Murphy" />
      <Avatar size="sm" name="Lily Phillips" />
      <Avatar size="sm" name="James Coleman" />
      <Avatar size="sm" name="Aria Mitchell" />
    </div>
    <div>With image</div>
    <div className="s-flex s-gap-4">
      <Avatar
        size="xs"
        name="Isabelle Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143857310142316685/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_29eec588-b898-4e4a-9776-10c27790cbf9.png"
      />
      <Avatar
        size="sm"
        name="Rafael Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856587807662191/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_d3bf4062-218d-46fd-a77a-e4b9f90d7c68.png"
      />
      <Avatar
        size="md"
        name="Aria Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856180087767111/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_bc919872-ba19-451b-8dea-e8ae341c6387.png"
      />
      <Avatar
        size="lg"
        name="Omar Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1148265064185475192/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_348961d4-9039-426f-a1ca-0b350d2d83a9.png"
      />
    </div>
    <div>System Avatar</div>
  </div>
);

export const AvatarWithImage: Story = {
  args: {
    size: "md",
    visual: "http://edouardwautier.com/img/me.jpg",
  },
};
export const AvatarWithName: Story = {
  args: {
    name: "John Doe",
    size: "md",
  },
};
export const AvatarEmpty: Story = {
  args: {
    size: "md",
  },
};
