import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CodeBlock } from "../index_with_tw_base";

const meta: Meta<typeof CodeBlock> = {
  title: "Product/Conversation/CodeBlock",
  tags: ["a11y-issues"],
  component: CodeBlock,
  parameters: {
    docs: {
      description: {
        component: `Renders syntax-highlighted code from an agent message, either as an \`inline\` snippet or a full block. The language is derived from a \`className\` (e.g. \`language-typescript\`), and block code supports \`wrapLongLines\`, \`showLineNumber\`, and a \`surface\` \`variant\`.

**When to use**
- To display code returned by an agent — both inline tokens within prose and multi-line blocks.

**Guidelines**
- Set \`inline\` for short in-sentence snippets; leave it off for multi-line blocks.
- Pass the language via \`className\` (\`language-<lang>\`) so highlighting matches the content.
- Enable \`wrapLongLines\` for narrow containers; otherwise long lines scroll horizontally. This component backs the code rendering in **Markdown**.`,
      },
    },
  },
  argTypes: {
    children: {
      description: "The code content to display",
      control: { type: "text" },
    },
    className: {
      description:
        "CSS class name, can include language specification (e.g., 'language-javascript')",
      control: { type: "text" },
    },
    inline: {
      description:
        "Whether to render as inline code (single line) or block code",
      control: { type: "boolean" },
      defaultValue: false,
    },
    variant: {
      description: "Visual variant of the code block",
      options: ["surface"],
      control: { type: "select" },
      defaultValue: "surface",
    },
    wrapLongLines: {
      description: "Whether to wrap long lines in block code",
      control: { type: "boolean" },
      defaultValue: false,
    },
    showLineNumber: {
      description: "Whether to show line numbers on the left side of the code",
      control: { type: "boolean" },
      defaultValue: false,
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-background p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A multi-line block with syntax highlighting. The language is passed through
 * the `language-*` class convention (`className="language-typescript"` here);
 * the same convention covers every supported grammar — e.g. `typescript`,
 * `tsx`, `javascript`, `css`, `json`, `bash`, `sql`.
 * @summary Highlighted code block via the language-* class.
 */
export const Default: Story = {
  args: {
    children: `interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

const createUser = (userData: Partial<User>): User => {
  return {
    id: 1,
    name: userData.name || "Anonymous",
    email: userData.email || "",
    isActive: userData.isActive ?? true,
  };
};

const newUser = createUser({ name: "John Doe", email: "john@example.com" });`,
    className: "language-typescript",
    inline: false,
  },
};

/**
 * A short snippet rendered inline within prose via the `inline` prop — used
 * for single tokens or one-liners inside a sentence.
 * @summary Inline code snippet.
 */
export const InlineCode: Story = {
  args: {
    children: "const greeting = 'Hello, World!';",
    inline: true,
  },
};

/**
 * `wrapLongLines` makes overflowing lines wrap instead of scrolling
 * horizontally — useful in narrow containers or on mobile. Without it
 * (the default), long lines keep their formatting and scroll.
 * @summary Long lines wrapped via wrapLongLines.
 */
export const WrappedLongLines: Story = {
  args: {
    children: `// This is a very long line of code that demonstrates how the wrapLongLines prop works when set to true. It contains a lot of text and would normally overflow the container, but with wrapLongLines enabled, it will wrap to the next line instead of creating a horizontal scrollbar.

function processVeryLongFunctionNameWithManyParameters(parameterOne: string, parameterTwo: number, parameterThree: boolean, parameterFour: object): Promise<void> {
  return new Promise((resolve, reject) => {
    // Implementation here
  });
}`,
    className: "language-typescript",
    inline: false,
    wrapLongLines: true,
  },
};

/**
 * `showLineNumber` adds a line-number gutter — helpful when the surrounding
 * conversation refers to specific lines of the code.
 * @summary Block code with a line-number gutter.
 */
export const WithLineNumbers: Story = {
  args: {
    children: `interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

class UserService {
  private users: User[] = [];

  addUser(user: Omit<User, 'id'>): User {
    const newUser: User = {
      id: this.users.length + 1,
      ...user
    };

    this.users.push(newUser);
    return newUser;
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  getAllUsers(): User[] {
    return [...this.users];
  }
}`,
    className: "language-typescript",
    inline: false,
    showLineNumber: true,
  },
};
