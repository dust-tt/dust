import type { Meta } from "@storybook/react";
import React from "react";

import { AssistantPreview } from "../index_with_tw_base";

const meta: Meta<typeof AssistantPreview> = {
  title: "Modules/AssistantPreview",
  component: AssistantPreview,
};

export default meta;

export const AssistantPreviewExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
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
    <h2>Minimal</h2>
    <div className="s-grid s-w-full s-grid-cols-2 s-gap-2 md:s-grid-cols-3">
      <AssistantPreview
        title={"gpt4-turbo"}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"Dust"}
        description=""
        variant="minimal"
        onClick={() => console.log("AssistantPreview clicked")}
        onActionClick={() => console.log("Action clicked")}
      />
      <AssistantPreview
        title={"SQLGod"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Green_2.jpg"}
        subtitle={"Dust"}
        description=""
        variant="minimal"
        onClick={() => console.log("AssistantPreview clicked")}
        onActionClick={() => console.log("Action clicked")}
      />
      <AssistantPreview
        title={"salesfr"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Dust"}
        description="Tech journalist providing insights on Accel's VC team expertise and notable deals."
        variant="minimal"
        onClick={() => console.log("AssistantPreview clicked")}
        onActionClick={() => console.log("Action clicked")}
      />
      <AssistantPreview
        title={"customActionElement"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg"}
        subtitle={"Dust"}
        description="Showing a custom action element"
        variant="minimal"
        onClick={() => console.log("AssistantPreview clicked")}
        onActionClick={() => console.log("Action clicked")}
        actionElement={<>more</>}
      />
    </div>
  </div>
);
