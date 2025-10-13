import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CodeBlock } from "../index_with_tw_base";

const meta: Meta<typeof CodeBlock> = {
  title: "Components/CodeBlock",
  component: CodeBlock,
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
      <div className="s-bg-background s-p-4 dark:s-bg-background-night">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Inline code examples
export const InlineCode: Story = {
  args: {
    children: "const greeting = 'Hello, World!';",
    inline: true,
  },
};

export const InlineCodeWithVariant: Story = {
  args: {
    children: "npm install @dust-tt/sparkle",
    inline: true,
    variant: "surface",
  },
};

export const TypescriptBlock: Story = {
  args: {
    children: `interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

const createUser = (userData: Partial<User>): User => {
  return {
    id: Math.random(),
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

export const ReactTSXBlock: Story = {
  args: {
    children: `import React, { useState, useEffect } from 'react';
import { Button } from '@dust-tt/sparkle';

interface CounterProps {
  initialValue?: number;
  step?: number;
  onCountChange?: (count: number) => void;
}

const Counter: React.FC<CounterProps> = ({ 
  initialValue = 0, 
  step = 1,
  onCountChange
}) => {
  const [count, setCount] = useState<number>(initialValue);

  useEffect(() => {
    document.title = \`Count: \${count}\`;
    onCountChange?.(count);
  }, [count, onCountChange]);

  const increment = (): void => setCount(prev => prev + step);
  const decrement = (): void => setCount(prev => prev - step);
  const reset = (): void => setCount(initialValue);

  return (
    <div className="flex items-center gap-4">
      <Button onClick={decrement} variant="outline">
        -
      </Button>
      <span className="text-2xl font-bold">{count}</span>
      <Button onClick={increment} variant="primary">
        +
      </Button>
      <Button onClick={reset} variant="ghost">
        Reset
      </Button>
    </div>
  );
};

export default Counter;`,
    className: "language-tsx",
    inline: false,
  },
};

export const CSSBlock: Story = {
  args: {
    children: `.code-block {
  background-color: var(--s-muted);
  border: 1px solid var(--s-border);
  border-radius: 0.5rem;
  padding: 1rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.5;
  overflow-x: auto;
}

.code-block .keyword {
  color: #8b5cf6; /* violet-500 */
}

.code-block .string {
  color: #10b981; /* emerald-500 */
}

.code-block .comment {
  color: #6b7280; /* gray-500 */
  font-style: italic;
}

@media (prefers-color-scheme: dark) {
  .code-block {
    background-color: var(--s-muted-night);
    border-color: var(--s-border-night);
  }
}`,
    className: "language-css",
    inline: false,
  },
};

export const JSONBlock: Story = {
  args: {
    children: `{
  "name": "@dust-tt/sparkle",
  "version": "1.0.0",
  "description": "A beautiful component library for React applications",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "test": "jest",
    "lint": "eslint src/**/*.{ts,tsx}"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "class-variance-authority": "^0.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "typescript": "^5.0.0"
  },
  "keywords": ["react", "components", "ui", "typescript"],
  "author": "Dust Team",
  "license": "MIT"
}`,
    className: "language-json",
    inline: false,
  },
};

export const BashBlock: Story = {
  args: {
    children: `#!/bin/bash

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Deploy to production
if [ "$ENVIRONMENT" = "production" ]; then
  echo "Deploying to production..."
  npm run deploy:prod
else
  echo "Deploying to staging..."
  npm run deploy:staging
fi

# Clean up
npm run clean`,
    className: "language-bash",
    inline: false,
  },
};

export const SQLBlock: Story = {
  args: {
    children: `-- Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO users (username, email) VALUES
  ('alice', 'alice@example.com'),
  ('bob', 'bob@example.com'),
  ('charlie', 'charlie@example.com');

-- Query with joins
SELECT 
  u.username,
  u.email,
  p.title as post_title,
  p.created_at as post_date
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
WHERE u.created_at > '2024-01-01'
ORDER BY p.created_at DESC
LIMIT 10;`,
    className: "language-sql",
    inline: false,
  },
};

// Long code example with line wrapping
export const LongCodeWithWrapping: Story = {
  args: {
    children: `// This is a very long line of code that demonstrates how the wrapLongLines prop works when set to true. It contains a lot of text and would normally overflow the container, but with wrapLongLines enabled, it will wrap to the next line instead of creating a horizontal scrollbar. This is particularly useful for mobile devices or narrow containers where horizontal scrolling is not desirable.

function processVeryLongFunctionNameWithManyParameters(
  parameterOne: string,
  parameterTwo: number,
  parameterThree: boolean,
  parameterFour: object,
  parameterFive: array,
  parameterSix: function,
  parameterSeven: string,
  parameterEight: number
): Promise<ComplexReturnType> {
  // Implementation here
  return new Promise((resolve, reject) => {
    // More implementation
  });
}`,
    className: "language-typescript",
    inline: false,
    wrapLongLines: true,
  },
};

// Long code example without line wrapping (default)
export const LongCodeWithoutWrapping: Story = {
  args: {
    children: `// This is a very long line of code that demonstrates how the wrapLongLines prop works when set to false (default). It contains a lot of text and will create a horizontal scrollbar when it overflows the container. This is the default behavior and is useful when you want to preserve the exact formatting of the code.

function processVeryLongFunctionNameWithManyParameters(parameterOne: string, parameterTwo: number, parameterThree: boolean, parameterFour: object, parameterFive: array, parameterSix: function, parameterSeven: string, parameterEight: number): Promise<ComplexReturnType> {
  // Implementation here
  return new Promise((resolve, reject) => {
    // More implementation
  });
}`,
    className: "language-typescript",
    inline: false,
    wrapLongLines: false,
  },
};

export const TypescriptWithLineNumbers: Story = {
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
}

const userService = new UserService();
const newUser = userService.addUser({
  name: "John Doe",
  email: "john@example.com",
  isActive: true
});

console.log("Created user:", newUser);`,
    className: "language-typescript",
    inline: false,
    showLineNumber: true,
  },
};
