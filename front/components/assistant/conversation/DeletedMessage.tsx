import { ContentMessageInline, TrashIcon } from "@dust-tt/sparkle";
import React from "react";

export const DeletedMessage = () => (
  <ContentMessageInline icon={TrashIcon} variant="primary">
    Message was deleted.
  </ContentMessageInline>
);
