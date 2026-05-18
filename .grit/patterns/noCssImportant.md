---
tags: [lint, css]
level: error
---

# No `!important` in CSS

Disallows `!important` inside string literals and template literals produced
from JS/TS, which covers CSS-in-JS, inline styles, and runtime-injected
stylesheets. See [GEN12] in `CODING_RULES.md`.

Narrow exceptions (third-party library overrides, dev tooling) are handled
via per-file `includes` in `biome.json`, not by suppressing on a case-by-case
basis.

```grit
language js

css_important_string() => `"CSS_IMPORTANT_FORBIDDEN"`
```

## Should flag `!important` in a double-quoted string

```typescript
const css = "color: red !important";
```

```typescript
const css = "CSS_IMPORTANT_FORBIDDEN";
```

## Should flag `!important` in a template literal

```typescript
const css = `color: red !important;`;
```

```typescript
const css = "CSS_IMPORTANT_FORBIDDEN";
```

## Should not flag unrelated strings

```typescript
const message = "this is important";
```
