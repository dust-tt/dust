import { CODE_LENGTH } from "@app/lib/plans/trial/phone";
import { cn } from "@dust-tt/sparkle";
import type React from "react";

interface CodeInputProps {
  code: string[];
  onChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  inputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}

export function PhoneNumberCodeInput({
  code,
  onChange,
  onKeyDown,
  onPaste,
  inputRefs,
}: CodeInputProps) {
  return (
    <div className="flex gap-3">
      {Array.from({ length: CODE_LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={code[index]}
          onChange={(e) => onChange(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-20 w-16",
            "rounded-xl text-center text-2xl",
            "border border-primary-200 bg-primary-50",
            "font-medium text-foreground",
            "focus:border-primary-400 focus:outline-hidden focus:ring-2 focus:ring-primary-200"
          )}
        />
      ))}
    </div>
  );
}
