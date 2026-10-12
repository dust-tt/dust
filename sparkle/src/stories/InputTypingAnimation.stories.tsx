import type { Meta, StoryObj } from "@storybook/react";
import React, { useCallback, useRef, useState } from "react";
import { fn } from "storybook/test";

import type { InputTypingAnimationProps } from "@sparkle/components/InputTypingAnimation";

import { Chip, Input, InputTypingAnimation } from "../index_with_tw_base";

const meta = {
  title: "Effects & Motion/InputTypingAnimation",
  component: InputTypingAnimation,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `Types a value into an input with **TypingAnimation**, for values set programmatically, e.g. from a suggestion chip. A native input cannot render animated text, so the typing is drawn over it while the input's own text is hidden.

**When to use**
- Right after setting an input's value from a suggestion, to show where it went.

**Guidelines**
- Set the input's value first, then mount the component with that **input** element and **text**.
- Unmount it on **onDone**: it is called once the text is typed, or as soon as the user types in the input.
- Skip it for users who prefer reduced motion.`,
      },
    },
  },
  argTypes: {
    input: { control: false },
    text: { control: false },
  },
} satisfies Meta<typeof InputTypingAnimation>;

export default meta;
type Story = StoryObj<typeof InputTypingAnimation>;

const SUGGESTIONS = ["She/Her", "He/Him", "They/Them"];

function SuggestionsDemo({ onDone }: Partial<InputTypingAnimationProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState<{
    input: HTMLInputElement;
    text: string;
  } | null>(null);
  const endTyping = useCallback(() => {
    setTyping(null);
    onDone?.();
  }, [onDone]);

  const pick = (suggestion: string) => {
    if (inputRef.current && suggestion !== value) {
      setTyping({ input: inputRef.current, text: suggestion });
    }
    setValue(suggestion);
  };

  return (
    <div className="flex w-64 flex-col gap-2">
      <Input
        ref={inputRef}
        value={value}
        placeholder="e.g. She/Her"
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <Chip
            key={suggestion}
            label={suggestion}
            size="xs"
            color={suggestion === value ? "highlight" : "primary"}
            onClick={() => pick(suggestion)}
          />
        ))}
      </div>
      {typing && (
        <InputTypingAnimation
          key={typing.text}
          input={typing.input}
          text={typing.text}
          onDone={endTyping}
        />
      )}
    </div>
  );
}

/**
 * Suggestion chips under an input: picking one sets the input's value and
 * types it in. **onDone** fires once the text is typed.
 * @summary Suggestion typed into an input.
 */
export const FromSuggestions: Story = {
  args: {
    onDone: fn(),
  },
  render: (args) => <SuggestionsDemo {...args} />,
};
