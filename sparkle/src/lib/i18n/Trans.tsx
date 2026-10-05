import type { TransProps } from "@lingui/react";
import { LinguiContext, Trans as LinguiTrans } from "@lingui/react";
import { useLingui } from "@sparkle/lib/i18n/useLingui";
import React from "react";

/**
 * @cc [owner:ykmsd,label:product;react] trans-works-without-provider
 * Inside an `I18nProvider`, `Trans` MUST render its message in the locale of the nearest provider
 * and re-render when it changes. Without a provider, it MUST NOT throw and MUST render the message
 * from sparkle's compiled `SPARKLE_SOURCE_LOCALE` catalog, with the same rich-text interpolation
 * (`values`, `components`) as Lingui's `Trans`.
 */
// Target of the `Trans` macro (see `runtimeConfigModule` in `sparkle/lingui.config.ts`), and of
// `Plural`/`Select`/`SelectOrdinal`, which compile to it: components import `Trans` from
// `@lingui/react/macro`, never from this module.
export function Trans(props: TransProps) {
  return (
    <LinguiContext.Provider value={useLingui()}>
      <LinguiTrans {...props} />
    </LinguiContext.Provider>
  );
}
