import type { Meta } from "@storybook/react";
import React from "react";

import {
  AssistantPreview,
  Button,
  ChatBubbleBottomCenterTextIcon,
  Chip,
  ListAddIcon,
} from "../index_with_tw_base";

const meta: Meta<typeof AssistantPreview> = {
  title: "Modules/AssistantPreview",
  component: AssistantPreview,
};

export default meta;

export const AssistantPreviewExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>Item</h2>
    <div className="s-grid s-grid-cols-5">
      <AssistantPreview
        title={"gpt4 with a very long suffix"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"Stanislas Polu, Pauline Pham"}
        variant={"item"}
        actions={
          <div className="s-flex s-justify-end s-pt-1">
            <Button
              icon={ChatBubbleBottomCenterTextIcon}
              label="Chat"
              variant="tertiary"
              size="xs"
            />
          </div>
        }
      />
      <AssistantPreview
        title={"hiringExpert"}
        description={
          "Draft me a job description following company script for this job."
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"item"}
        onClick={() => console.log("clicked")}
        actions={
          <div className="s-flex s-justify-end s-pt-1">
            <Button
              icon={ChatBubbleBottomCenterTextIcon}
              label="Chat"
              variant="tertiary"
              size="xs"
            />
          </div>
        }
      />
      <AssistantPreview
        title={"legalcapone"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Green_2.jpg"}
        subtitle={"Stanislas Polu, Pauline Pham, Henry Fontanier"}
        variant={"item"}
        actions={
          <div className="s-flex s-justify-end s-pt-1">
            <Button
              icon={ChatBubbleBottomCenterTextIcon}
              label="Chat"
              variant="tertiary"
              size="xs"
            />
          </div>
        }
      />
      <AssistantPreview
        title={"SQLGod"}
        description={
          "OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here"
        }
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Pink_2.jpg"}
        subtitle={"Pauline Pham, Henry Fontanier"}
        variant={"item"}
        actions={
          <div className="s-flex s-justify-end s-pt-1">
            <Button
              icon={ChatBubbleBottomCenterTextIcon}
              label="Chat"
              variant="tertiary"
              size="xs"
            />
          </div>
        }
      />
      <AssistantPreview
        title={"hiringExpert"}
        description={"Draft me a job description."}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"item"}
        onClick={() => console.log("clicked")}
        actions={
          <div className="s-flex s-justify-end s-pt-1">
            <Button
              icon={ChatBubbleBottomCenterTextIcon}
              label="Chat"
              variant="tertiary"
              size="xs"
            />
          </div>
        }
      />
    </div>
    <h2>List</h2>
    <div className="s-grid s-grid-cols-2">
      <AssistantPreview
        title={"gpt4"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={
          "Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
        }
        variant={"list"}
      />
      <AssistantPreview
        title={"salesFr"}
        description={
          "OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here"
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        variant={"list"}
        onClick={() => console.log("clicked")}
      />
    </div>
    <h2>Template</h2>
    <div className="s-grid s-grid-cols-2">
      <AssistantPreview
        title={"gpt4"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        variant={"list"}
      />
      <AssistantPreview
        title={"salesFr"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        variant={"list"}
        onClick={() => console.log("clicked")}
      />
    </div>
    <h2>Gallery</h2>
    <div className="s-grid s-grid-cols-2">
      <AssistantPreview
        title={"gpt4"}
        description={
          "OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here"
        }
        onClick={() => console.log("clicked")}
        pictureUrl="https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
        subtitle="Stanislas Polu, Pauline Pham"
        variant="gallery"
        renderActions={() => {
          return (
            <div className="s-flex s-gap-2">
              <Chip label="Shared Assistant" color="pink" />
            </div>
          );
        }}
      />
      <AssistantPreview
        title="salesFr"
        description="OpenAI's most powerful and recent model (128k context)."
        pictureUrl="https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"
        subtitle={
          "Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
        }
        variant="gallery"
        onClick={() => console.log("clicked")}
        onPlayClick={() => console.log("play")}
        renderActions={(isHovered) => {
          return (
            <div className="s-flex s-gap-2">
              <Chip label="Company Assistant" color="amber" />
              {isHovered && (
                <Button
                  label="Add to my list"
                  size="xs"
                  hasMagnifying={false}
                  variant="tertiary"
                  icon={ListAddIcon}
                />
              )}
            </div>
          );
        }}
      />
    </div>
    <h2>Minimal</h2>
    <div className="s-grid s-w-full s-grid-cols-2 s-gap-2 md:s-grid-cols-3">
      <div className="s-rounded-xl s-border s-border-structure-100">
        <AssistantPreview
          title={"gpt4-turbo"}
          pictureUrl={
            "https://dust.tt/static/systemavatar/gpt4_avatar_full.png"
          }
          subtitle={"Dust"}
          description=""
          variant="minimal"
          onClick={() => console.log("AssistantPreview clicked")}
          onActionClick={() => console.log("Action clicked")}
        />
      </div>
      <div className="s-rounded-xl s-border s-border-structure-100">
        <AssistantPreview
          title={"SQLGod"}
          pictureUrl={"https://dust.tt/static/droidavatar/Droid_Green_2.jpg"}
          subtitle={"Dust"}
          description=""
          variant="minimal"
          onClick={() => console.log("AssistantPreview clicked")}
          onActionClick={() => console.log("Action clicked")}
        />
      </div>
      <div className="s-rounded-xl s-border s-border-structure-100">
        <AssistantPreview
          title={"salesfr"}
          pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
          subtitle={"Dust"}
          description=""
          variant="minimal"
          onClick={() => console.log("AssistantPreview clicked")}
          onActionClick={() => console.log("Action clicked")}
        />
      </div>
    </div>
  </div>
);
