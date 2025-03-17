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

**Note**: Gaps between patch versions are faulty/broken releases. **Note**: A feature tagged as Experimental is in a
high state of flux, you're at risk of it changing without notice.

# 0.5.19

- **New Feature**
  - add `mapFromEntries`, `readonlyMapFromEntries` codecs, #172 (@mlegenhausen)

# 0.5.18

- **Polish**
  - add output indexed types to option and either, #171 (@mlegenhausen)

# 0.5.17

- **Polish**
  - `nonEmptyArray`: change output type from `Array` to `NonEmptyArray`, #170 (@OliverJAsh)
  - `readonlyNonEmptyArray`: change output type from `ReadonlyArray` to `ReadonlyNonEmptyArray`, #170 (@OliverJAsh)

# 0.5.16

- **Bug Fix**
  - fix `DateFromUnixTime.encode` returning a floating point number, #160 (@saevarb)

# 0.5.15

- **Polish**
  - export `Json`, `JsonRecord`, `JsonArray` codecs from `JsonFromString` module, closes #156 (@gcanti)

# 0.5.14

- **New Feature**
  - add `JsonFromString`, closes #153 (@gcanti)

# 0.5.13

- **New Feature**
  - add `BooleanFromNumber`, #152 (@EricCrosson)

# 0.5.12

- **New Feature**
  - add `withEncode` combinator, #146 (@EricCrosson)

# 0.5.11

- **New Feature**
  - add `BigIntFromString` codec, #141 (@EricCrosson)

# 0.5.10

- **Polish**
  - expose modules without lib/es6 prefix, #137 (@osdiab)

# 0.5.9

- **Polish**
  - pass context to withMessage callback #136 (@johngeorgewright)

# 0.5.8

- **New Feature**
  - export each module's exports from the library entrypoint, closes #129 (@waynevanson)

# 0.5.7

- **New Feature**
  - add `readonlyNonEmptyArray` (@gcanti)
  - add `readonlySetFromArray` (@gcanti)

# 0.5.6

- **Polish**
  - `fromNewtype`
    - add support for branded types, #123 (@mlegenhausen)
- **Internal**
  - upgrade to `typescript@3.8` (@gcanti)

# 0.5.5

- **Bug Fix**
  - add sideEffects field to package.json (@gcanti)

# 0.5.4

- **Bug Fix**
  - rewrite es6 imports (@gcanti)

# 0.5.3

- **New Feature**
  - Provide version with ES modules (@OliverJAsh)

# 0.5.2

- **New Feature**
  - add `fromNewtype`, closes #111 (@mlegenhausen)

# 0.5.1

- **Bug Fix**
  - remove source maps, fix #106 (@gcanti)

# 0.5.0

**Note**. `io-ts-types` depends on

- [`fp-ts`](https://github.com/gcanti/fp-ts)
- [`io-ts`](https://github.com/gcanti/io-ts)
- [`monocle-ts`](https://github.com/gcanti/monocle-ts)

starting from `0.5.0` you must install `fp-ts`, `io-ts` and `monocle-ts` manually (`fp-ts`, `io-ts` and `monocle-ts` are listed in `peerDependencies`)

- **Breaking Change**
  - upgrade to `fp-ts@2`, `monocle-ts@2` and `io-ts@2.0.0` (@gcanti)
  - move `fp-ts@2`, `monocle-ts@2` and `io-ts@2.0.0` to `peerDependencies` (@gcanti)
  - remove `boolean` folder (@gcanti)
    - move `BooleanFromString` to top level
  - remove `date` folder (@gcanti)
    - move `date` to top level
    - move `DateFromISOString` to top level
    - move `DateFromNumber` to top level
    - move `DateFromUnixTime` to top level
  - remove `fp-ts` folder (@gcanti)
    - move `createEitherFromJSON` to top level and rename to `either`
    - move `createNonEmptyArrayFromArray` to top level and rename to `nonEmptyArray`
    - move `createOptionFromJSON` to top level and rename to `option`
    - remove `createStrMapFromDictionary`
    - move `createOptionFromNullable` to top level and rename to `optionFromNullable`
    - move `createSetFromArray` to top level and rename to `setFromArray`
  - remove `JSON` folder (@gcanti)
  - remove `monocle-ts` (@gcanti)
    - move `lensesFromInterface` to top level and renamed to `getLenses` (@gcanti)
    - remove `TypePrismIso` module (@gcanti)
  - remove `newtype-ts` folder (@gcanti)
  - remove `number` folder (@gcanti)
    - move `NumberFromString` to top level
    - move `IntegerFromString` to top level and rename to `IntFromString`
  - rename `eitherFromJSON` to `either` (@gcanti)
  - rename `optionFromJSON` to `option` (@gcanti)
  - uncurry `fromNullable` (@gcanti)
  - uncurry `fallback` and rename to `withFallback` (@gcanti)

# 0.4.7

- **Bug Fix**
  - bind `decode` to the provided `validate` in `withValidate`, fix #95 (@gcanti)

# 0.4.6

- **New Feature**
  - add `UUID` codec (@mlegenhausen)

# 0.4.5

- **New Feature**
  - add `NonEmptyString` codec (@gcanti)

# 0.4.4

- **New Feature**
  - add `optionFromJSON` combinator (@gcanti)
  - add `eitherFromJSON` combinator (@gcanti)
  - add `IntFromString` codec (@gcanti)
  - add `fromRefinement` combinator (@gcanti)
  - add `regexp` codec (@StefanoMagrassi)
- **Deprecation**
  - deprecate `number/IntegerFromString` in favour of `IntFromString` (@gcanti)
  - deprecate `fp-ts/createOptionFromJSON` in favour of `optionFromJSON` (@gcanti)
  - deprecate `fp-ts/createEitherFromJSON` in favour of `eitherFromJSON` (@gcanti)

# 0.4.3

- **New Feature**
  - add `clone` (@gcanti)
  - add `withValidate` (@gcanti)
  - add `withMessage` (@gcanti)

# 0.4.2

- **Polish**
  - export all interfaces, fix #77 (@sledorze)

# 0.4.1

- **Polish**
  - apply `io-ts@1.6.x` interface pattern (@gcanti)

# 0.4.0

- **Bug fix**
  - switch to `io-ts` pattern, fix #67 (PR #71) (@gcanti)

**Note**. This fix should **not** be a breaking change for most users. However since some signatures are changed, namely their type parameters, this release is published with a minor bump as a precaution.

# 0.3.14

- **New Feature**
  - add `Date/date` (@mlegenhausen)

# 0.3.13

- **New Feature**
  - Export Codec class Types alongside their combinator, https://github.com/gcanti/io-ts-types/pull/63 (@sledorze)

# 0.3.12

- **Internal**
  - fix broken build with `typescript@3.1-rc`, closes #61 (@sledorze)

# 0.3.11

- **New Feature**
  - add `boolean/BooleanFromString`, fixes #55 (@sledorze)

# 0.3.10

- **New Feature**
  - add `fallback`, fixes #49 (@sledorze)
  - add `fromNullable`, closes #51 (@sledorze)

# 0.3.9

- **New Feature**
  - add `string/UUID` (@mlegenhausen)

# 0.3.8

- **New Feature**
  - add `newtype-ts/fromRefinement` (@gcanti)
  - add `newtype-ts/fromNewtypeCurried`, closes #44 (@gcanti)

# 0.3.6

- **Bug Fix**
  - fix `NumberFromString` validation, closes #40 (@sledorze)
- **Internal**
  - simplify `lensesFromInterface` typings, closes #37 (@gcanti)

# 0.3.4

- **New Feature**
  - add `createStrMapFromDictionary` (@mlegenhausen)

# 0.3.3

- **New Feature**
  - add tagged custom types for (@gcanti, @sledorze)
    - createOptionFromNullable
    - createOptionFromJSON
    - createNonEmptyArrayFromArray
    - createEitherFromJSON
    - DateFromISOString
    - DateFromNumber
    - DateFromUnixTime
    - NumberFromString
    - JSONFromString
  - add createSetFromArray, closes #24 (@sledorze)

# 0.3.2

- **New Feature**
  - add `mapOutput`, closes #21 (@gcanti)

# 0.3.1

- **New Feature**
  - add `createNonEmptyArrayFromArray` (@sledorze)
- **Bug Fix**
  - createOptionFromNullable: handle output type (@gcanti)

# 0.3.0

- **Breaking Change**
  - upgrade to `fp-ts@1.0.0`, `io-ts@1.0.0`, `monocle-ts@1.0.0`, `newtype-ts@0.2.0` (@gcanti)

# 0.2.4

- **Bug Fix**
  - createEitherFromJSON and createOptionFromJSON now do serialize correctly their underlying type, fix #15 (@sledorze)

# 0.2.3

- **New Feature**
  - add `MixedStringPrism` (@gcanti)
  - upgrade to latest `io-ts` (0.9.5) (@gcanti)

# 0.2.2

- **New Feature**
  - add `Date/DateFromUnixTime` (@gcanti)
  - add `monocle-ts/MillisecondSecondIso` (@gcanti)
- **Internal**
  - upgrade to latest `io-ts@0.9.1` (@gcanti)

# 0.2.1

- **New Feature**
  - add `newtype-ts/fromNewtype`, fix #11 (@sledorze)

# 0.2.0

- **New Feature**
  - add `JSON/JSONTypeRT` (@gcanti)
  - add `monocle-ts/lensesFromProps` (@gcanti)
- **Breaking Change**
  - upgrade to `io-ts` 0.9 (@gcanti)
  - change signature of `monocle-ts/TypePrismIso` (@gcanti)
  - remove `monocle-ts/composeTypeWithPrism` (@gcanti)
  - remove `monocle-ts/prismsFromUnion` (@gcanti)
  - remove `monocle-ts/lensesFromTuple` (@gcanti)
  - remove `fp-ts/createOption` (@gcanti)
  - remove `fp-ts/createEither` (@gcanti)

# 0.1.1

- **Breaking Change**
  - upgrade to fp-ts 0.6, io-ts 0.8, monocle.ts 0.5 (@gcanti)
  - change name from `JSON` to `JSONType` and add export, fix #8 (@gcanti)

# 0.0.2

- **New Feature**
  - add `lensesFromInterface` (@leemhenson)
  - add `lensesFromTuple` (@gcanti)
  - add `prismsFromUnion` (@gcanti)

# 0.0.1

Initial release
