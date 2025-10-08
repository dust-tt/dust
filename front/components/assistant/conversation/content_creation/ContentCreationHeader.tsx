import { Button, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";

interface ContentCreationHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
}

export function ContentCreationHeader({
  children,
  onClose,
}: ContentCreationHeaderProps) {
  return (
    <AppLayoutTitle className="bg-gray-50 @container dark:bg-gray-900">
      <div className="flex h-full items-center">
        {children}
        {onClose && (
          <Button
            variant="ghost"
            onClick={onClose}
            icon={XMarkIcon}
            className="text-element-600 hover:text-element-900 ml-auto"
          />
        )}
      </div>
    </AppLayoutTitle>
  );
}
