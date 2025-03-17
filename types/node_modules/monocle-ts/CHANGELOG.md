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

# 2.3.13

- **Polish**
  - improve `modify` / `modifyOption` behaviour when using `pipe`, #181 (@thewilkybarkid)

# 2.3.12

- **Polish**
  - Add missing pure annotations, #175 (@OliverJAsh)

# 2.3.11

- **Bug Fix**
  - OptionalFromPath: Type Issue fix for 5 arguments, #167 (@Barackos)

# 2.3.10

- **Internal**
  - optimize `fromTraversable`, closes #119 (@gcanti)

# 2.3.9

Experimental modules require `fp-ts@^2.5.0`.

- **Experimental**
  - `At`
    - add `at` constructor (@gcanti)
  - `Iso`
    - add `iso` constructor (@gcanti)
    - add `composeLens` (@gcanti)
    - add `composePrism` (@gcanti)
    - add `composeOptional` (@gcanti)
    - add `composeTraversal` (@gcanti)
    - add `fromNullable` (@gcanti)
    - add `filter` (@gcanti)
    - add `fromNullable` (@gcanti)
    - add `prop` (@gcanti)
    - add `props` (@gcanti)
    - add `component` (@gcanti)
    - add `index` (@gcanti)
    - add `indexNonEmpty` (@gcanti)
    - add `key` (@gcanti)
    - add `atKey` (@gcanti)
    - add `some` (@gcanti)
    - add `right` (@gcanti)
    - add `left` (@gcanti)
    - add `traverse` (@gcanti)
    - add `findFirst` (@gcanti)
    - add `findFirstNonEmpty` (@gcanti)
    - add `composeIso` (@gcanti)
    - add `Semigroupoid` (@gcanti)
    - (\*) rename `invariantIso` to `Invariant` (@gcanti)
    - (\*) rename `categoryIso` to `Category` (@gcanti)
  - `Ix`
    - add `index` constructor (@gcanti)
    - add `indexReadonlyNonEmptyArray` (@gcanti)
  - `Lens`
    - add `lens` constructor (@gcanti)
    - add `composeIso` (@gcanti)
    - add `composeTraversal` (@gcanti)
    - add `indexNonEmpty` (@gcanti)
    - add `findFirstNonEmpty` (@gcanti)
    - add `composeLens` (@gcanti)
    - add `Semigroupoid` (@gcanti)
    - (\*) rename `invariantIso` to `Invariant` (@gcanti)
    - (\*) rename `categoryIso` to `Category` (@gcanti)
  - `Prism`
    - add `prism` constructor (@gcanti)
    - add `composeIso` (@gcanti)
    - add `composeTraversal` (@gcanti)
    - add `indexNonEmpty` (@gcanti)
    - add `findFirstNonEmpty` (@gcanti)
    - add `composePrism` (@gcanti)
    - add `Semigroupoid` (@gcanti)
    - (\*) rename `invariantIso` to `Invariant` (@gcanti)
    - (\*) rename `categoryIso` to `Category` (@gcanti)
  - `Optional`
    - add `optional` constructor (@gcanti)
    - add `composeIso` (@gcanti)
    - add `composeTraversal` (@gcanti)
    - add `indexNonEmpty` (@gcanti)
    - add `findFirstNonEmpty` (@gcanti)
    - add `composeOptional` (@gcanti)
    - add `Semigroupoid` (@gcanti)
    - (\*) rename `invariantIso` to `Invariant` (@gcanti)
    - (\*) rename `categoryIso` to `Category` (@gcanti)
  - `Traversal`
    - add `traversal` constructor (@gcanti)
    - add `composeIso` (@gcanti)
    - add `composeLens` (@gcanti)
    - add `composePrism` (@gcanti)
    - add `composeOptional` (@gcanti)
    - add `findFirst` (@gcanti)
    - add `findFirstNonEmpty` (@gcanti)
    - add `fromNullable` (@gcanti)
    - add `indexNonEmpty` (@gcanti)
    - add `composeTraversal` (@gcanti)
    - add `Semigroupoid` (@gcanti)
    - (\*) rename `categoryIso` to `Category` (@gcanti)

(\*) breaking change

# 2.3.7

- **Experimental**
  - `At`
    - add `atReadonlyRecord` (@gcanti)
    - add `atReadonlyMap` (@gcanti)
    - add `atReadonlySet` (@gcanti)
    - deprecate `atRecord` (@gcanti)
  - `Ix`
    - add `indexReadonlyRecord` (@gcanti)
    - add `indexReadonlyArray` (@gcanti)
    - add `indexReadonlyMap` (@gcanti)
    - deprecate `indexRecord` (@gcanti)
    - deprecate `indexArray` (@gcanti)
  - `Optional`
    - add `composeLens` (@gcanti)
    - add `composePrism` (@gcanti)
    - add `setOption` (@gcanti)

# 2.3.6

- **Polish**
  - import without `/lib` or `/es6` paths, closes #147 (@gcanti)

# 2.3.5

- **Experimental**
  - add `modifyF`, closes #149 (@gcanti)
    - `Iso`
    - `Lens`
    - `Prism`
    - `Optional`

# 2.3.4

- **Experimental**
  - `Lens`, `Prism`, `Optional`: add `Refinement` overload to `findFirst`, #148 (@wmaurer)

# 2.3.3

- **Experimental**
  - `Prism`
    - (\*) remove `fromSome` constructor (@gcanti)
    - (\*) change `fromNullable` signature (@gcanti)
  - `Optional`
    - add missing `fromNullable` combinator, closes #133 (@gcanti)

(\*) breaking change

# 2.3.2

- **Experimental**
  - `At`
    - add `atRecord` (@gcanti)
  - `Ix`
    - add `indexArray` (@gcanti)
    - add `indexRecord` (@gcanti)
  - `Lens`
    - add `findFirst` combinator, closes #131 (@gcanti)
  - `Prism`
    - add `findFirst` combinator (@gcanti)
    - add `traverse` combinator (@gcanti)
  - `Optional`
    - add `findFirst` combinator (@gcanti)
    - add `traverse` combinator (@gcanti)

# 2.3.1

- **Experimental**
  - add `Iso` module (@gcanti)
  - add `Lens` module (@gcanti)
  - add `Prism` module (@gcanti)
  - add `Optional` module (@gcanti)
  - add `Traversal` module (@gcanti)
  - add `At` module (@gcanti)
  - add `Ix` module (@gcanti)
- **Internal**
  - implement old APIs through new APIs (@gcanti)

# 2.2.0

- **New Feature**
  - `At`
    - add `ReadonlyRecord` module (@gcanti)
    - add `ReadonlySet` module (@gcanti)
  - `Index`
    - add `ReadonlyArray` module (@gcanti)
    - add `ReadonlyNonEmptyArray` module (@gcanti)
    - add `ReadonlyRecord` module (@gcanti)

# 2.1.1

- **Bug Fix**
  - fix `Optional.fromPath`, #122 (@mikearnaldi)

# 2.1.0

- **New Feature**
  - Add support for `Optional.fromPath`, #105 (@cybermaak)
- **Bug Fix**
  - handle nullable values in `fromNullableProp`, fix #106 (@gcanti)

# 2.0.1

- **Bug Fix**
  - rewrite es6 imports (@gcanti)

# 2.0.0

- **Breaking Change**
  - upgrade to `fp-ts@2.x` (@gcanti)
  - remove deprecated APIs (@gcanti)
    - uncurried `Lens.fromProp`
    - uncurried `Lens.fromProps`
    - uncurried `Lens.fromNullableProp`
    - uncurried `Optional.fromNullableProp`
    - uncurried `Optional.fromOptionProp`
  - remove `At/StrMap` (@gcanti)
  - remove `Index/StrMap` (@gcanti)

# 1.7.2

output ES modules to better support tree-shaking (@gcanti)

# 1.7.1

- **Polish**
  - move `fp-ts` to peerDependencies (@gcanti)

# 1.7.0

- **New Feature**
  - add `At/Record` (@mlegenhausen)
  - add `Index/Record` (@mlegenhausen)

# 1.6.1

- **Polish**
  - Providing a `Refinement` to the `find` method of `Fold` will return the narrowed type (@Stouffi)

# 1.6.0

- **New Feature**
  - add `Traversal.prototype.filter` (@gcanti)
  - add `Either` prisms (@gcanti)
- **Polish**
  - many optimizitions (@sledorze)
- **Deprecation**
  - deprecate `Prism.fromRefinement` in favour of `Prism.fromPredicate` (@gcanti)

# 1.5.3

- **Bug Fix**
  - revert 27b587b, closes #75 (@gcanti)

# 1.5.2

- **Polish**
  - disallow improper use of `from`\* APIs, closes #73 (@gcanti)

# 1.5.1

- **Polish**
  - add aliases for `compose` methods, closes #51 (@gcanti)

# 1.5.0

- **New Feature**
  - add `indexNonEmptyArray` (@sledorze)
- **Internal**
  - upgrade to `fp-ts@1.11.0` (@sledorze)

**Note**. If you are running `< typescript@3.0.1` you have to polyfill `unknown`.

You can use [unknown-ts](https://github.com/gcanti/unknown-ts) as a polyfill.

# 1.4.1

- **New Feature**
  - add `Prism.fromRefinement` (@bepremeg)
  - add `Optional.fromOptionProp` (@bepremeg)

# 1.3.0

- **New Feature**
  - add `Lens.{fromProp, fromPath, fromNullableProp}` and `Optional.fromNullableProp` curried overloadings (@gcanti)

# 1.2.0

- **New Feature**
  - add `At` (@leighman)
    - add `Set` instance
    - add `StrMap` instance
  - add `Index` (@leighman)
    - add `Array` instance
    - add `StrMap` instance

# 1.1.0

- **New Feature**
  - add `Lens.fromProps` (@gcanti)

# 1.0.0

- **Breaking Change**
  - upgrade to `fp-ts@1.0.0` (@gcanti)

# 0.5.2

- **New Feature**
  - add `Iso.reverse`, closes #36 (@gcanti)

# 0.5.1

- **Experimental**
  - add Flowtype support (@gcanti)

# 0.5.0

- **Breaking Change**
  - upgrade to fp-ts 0.6 (@gcanti)

# 0.4.4

- **New Feature**
  - add `Lens.fromNullableProp` (@gcanti)

# 0.4.3

- **New Feature**
  - `Prism`: add `set` method (@gcanti)
  - `Optional`: add `fromNullableProps` static function (@gcanti)
- **Bug fix**
  - `Prism`: change `asOptional`, `asTraversal` implementations, fix #29 (@gcanti)

# 0.4.2

- **Polish**
  - fix Optional laws (@gcanti)
  - remove `Endomorphism` type alias (@gcanti)

# 0.4.1

- **New Feature**
  - Add aliases to ISO, closes #24 (@gcanti)

# 0.4.0

- **Breaking Change**
  - upgrade to fp-ts 0.5 (@gcanti)
  - currying of all APIs (@gcanti)

# 0.3.2

- **Polish**
  - upgrade to latest fp-ts (0.4.3) (@gcanti)

# 0.3.1

- **New Feature**
  - Added Setter (@LiamGoodacre)
  - Added Getter (@LiamGoodacre)
  - Added all possible conversions (e.g asGetter, asFold, etc) (@LiamGoodacre)
  - Added all possible compositions (@LiamGoodacre)
  - add \_tag fields (allows for tagged unions) (@gcanti)
- **Polish**
  - Fixed some typos (Options/Option -> Optional) (@LiamGoodacre)
  - Minor rearrangement so conversions and compositions are grouped (@LiamGoodacre)

# 0.3.0

- **Breaking Change**
  - upgrade to latest fp-ts (@gcanti)

# 0.2.0

- **New Feature**
  - add `Prism.some`, closes #10 (@gcanti)
  - add `composeX`, closes #11 (@gcanti)
- **Breaking Change**
  - upgrade to latest `fp-ts` (`monocle-ts` APIs are not changed though) (@gcanti)
  - drop `lib-jsnext` folder
  - remove `Optional.fromProp`, closes #9 (@gcanti)

# 0.1.1

- **New Feature**
  - add `Prism.fromPredicate`
  - fix `Optional.fromProp`

# 0.1.0

Initial release
