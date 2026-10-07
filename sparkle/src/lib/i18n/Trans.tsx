import type { TransProps } from "@lingui/react";
import { TransNoContext } from "@lingui/react/server";
import { useLingui } from "@sparkle/lib/i18n/useLingui";
import React from "react";

// Renders `TransNoContext` (what Lingui's `Trans` renders once it has read the `LinguiContext`) with
// sparkle's own context instead of the consumer's.
export function Trans(props: TransProps) {
  const lingui = useLingui();
  return <TransNoContext {...props} lingui={lingui} />;
}
