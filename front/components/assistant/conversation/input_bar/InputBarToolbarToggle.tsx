import { Button, TextIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { Toolbar } from "@app/components/assistant/conversation/input_bar/toolbar/Toolbar";

interface InputBarToolbarToggleProps {
  className?: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  buttonSize: "xs" | "sm";
  editor: Editor | null;
}
export function InputBarToolbarToggle({
  className,
  isOpen,
  setIsOpen,
  buttonSize,
  editor,
}: InputBarToolbarToggleProps) {
  const toggle = () => {
    setIsOpen(!isOpen);
  };
  return (
    <div className={className}>
      {!isOpen && (
        <Button
          variant="ghost-secondary"
          icon={TextIcon}
          size={buttonSize}
          className="flex sm:hidden"
          onClick={toggle}
        />
      )}
      {isOpen && <Toolbar editor={editor} toggleToolbar={toggle} />}
    </div>
  );
}
