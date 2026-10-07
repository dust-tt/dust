---
name: dust-i18n
description: Make front and sparkle UI strings translatable with Lingui. Use when adding or changing user-visible text in `front/components`, `front/hooks` or `front/lib` React code or in `sparkle/src` components, when wrapping existing strings for translation, or when reviewing UI text changes.
---

# Translatable UI strings (Lingui)

The product UI is localised with [Lingui](https://lingui.dev). The English text is the message:
there are no hand-written ids. The supported locales are `SUPPORTED_LOCALES` in
`front/types/locale.ts`. Each source directory using Lingui has its own catalog per `CATALOG_LOCALES`
entry, at `front/locales/{locale}/<directory relative to front>/messages.po`, holding the messages of
the files directly in that directory (`en-GB` uses the `en-US` messages with British date and number
formatting). Code imports `front/locales/{locale}.catalog`, which compiles to all of the locale's
catalogs merged together.

A file that already uses Lingui MUST keep every user-visible string translated. New UI code SHOULD
be written translated. After changing strings, follow [Workflow](#workflow) and translate with the
`dust-translate` skill in the same PR.

## Which macro

| Where the text is | Use | Import |
|---|---|---|
| JSX children | `<Trans>Save changes</Trans>` | `import { Trans } from "@lingui/react/macro"` |
| String props, toasts, `aria-label`, `placeholder` | ``const { t } = useLingui();`` then ``t`Search agents` `` | `import { useLingui } from "@lingui/react/macro"` |
| Module-level constants (labels maps, option lists) | ``msg`Admin` `` at module level, ``t(LABELS[role])`` at render | `import { msg } from "@lingui/core/macro"` |
| Counts | ``t`${count} ${plural(count, { one: "agent", other: "agents" })}` `` or `<Plural>` | `@lingui/core/macro` / `@lingui/react/macro` |
| Zod schema messages | `getXSchema(t)` factory, see [Zod schemas](#zod-schemas) | `import { msg } from "@lingui/core/macro"` |
| Short ambiguous words | ``t({ message: "Open", context: "verb, button label" })`` | |

Rules:

- One message per sentence. Inline markup stays inside one `<Trans>`:
  `<Trans>Invite <strong>{name}</strong> to the <Link to={url}>workspace</Link>.</Trans>`.
- Interpolate with placeholders, never concatenate: ``t`Delete ${name}?` `` not
  `"Delete " + name + "?"`.
- Placeholders must be simple identifiers (`${name}`, not `${user.name}`), so translators see a
  meaningful name: hoist expressions into a `const` first.
- No `pluralize()`, `(s)` suffixes or ternaries between English words: use `plural`/`select`.
- `t` from `useLingui()` only works inside components and hooks. Module-level code uses `msg`.
- Translate descriptors with `t(descriptor)`, not `i18n._(descriptor)`: `i18n` keeps the same
  reference when the locale changes, so memos depending on it would not recompute.
- Write English in sentence case. Do not apply CSS `uppercase`/`capitalize` to translated text.
- Format dates and numbers with the active locale (`i18n.locale`), never a hardcoded `"en-US"`.

## Zod schemas

A schema with translated messages is a plain factory taking `t`. Write messages as
``t(msg`...`)`` (the ``t`...` `` shorthand only works inside components and hooks), and memoize at
the call site so the schema is rebuilt only when the locale changes:

```ts
export function getXFormSchema(t: (descriptor: MessageDescriptor) => string) {
  return z.object({ name: z.string().min(1, t(msg`Name is required.`)) });
}
export type XFormValues = z.infer<ReturnType<typeof getXFormSchema>>;

// In the component:
const { t } = useLingui();
const schema = useMemo(() => getXFormSchema(t), [t]);
```

Compose factories by passing `t` down (`getParentSchema(t)` calls `getChildSchema(t)`). Do not
wrap a schema in a `useXSchema()` hook, and do not pass pre-translated message objects. Tests call
the factory directly with `(descriptor) => i18n._(descriptor)`.

## Never translate

- Text sent to models: `front/lib/actions/**`, MCP tool and server descriptions, skill and agent
  definitions, zod `.describe()`.
- Server code (`front-api/**`, `front/lib/api/**`, `front/temporal/**`): Lingui imports there fail
  lint (`noClientImportsInServer`). Servers return error codes; the UI translates them.
- Poke (`front/components/poke/**`), logs, analytics event names, keyboard symbols (`⌘`, `↵`),
  product and brand names on their own (Dust, Slack), user-generated content.

## Where translated components can render

Lingui components need an `I18nProvider`. Every front-spa entry mounts one at its root (e.g.
`front-spa/src/app/App.tsx`); the `poke`, `share`, `oauth` and `email` entries render in `en-US`.
The browser extension (`extension/`) mounts one in each platform app and compiles the macros in its
webpack build (`extension/config/webpack_lingui.ts`). It always renders `en-US`.

In front tests, `render` and `renderHook` from `@testing-library/react` already wrap the tree in an
`I18nProvider` (see `front/vite.i18nSetup.ts`), around any `wrapper` the test passes, and the locale is
reset to `en-US` after each test. Do not add an `I18nProvider` in tests. To assert a translation,
activate the locale inside `act`:

```tsx
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";

const messages = await loadCatalog("fr-FR");
act(() => i18n.loadAndActivate({ locale: "fr-FR", messages }));
render(<MyComponent />);
```

## Sparkle components

Sparkle (`@dust-tt/sparkle`) is translated with the same macros and rules, but has its own Lingui
setup, independent of front's (contracts in `sparkle/src/CONTRACTS`):

- `sparkle/lingui.config.ts` resolves the macros to sparkle's own `useLingui` and `Trans`
  (`sparkle/src/lib/i18n/`), which read sparkle's context, not the consumer's. Outside
  `sparkle/src/lib/i18n/`, never import `useLingui`, `Trans`, `I18nProvider` or `i18n` from
  `@lingui/react` or `@lingui/core`: they would read front's instance, which has no sparkle messages.
- Sparkle has one catalog per locale, `sparkle/src/locales/{locale}/messages.po`, and stories
  (`sparkle/src/stories/`) are not extracted: do not translate them.
- For text a consumer may override, make the prop optional with no default and fall back at render:
  ``{label ?? t`Load more`}``. A destructuring default cannot call `t`.
- The locale comes from `SparkleI18nProvider`. Without it, sparkle renders `en-US` (marketing,
  viz, the extension). Front mounts `SparkleLocaleProvider` (`front/components/app/`) at every app
  root that mounts `UserLocaleSync`, and front tests already wrap in it. Sparkle's locale is a
  catalog locale (`en-GB` renders as `en-US`).
- `SPARKLE_CATALOG_LOCALES` (`sparkle/src/lib/i18n/locales.ts`) must contain every front
  `CATALOG_LOCALES` entry: adding a catalog locale to front means adding it to sparkle too.

## Slack bot (`connectors`)

The Slack bot (`connectors/src/connectors/slack`) has its own catalog in
`connectors/locales/{locale}/messages.po`, extracted by the same `lingui.config.ts`. Connectors
runs under `tsx`, which cannot compile Lingui macros, so the rules differ from front:

- Never import `@lingui/*/macro`. Write `i18n._("Answered by *{agentName}*", { agentName })`: the
  English text is the message id, and `lingui extract` only collects a string literal passed to a
  callee named `i18n._`.
- `i18n` is an `I18n` from `getSlackI18n` (`connectors/src/connectors/slack/lib/i18n.ts`), passed
  down as a parameter. Never use the global `i18n` of `@lingui/core`: the bot answers users with
  different locales concurrently.
- The locales are a copy of `front/types/locale.ts` in `connectors/src/types/locale.ts`: edit
  both (`i18n:check` fails when they differ).
- Same never-translate rules as front: text sent to the Dust API or to models (content fragments,
  message content), logs, agent-authored content.

See `connectors/src/connectors/slack/CONTRACTS`.

## Workflow

1. Wrap the strings with the macros above.
2. From `front/` (or `sparkle/` for sparkle code), run `npm run i18n:extract`: it updates every
   catalog and removes obsolete messages.
3. Fill the new empty `msgstr` entries with the `dust-translate` skill.
4. Run `npm run i18n:check` from the same directory (also run in CI): it fails on stale catalogs
   and missing translations.
5. Commit the code and the catalogs together.
