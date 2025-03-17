# Changelog

> **Tags:**
>
> - [New Feature]
> - [Bug Fix]
> - [Breaking Change]
> - [Documentation]
> - [Internal]
> - [Polish]
> - [Experimental]
> - [Deprecation]

**Note**: Gaps between patch versions are faulty/broken releases. **Note**: A feature tagged as Experimental is in a
high state of flux, you're at risk of it changing without notice.

# 0.3.5

- **Polish**
  - Add missing pure annotations, #31 (@OliverJAsh)

# 0.3.4

- **Bug Fix**
  - don't set `target: es6` in `tsconfig.build-es6.json` (@gcanti)
- **Internal**
  - upgrade to latest `docs-ts` (@gcanti)

# 0.3.3

- **Bug Fix**
  - rewrite es6 imports (@gcanti)

# 0.3.2

- **Polish**
  - upgrade to `fp-ts@2.0.0` and `monocle-ts@2.0.0` (@gcanti)

# 0.3.1

Fix es6 modules build (@gcanti)

# 0.3.0

- **Breaking Change**
  - upgrade to `fp-ts@2.x` and `monocle-ts@2.x` (@gcanti)
  - remove deprecated APIs (@gcanti)
    - `Carrier` type
  - remove `over` function (@gcanti)
  - remove `unsafeCoerce` function (@gcanti)

# 0.2.4

- **Polish**
  - better integer detection in `Integer` prism (@tatchi)

# 0.2.3

- **Polish**
  - make Newtype readonly (@gcanti)

# 0.2.2

- **New Feature**
  - add `Char`, closes #12 (@gcanti)
  - add `NonEmptyString`, closes #13 (@gcanti)

# 0.2.1

- **New Feature**
  - add `URIOf` type (@gcanti)
  - add prism management (@gcanti)
    - `Concat` type
    - `Extends` type
    - `prism` function
  - add basic newtypes for number (@gcanti)
    - `Integer`
    - `Negative`
    - `NegativeInteger`
    - `NonNegative`
    - `NonNegativeInteger`
    - `NonPositive`
    - `NonPositiveInteger`
    - `NonZero`
    - `NonZeroInteger`
    - `Positive`
    - `PositiveInteger`
- **Deprecation**
  - deprecate `Carrier` in favour of `CarrierOf` (@gcanti)

# 0.2.0

- **Breaking Change**
  - upgrade to `fp-ts@1.0.0`, `monocle-ts@1.0.0` (@gcanti)

# 0.1.2

- **New Feature**
  - export `unsafeCoerce` (@gcanti)

# 0.1.1

- **Internal**
  - optimize `iso` creation (@gcanti)
  - upgrade to latest prettier, 1.9.2 (@gcanti)
  - upgrade to latest TypeScript, 2.6.2 (@gcanti)

# 0.1.0

- **Breaking Change**
  - upgrade to fp-ts 0.6 (@gcanti)

# 0.0.1

Initial release
