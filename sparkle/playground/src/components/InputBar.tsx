import { cn } from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

interface InputBarProps {
  placeholder?: string;
  className?: string;
}

export function InputBar({ placeholder = "Ask a question", className }: InputBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (divRef.current && !divRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  return (
    <div
      ref={divRef}
      onClick={handleFocus}
      className={cn(
        "s-relative s-flex s-w-full s-flex-row",
        "s-border s-bg-primary-50 s-transition-all md:s-rounded-3xl",
        isFocused
          ? "s-border-highlight-300 md:s-ring-2 md:s-ring-highlight-300 md:s-ring-offset-2"
          : "s-border-border/0",
        className
      )}
    >
      <div className="s-flex s-w-full s-flex-col">
        <div className="s-h-full s-w-full s-p-5 s-text-muted-foreground">
          {placeholder}
        </div>
      </div>
    </div>
  );
}

