---
name: dust-i18n
description: Make front UI strings translatable with Lingui. Use when adding or changing user-visible text in `front/components`, `front/hooks` or `front/lib` React code, when wrapping existing strings for translation, or when reviewing UI text changes.
---

# Translatable UI strings (Lingui)

The product UI is localised with [Lingui](https://lingui.dev). The English text is the message:
there are no hand-written ids. The supported locales are `SUPPORTED_LOCALES` in
`front/types/locale.ts`; catalogs live in `front/locales/{locale}/messages.po` for `CATALOG_LOCALES`
only (`en-GB` uses the `en-US` messages with British date and number formatting).

A file that already uses Lingui MUST keep every user-visible string translated. New UI code SHOULD
be written translated. After changing strings, follow [Workflow](#workflow) and translate with the
`dust-translate` skill in the same PR.

## Which macro

| Where the text is | Use | Import |
|---|---|---|
| JSX children | `<Trans>Save changes</Trans>` | `import { Trans } from "@lingui/react/macro"` |
| String props, toasts, `aria-label`, `placeholder`, zod messages built in a component | ``const { t } = useLingui();`` then ``t`Search agents` `` | `import { useLingui } from "@lingui/react/macro"` |
| Module-level constants (labels maps, option lists) | ``msg`Admin` `` at module level, ``t(LABELS[role])`` at render | `import { msg } from "@lingui/core/macro"` |
| Counts | ``t`${count} ${plural(count, { one: "agent", other: "agents" })}` `` or `<Plural>` | `@lingui/core/macro` / `@lingui/react/macro` |
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

## Never translate

- Text sent to models: `front/lib/actions/**`, MCP tool and server descriptions, skill and agent
  definitions, zod `.describe()`.
- Server code (`front-api/**`, `front/lib/api/**`, `front/temporal/**`): Lingui imports there fail
  lint (`noClientImportsInServer`). Servers return error codes; the UI translates them.
- Poke (`front/components/poke/**`), logs, analytics event names, keyboard symbols (`⌘`, `↵`),
  product and brand names on their own (Dust, Slack), user-generated content.

## API errors

Never show `err.error.message` or `getErrorFromResponse(res).message` to users: it is English-only,
and private endpoints omit it when it only restates the type. Display API errors with
`useFormatAPIError` (lint: `noRawApiErrorMessageInUi`):

```ts
const formatAPIError = useFormatAPIError();
// SWR error or caught `fetcher` error:
sendNotification({ type: "error", title: t`Failed to rename the space.`, description: formatAPIError(err) });
// Raw `Response`:
description: formatAPIError(await getAPIErrorFromResponse(res)),
```

It renders the translation of the error `type` from `front/lib/client/api_errors/display.ts`, then
the server message as raw context when there is one: `Your data is incomplete. Raw message: "…".`

- A new error type in `front/types/error.ts` needs its sentence in `API_ERROR_MESSAGES` (the
  typecheck fails otherwise), translated like any other message.
- Server side, a private route omits `message` when it only restates the type, using
  `privateApiError` (`front-api/middlewares/utils.ts`). Public `/api/v1` routes and shared
  middlewares keep `apiError`, which requires a message.
- To drop a dynamic message, add a more specific error type (`column_missing` rather than
  `invalid_request_error` + "Column foo is missing") so the translation says it all.
- Not yet in code the browser extension imports (see below): keep `message ?? type` there.

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

## Workflow

1. Wrap the strings with the macros above.
2. From `front/`, run `npm run i18n:extract`: it updates every catalog and removes obsolete
   messages.
3. Fill the new empty `msgstr` entries with the `dust-translate` skill.
4. Run `npm run i18n:check` (also run in CI): it fails on stale catalogs and missing translations.
5. Commit the code and the catalogs together.
