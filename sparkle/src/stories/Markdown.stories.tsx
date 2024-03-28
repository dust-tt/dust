import type { Meta } from "@storybook/react";
import React from "react";

import { Button, Markdown } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Markdown",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;

export const MarkdownExample = () => (
  <div className="s-flex s-flex-col s-gap-4">
    <Markdown
      content={`# Hello\n## World\nThis is a paragraph with **bold** text.`}
    />
  </div>
);
