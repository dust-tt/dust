import type { Meta } from "@storybook/react";
import React from "react";

import {
  AssistantCard,
  AssistantCardMore,
  CardGrid,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LargeAssistantCard,
} from "@sparkle/components";

const meta: Meta<typeof AssistantCard> = {
  title: "Modules/AssistantCard",
  component: AssistantCard,
};

export default meta;

const ddMenu = (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <AssistantCardMore />
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem label="Edit" />
      <DropdownMenuItem label="Duplicate" />
      <DropdownMenuItem label="Remove" />
    </DropdownMenuContent>
  </DropdownMenu>
);

export const AssistantCardExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>List</h2>
    <div className="s-grid s-grid-cols-2 s-gap-4">
      <LargeAssistantCard
        title={"@gpt4"}
        description={"OpenAI's most powerful and recent model (128k context)."}
        onClick={() => console.log("clicked")}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={
          "Stanislas Polu, Pauline Pham, Henry Fontanier, Edouard Wautier"
        }
      />
      <LargeAssistantCard
        title={"@alesFr"}
        description={
          "OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here"
        }
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"Stanislas Polu"}
        onClick={() => console.log("clicked")}
      />
    </div>
    <h2>Minimal</h2>
    <CardGrid>
      <AssistantCard
        title={"gpt4-turbo"}
        pictureUrl={"https://dust.tt/static/systemavatar/gpt4_avatar_full.png"}
        subtitle={"By: OpenAI"}
        description="OpenAI's GPT 4o model (128k context)."
        onClick={() => console.log("AssistantCard clicked")}
        action={ddMenu}
      />
      <AssistantCard
        title={"SQLGod"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Green_2.jpg"}
        subtitle={"By: Edouard Wautier, Pierrette Louant, Fabienne Lescure"}
        description={
          "OpenAI's most powerful and recent model (128k context). With a very long description that starts to repeat itself here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here here"
        }
        onClick={() => console.log("AssistantCard clicked")}
        action={<AssistantCardMore onClick={() => console.log("hello")} />}
      />
      <AssistantCard
        title={"SalesAgentFranceExpatTralala"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_2.jpg"}
        subtitle={"By: OpenAI"}
        description="Tech journalist providing insights on Accel's VC team expertise and notable deals."
        onClick={() => console.log("AssistantCard clicked")}
        action={<AssistantCardMore onClick={() => console.log("hello")} />}
      />
      <AssistantCard
        title={"customActionElement"}
        pictureUrl={"https://dust.tt/static/droidavatar/Droid_Yellow_4.jpg"}
        subtitle={"Dust"}
        description="Showing a custom action element"
        onClick={() => console.log("AssistantCard clicked")}
        action={<AssistantCardMore onClick={() => console.log("hello")} />}
        variant="secondary"
      />
    </CardGrid>
  </div>
);
