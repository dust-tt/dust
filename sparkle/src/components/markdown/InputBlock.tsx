import { Checkbox } from "@sparkle/components/Checkbox";
import { sameNodePosition } from "@sparkle/components/markdown/utils";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref"> &
  ReactMarkdownProps & {
    ref?: React.Ref<HTMLInputElement>;
  };

export const MemoInput = memo(
  ({ type, checked, className, onChange, ref, ...props }: InputProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current!);

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

    const handleCheckedChange = (isChecked: boolean) => {
      onChange?.({
        target: { type: "checkbox", checked: isChecked },
      } as React.ChangeEvent<HTMLInputElement>);
    };

    return (
      <div className="s-inline-flex s-items-center">
        <Checkbox
          ref={inputRef as unknown as React.Ref<HTMLButtonElement>}
          size="xs"
          checked={checked}
          className="s-translate-y-[3px]"
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
MemoInput.displayName = "MemoInput";
