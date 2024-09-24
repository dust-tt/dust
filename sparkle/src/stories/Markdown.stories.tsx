import type { Meta } from "@storybook/react";
import React from "react";

import { Button, Markdown } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Markdown",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;

const example1 = `
# Level 1 Title

## Level 2 Title

### Level 3 Title

This is a paragraph with **bold** text and *italic* text.

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

`;

const example2 = `
# Another Level 1 Title

Demo of a list, showcasing our pets of the month:
- Soupinou
- Chawarma
- Chalom
- Anakine
- Goose

---

Demo of a quote below:
> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

> You take the blue pill - the story ends, you wake up in your bed and believe whatever you want to believe. You take the red pill - you stay in Wonderland and I show you how deep the rabbit hole goes.

Another one, a short one:
> Soupinou fait des miaou miaou.

`;

export const MarkdownExample = () => (
  <div className="s-flex s-flex-col s-bg-structure-50 s-p-8">
    <Markdown content={example1} />
    <Markdown content={example2} />
  </div>
);
