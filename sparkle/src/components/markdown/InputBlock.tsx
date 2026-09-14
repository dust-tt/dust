import { Checkbox } from "@sparkle/components/Checkbox";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { sameNodePosition } from "@sparkle/components/markdown/utils";
import { assertNever } from "@sparkle/lib/utils";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref"> &
  ReactMarkdownProps & {
    ref?: React.Ref<HTMLInputElement>;
  };

/**
 * Renders `<input>` elements inside Markdown output; checkboxes (as produced
 * by GitHub Flavored Markdown task lists) are swapped for the Sparkle Checkbox component, or
 * dropped when the "step" task-list variant draws its own badge; other input
 * types pass through unchanged.
 * @summary Input renderer for Markdown task-list checkboxes.
 */
export const InputBlock = memo(
  ({ type, checked, className, onChange, ref, ...props }: InputProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current!);
    const { taskListVariant } = useMarkdownStyle();

    if (type !== "checkbox") {
      return (
        <input
          ref={inputRef}
          type={type}
          checked={checked}
          className={className}
          {...props}
        />
      );
    }

    switch (taskListVariant) {
      case "step":
        return null;
      case "checkbox":
        break;
      default:
        assertNever(taskListVariant);
    }

    const handleCheckedChange = (isChecked: boolean) => {
      onChange?.({
        target: { type: "checkbox", checked: isChecked },
      } as React.ChangeEvent<HTMLInputElement>);
    };

    return (
      <div className="inline-flex items-center">
        <Checkbox
          ref={inputRef as unknown as React.Ref<HTMLButtonElement>}
          checked={checked}
          className="translate-y-[3px]"
          onCheckedChange={handleCheckedChange}
        />
      </div>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.type === next.type &&
    prev.checked === next.checked &&
    prev.className === next.className
);
InputBlock.displayName = "InputBlock";
