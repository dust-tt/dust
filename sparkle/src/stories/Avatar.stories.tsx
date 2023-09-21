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
      <Avatar size="xl" />
    </div>
    <div>With name</div>
    <div className="s-flex s-gap-4">
      <Avatar size="xs" name="Isabelle Doe" />
      <Avatar size="sm" name="Rafael Doe" />
      <Avatar size="md" name="Aria Doe" />
      <Avatar size="lg" name="Omar Doe" />
      <Avatar size="xl" name="Omar Doe" />
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
  </div>
);

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
  gap: "48px 16px",
};

export const AvatarGridExample = () => (
  <div style={gridStyle}>
    <Avatar size="auto" />
    <Avatar size="auto" />
    <Avatar size="auto" />
    <Avatar size="auto" />
    <Avatar size="auto" />
    <Avatar size="auto" name="Isabelle Doe" />
    <Avatar size="auto" name="Rafael Doe" />
    <Avatar size="auto" name="Aria Doe" />
    <Avatar size="auto" name="Omar Doe" />
    <Avatar size="auto" name="Omar Doe" />
    <Avatar size="auto" name="Eleanor Wright" />
    <Avatar size="auto" name="Mason Johnson" />
    <Avatar size="auto" name="Oliver Bennett" />
    <Avatar size="auto" name="Sophia Garcia" />
    <Avatar size="auto" name="Lucas Adams" />
    <Avatar size="auto" name="Ava Torres" />
    <Avatar size="auto" name="Liam White" />
    <Avatar size="auto" name="Emma Jenkins" />
    <Avatar size="auto" name="Noah Martinez" />
    <Avatar size="auto" name="Isabella Thompson" />
    <Avatar size="auto" name="Ethan Roberts" />
    <Avatar size="auto" name="Charlotte Turner" />
    <Avatar size="auto" name="Benjamin Foster" />
    <Avatar size="auto" name="Mia Evans" />
    <Avatar size="auto" name="Alexander Perry" />
    <Avatar size="auto" name="Harper Sanchez" />
    <Avatar size="auto" name="William Murphy" />
    <Avatar size="auto" name="Lily Phillips" />
    <Avatar size="auto" name="James Coleman" />
    <Avatar size="auto" name="Aria Mitchell" />
    <Avatar
      size="auto"
      name="Isabelle Doe"
      visual="https://cdn.discordapp.com/attachments/995248824375316560/1143857310142316685/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_29eec588-b898-4e4a-9776-10c27790cbf9.png"
    />
    <Avatar
      size="auto"
      name="Rafael Doe"
      visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856587807662191/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_d3bf4062-218d-46fd-a77a-e4b9f90d7c68.png"
    />
    <Avatar
      size="auto"
      name="Aria Doe"
      visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856180087767111/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_bc919872-ba19-451b-8dea-e8ae341c6387.png"
    />
    <Avatar
      size="auto"
      name="Omar Doe"
      visual="https://cdn.discordapp.com/attachments/995248824375316560/1148265064185475192/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_348961d4-9039-426f-a1ca-0b350d2d83a9.png"
    />
  </div>
);

export const AvatarBusyExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div>With nothing</div>
    <div className="s-flex s-gap-4">
      <Avatar busy size="xs" />
      <Avatar busy size="sm" />
      <Avatar busy size="md" />
      <Avatar busy size="lg" />
      <Avatar busy size="xl" />
    </div>
    <div>With name</div>
    <div className="s-flex s-gap-4">
      <Avatar busy size="xs" name="Isabelle Doe" />
      <Avatar busy size="sm" name="Rafael Doe" />
      <Avatar busy size="md" name="Aria Doe" />
      <Avatar busy size="lg" name="Omar Doe" />
      <Avatar busy size="xl" name="Eleanor Doe" />
    </div>
    <div className="s-flex s-gap-4">
      <Avatar busy size="sm" name="Eleanor Wright" />
      <Avatar busy size="sm" name="Mason Johnson" />
      <Avatar busy size="sm" name="Oliver Bennett" />
      <Avatar busy size="sm" name="Sophia Garcia" />
      <Avatar busy size="sm" name="Lucas Adams" />
      <Avatar busy size="sm" name="Ava Torres" />
      <Avatar busy size="sm" name="Liam White" />
      <Avatar busy size="sm" name="Emma Jenkins" />
      <Avatar busy size="sm" name="Noah Martinez" />
      <Avatar busy size="sm" name="Isabella Thompson" />
      <Avatar busy size="sm" name="Ethan Roberts" />
      <Avatar busy size="sm" name="Charlotte Turner" />
      <Avatar busy size="sm" name="Benjamin Foster" />
      <Avatar busy size="sm" name="Mia Evans" />
      <Avatar busy size="sm" name="Alexander Perry" />
      <Avatar busy size="sm" name="Harper Sanchez" />
      <Avatar busy size="sm" name="William Murphy" />
      <Avatar busy size="sm" name="Lily Phillips" />
      <Avatar busy size="sm" name="James Coleman" />
      <Avatar busy size="sm" name="Aria Mitchell" />
    </div>
    <div>With image</div>
    <div className="s-flex s-gap-4">
      <Avatar
        busy
        size="xs"
        name="Isabelle Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143857310142316685/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_29eec588-b898-4e4a-9776-10c27790cbf9.png"
      />
      <Avatar
        busy
        size="sm"
        name="Rafael Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856587807662191/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_d3bf4062-218d-46fd-a77a-e4b9f90d7c68.png"
      />
      <Avatar
        busy
        size="md"
        name="Aria Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856180087767111/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_bc919872-ba19-451b-8dea-e8ae341c6387.png"
      />
      <Avatar
        busy
        size="lg"
        name="Omar Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1148265064185475192/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_348961d4-9039-426f-a1ca-0b350d2d83a9.png"
      />
    </div>
  </div>
);

export const AvatarClickableExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <div>With nothing</div>
    <div className="s-flex s-gap-4">
      <Avatar size="xs" onClick={() => console.log("hello")} />
      <Avatar size="sm" onClick={() => console.log("hello")} />
      <Avatar size="md" onClick={() => console.log("hello")} />
      <Avatar size="lg" onClick={() => console.log("hello")} />
    </div>
    <div>With name</div>
    <div className="s-flex s-gap-4">
      <Avatar
        size="xs"
        name="Isabelle Doe"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Rafael Doe"
        onClick={() => console.log("hello")}
      />
      <Avatar size="md" name="Aria Doe" onClick={() => console.log("hello")} />
      <Avatar size="lg" name="Omar Doe" onClick={() => console.log("hello")} />
    </div>
    <div className="s-flex s-gap-4">
      <Avatar
        size="sm"
        name="Eleanor Wright"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Mason Johnson"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Oliver Bennett"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Sophia Garcia"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Lucas Adams"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Ava Torres"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Liam White"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Emma Jenkins"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Noah Martinez"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Isabella Thompson"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Ethan Roberts"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Charlotte Turner"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Benjamin Foster"
        onClick={() => console.log("hello")}
      />
      <Avatar size="sm" name="Mia Evans" onClick={() => console.log("hello")} />
      <Avatar
        size="sm"
        name="Alexander Perry"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Harper Sanchez"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="William Murphy"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Lily Phillips"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="James Coleman"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Aria Mitchell"
        onClick={() => console.log("hello")}
      />
    </div>
    <div>With image</div>
    <div className="s-flex s-gap-4">
      <Avatar
        size="xs"
        name="Isabelle Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143857310142316685/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_29eec588-b898-4e4a-9776-10c27790cbf9.png"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="sm"
        name="Rafael Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856587807662191/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_d3bf4062-218d-46fd-a77a-e4b9f90d7c68.png"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="md"
        name="Aria Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1143856180087767111/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_bc919872-ba19-451b-8dea-e8ae341c6387.png"
        onClick={() => console.log("hello")}
      />
      <Avatar
        size="lg"
        name="Omar Doe"
        visual="https://cdn.discordapp.com/attachments/995248824375316560/1148265064185475192/duncid_friendly_Scandinavian_droid_designed_by_Wes_Anderson_and_348961d4-9039-426f-a1ca-0b350d2d83a9.png"
        onClick={() => console.log("hello")}
      />
    </div>
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
