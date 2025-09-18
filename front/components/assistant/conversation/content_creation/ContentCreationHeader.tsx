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
      <div className="flex h-full min-w-0 max-w-full items-center justify-end">
        {/* Actions - always visible and right-aligned. */}
        <div className="flex shrink-0 items-center gap-2">
          {children}
          {onClose && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onClose}
              icon={XMarkIcon}
              className="text-element-600 hover:text-element-900"
            />
          )}
        </div>
      </div>
    </AppLayoutTitle>
  );
}
