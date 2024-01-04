import type { Meta } from "@storybook/react";
import React from "react";

import { AssistantPreview } from "../index_with_tw_base";

const meta: Meta<typeof AssistantPreview> = {
  title: "Molecule/AssistantPreview",
  component: AssistantPreview,
};

export default meta;

export const AssistantPreviewExample = () => (
  <div>
    <h2>Gallery view (variant: `lg`)</h2>
    <div className="s-flex s-flex-row">
      <AssistantPreview
        allowAddAction={true}
        description={"OpenAI's most powerful and recent model (128k context)."}
        isAdded={false}
        isUpdatingList={false}
        isWorkspace={false}
        name={"gpt4"}
        onShowDetailsClick={() => alert("Details button clicked")}
        onTestClick={() => alert("Test button clicked")}
        onUpdate={(action) => {
          alert(`Update button clicked with action: ${action}`);
          return;
        }}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"Stanislas Polu, Pauline Pham"}
        variant={"lg"}
      />
      <AssistantPreview
        allowAddAction={true}
        allowRemoveAction={true}
        name={"gpt3.5-turbo"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt3_avatar_full.png"}
        subtitle={"Stanislas Polu, Pauline Pham"}
        onShowDetailsClick={() => alert("Details button clicked")}
        onUpdate={(action) => {
          alert(`Update button clicked with action: ${action}`);
          return;
        }}
        variant={"lg"}
        isWorkspace={false}
        isAdded={true}
        isUpdatingList={false}
      />
    </div>
  </div>
);
