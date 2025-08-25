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
import {
  BookOpenIcon,
  CommandLineIcon,
  DatabaseIcon,
} from "@sparkle/icons/app";

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

export const ToolCardVariant = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <h2>Tool Card Variant</h2>
    <div className="s-grid s-grid-cols-2 s-gap-3">
      {/* Available tool with Add button */}
      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: DatabaseIcon,
          label: "Data Visualization",
          description: "Generate a data visualization",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Data Visualization clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: CommandLineIcon,
          label: "Agent Management",
          description: "Tools for managing agent configurations",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Agent Management clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: BookOpenIcon,
          label: "Agent Memory",
          description: "User-scoped long-term memory tools for agents.",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Agent Memory clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: DatabaseIcon,
          label: "File Generation",
          description: "Agent can generate and convert files.",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("File Generation clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: BookOpenIcon,
          label: "Image Generation",
          description: "Agent can generate images (GPT Image 1).",
          isSelected: true,
          canAdd: false,
        }}
        onClick={() => console.log("Image Generation clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: DatabaseIcon,
          label: "Interactive Content (Preview)",
          description:
            "Create and update interactive content files that users can execute and interact with.",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Interactive Content clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: BookOpenIcon,
          label: "Reasoning",
          description:
            "Agent can decide to trigger a reasoning model for complex tasks.",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Reasoning clicked")}
      />

      <AssistantCard
        title=""
        description=""
        pictureUrl=""
        toolVariant={{
          icon: CommandLineIcon,
          label: "Run Agent",
          description: "Run a child agent (agent as tool).",
          isSelected: false,
          canAdd: true,
        }}
        onClick={() => console.log("Run Agent clicked")}
      />
    </div>
  </div>
);
