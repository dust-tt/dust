// `@lingui/vite-plugin` compiles `.po` catalogs on import and exposes their messages.
declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
