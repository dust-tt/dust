import { cn } from "@dust-tt/sparkle";
import React from "react";

import { CODE_LENGTH } from "@app/pages/api/auth/phone_verification";

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
          className={cn(
            "h-20 w-16",
            "rounded-xl text-center text-2xl",
            "border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800",
            "font-medium text-foreground dark:text-foreground-night",
            "focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-400-night"
          )}
        />
      ))}
    </div>
  );
}
