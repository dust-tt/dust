import type { Meta } from "@storybook/react";
import React from "react";

import {
  AssistantPreview2,
  Button,
  Chip,
  PlayIcon,
} from "../index_with_tw_base";

const meta: Meta<typeof AssistantPreview2> = {
  title: "Molecule/AssistantPreview2",
  component: AssistantPreview2,
};

export default meta;

export const AssistantPreviewExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>Item</h2>
    <div className="s-grid s-grid-cols-5">
      <AssistantPreview2
        title={"gpt4ljmlkmlkùmkùmlùlkjlmkjmjm"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        actions={
          <>
            <Button
              icon={PlayIcon}
              label="Start"
              variant="tertiary"
              size="xs"
            />
          </>
        }
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"Stanislas Polu, Pauline Pham"}
        variant={"item"}
      />
      <AssistantPreview2
        title={"hiringExpert"}
        description={
          "Draft me a job description following company script for this job."
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"item"}
        onClick={() => console.log("clicked")}
        actions={
          <>
            <Button
              icon={PlayIcon}
              label="Start"
              variant="tertiary"
              size="xs"
            />
          </>
        }
      />
      <AssistantPreview2
        title={"legalcapone"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        actions={
          <>
            <Button
              icon={PlayIcon}
              label="Start"
              variant="tertiary"
              size="xs"
            />
          </>
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Green_2.jpg"}
        subtitle={"Stanislas Polu, Pauline Pham, Henry Fontanier"}
        variant={"item"}
      />
      <AssistantPreview2
        title={"SQLGod"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        actions={
          <>
            <Button
              icon={PlayIcon}
              label="Start"
              variant="tertiary"
              size="xs"
            />
          </>
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Pink_2.jpg"}
        subtitle={"Pauline Pham, Henry Fontanier"}
        variant={"item"}
      />
      <AssistantPreview2
        title={"hiringExpert"}
        description={
          "Draft me a job description following company script for this job."
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"item"}
        onClick={() => console.log("clicked")}
        actions={
          <>
            <Button
              icon={PlayIcon}
              label="Start"
              variant="tertiary"
              size="xs"
            />
          </>
        }
      />
    </div>
    <h2>List</h2>
    <div className="s-grid s-grid-cols-2">
      <AssistantPreview2
        title={"gpt4"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={
          "Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
        }
        variant={"list"}
      />
      <AssistantPreview2
        title={"salesFr"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"list"}
        onClick={() => console.log("clicked")}
      />
    </div>
    <h2>Gallery</h2>
    <div className="s-grid s-grid-cols-2">
      <AssistantPreview2
        title={"gpt4"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        actions={
          <div className="s-flex s-gap-2">
            <Chip label="Shared Assistant" color="pink" />
          </div>
        }
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"Stanislas Polu, Pauline Pham"}
        variant={"gallery"}
      />
      <AssistantPreview2
        title={"salesFr"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={
          "Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
        }
        variant={"gallery"}
        onClick={() => console.log("clicked")}
        actions={
          <div className="s-flex s-gap-2">
            <Chip label="Company Assistant" color="amber" />
          </div>
        }
      />
    </div>
  </div>
);
