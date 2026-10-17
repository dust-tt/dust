---
name: dust-translate
description: Translate or fix Dust product UI, browser extension, Slack bot and Teams bot translations in the Lingui catalogs (`front/locales/*/**/messages.po`, `sparkle/src/locales/*/messages.po`, `extension/locales/*/messages.po` and `connectors/locales/*/messages.po`). Use after `npm run i18n:extract` leaves empty `msgstr` entries, when `npm run i18n:check` reports missing translations, or when asked to fix a translation.
---

# Translating the product UI

Catalogs are gettext `.po` files in `front/locales/{locale}/<source directory>/messages.po`: every
source directory using Lingui has one per entry of `CATALOG_LOCALES` in `front/types/locale.ts`. A
message used in several directories appears in each of their catalogs; translate it the same way
everywhere (`npm run i18n:check` fails otherwise). When the meanings differ, give the messages a
Lingui `context` in the code instead (see the `dust-i18n` skill).

The browser extension has a single catalog per locale, `extension/locales/{locale}/messages.po`,
with the same rules as front's catalogs.

The Slack and Teams bots share a single catalog per locale,
`connectors/locales/{locale}/messages.po`. Its `msgid` is the English text itself: keep the Slack
`mrkdwn` (`*bold*`, `_italic_`, `` `code` ``, `<url|label>`) and the Teams Markdown (`**bold**`,
`[label](url)`) around the translated text.

`en-US` is the source locale: its catalogs are generated and never translated by hand. Every other
catalog must have a non-empty `msgstr` for every message, except the catalogs of a locale with a
`CATALOG_FALLBACK_LOCALES` entry.

`en-GB` falls back to `en-US`: an empty `msgstr` renders the `en-US` message. Only translate the
messages whose British text differs, as listed in [references/en-GB.md](references/en-GB.md), and
leave the others empty.

Sparkle components have their own catalogs, one per locale entry of `SPARKLE_CATALOG_LOCALES`, at
`sparkle/src/locales/{locale}/messages.po`, with the same `en-US` source-locale rule. Run the
commands below from `sparkle/` for them. `i18n:check` does not compare sparkle and front catalogs:
translate a message they share (`Cancel`, `Loading`) the same way in both by hand.

## Procedure

1. Run `npm run i18n:extract` from the repository root (or `sparkle/`) so the catalogs match the code.
2. For each entry with an empty `msgstr` (for `en-GB`, only the entries the `en-GB` guide asks to
   change):
   - Read the `#:` file reference and the code around the string: know whether it is a button,
     a title, a description or a toast, and what it refers to.
   - Honour the `msgctxt` line when present (for example `verb, button label`).
   - Translate following the locale style guide and the glossary in `references/`.
3. To fix an existing translation, edit its `msgstr` only. Never edit `msgid`, `msgctxt` or the
   `#:` references: they are generated from the code.
4. Run `npm run i18n:check` from the same directory.

## Rules for every locale

- Keep placeholders exactly: `{name}`, `{0}`, `<0>…</0>`. You may move them, not rename or drop
  them. Keep ICU structures (`{count, plural, one {…} other {…}}`) and translate only the text
  inside each branch; add the plural categories the target language needs.
- Keep keyboard symbols (`⌘`, `↵`, `⇧`) and product names from the glossary unchanged.
- Match the tone of the English: short, plain, friendly, no marketing language.
- Keep the length close to the English: UI labels have little room. Prefer the shorter wording
  when two are equally correct.
- Use sentence case, as in the English source.

## Locale style guides

Every catalog locale has a style guide (`catalog-locale-has-style-guide` in `front/types/locale.ts`),
and every translation MUST follow the guide of its locale (`catalog-translations-follow-style-guide`
in the root `CONTRACTS`).

- `en-US` (source locale, written in the code): [references/en-US.md](references/en-US.md)
- `en-GB`: [references/en-GB.md](references/en-GB.md)
- `fr-FR`: [references/fr-FR.md](references/fr-FR.md)
- `de-DE`: [references/de-DE.md](references/de-DE.md)
