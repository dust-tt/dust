# UI localization (Lingui)

The UI is translated with [Lingui](https://lingui.dev). English text in the source is the message:
there are no ids to invent, and a string with no translation renders in English.

## Writing a string

```tsx
import { Trans, useLingui } from "@lingui/react/macro";
import { msg, plural } from "@lingui/core/macro";

// JSX text (inline elements stay inside so translators can reorder the sentence).
<Trans>Invite <strong>{name}</strong> to the workspace.</Trans>

// String props, toasts, anything that needs a string.
const { t } = useLingui();
<Input placeholder={t`Search agents`} />

// Counts: never `${n} agent${n > 1 ? "s" : ""}`.
t`${count} ${plural(count, { one: "agent", other: "agents" })} selected`

// Module-level constants: declare with `msg`, resolve at render time.
const LABELS = { admin: msg`Admin`, user: msg`User` };
const { i18n } = useLingui();
<span>{i18n._(LABELS[role])}</span>
```

Rules:

- Do not build sentences with `+` or string interpolation of fragments: use placeholders.
- Do not wrap text that is sent to a model (`lib/actions`, skills, Zod `.describe()`) or that comes
  from the server.
- Do not translate native language names or brand names.

## What happens to your string

1. On commit, the `front-i18n-sync` lefthook step runs `npm run i18n:sync`: it extracts messages
   into `front/locales/<locale>/messages.po` and fills missing translations, then stages the
   catalogs. You never edit a `.po` file by hand.
2. `npm run i18n:check` fails if the committed catalogs are out of date (for CI).
3. At build time the Babel macro plugin compiles `t`/`<Trans>`/`msg` and the Vite plugin compiles
   the `.po` files. Each locale is a lazy chunk.

New strings get a placeholder translation for now (`[fr] <English text>`, see `scripts/i18n/fill.ts`);
the strings of the proof of concept were translated by hand in `locales/fr/messages.po`.

## Locale resolution

`AppI18nProvider` (mounted in `front-spa/src/app/App.tsx`) reads the `locale` user metadata key.
A supported value (`en`, `fr`) is activated; anything else renders English. The picker lives in
Personal Settings, Customization.

## Adding a locale

Add it to `locales` in the root `lingui.config.ts`, to `SUPPORTED_LOCALES` and `LOCALE_LABELS` in
`locales.ts`, and to `CATALOG_LOADERS` in `i18n.ts`, then run `npm run i18n:sync`.
