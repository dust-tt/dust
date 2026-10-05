import type { TransProps } from "@lingui/react";
import { LinguiContext, Trans as LinguiTrans } from "@lingui/react";
import { TransNoContext } from "@lingui/react/server";
import { FALLBACK_CONTEXT } from "@sparkle/lib/i18n/useLingui";
import React, { useContext } from "react";

// Without a provider, renders `TransNoContext` (what Lingui's `Trans` renders once it has read the
// context) with the fallback context, instead of providing that context to `components`.
export function Trans(props: TransProps) {
  if (useContext(LinguiContext) === null) {
    return <TransNoContext {...props} lingui={FALLBACK_CONTEXT} />;
  }
  return <LinguiTrans {...props} />;
}
