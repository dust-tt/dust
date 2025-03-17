# io-ts-reporters

[Error reporters](https://github.com/gcanti/io-ts#error-reporters) for
[io-ts](https://github.com/gcanti/io-ts).

![scarf-downloads](https://scarf.sh/package/installs-badge/376fab85-f2aa-4e85-9225-3be51d9534fc)

Currently this package only includes one reporter. The output is an array of
strings in the format of:

```
Expecting ${expectedType} at ${path} but instead got: ${actualValue}
```

And for union types:

```
Expecting one of:
    ${unionType1}
    ${unionType2}
    ${...}
    ${unionTypeN}
at ${path} but instead got: ${actualValue}
```

## Installation

```bash
yarn add io-ts-reporters
```

## Example

```ts
import * as t from 'io-ts'
import reporter from 'io-ts-reporters'

const User = t.interface({name: t.string})

// When decoding fails, the errors are reported
reporter.report(User.decode({nam: 'Jane'}))
//=> ['Expecting string at name but instead got: undefined']

// Nothing gets reported on success
reporter.report(User.decode({name: 'Jane'}))
//=> []
```

To only format the validation errors in case the validation failed (ie.
`mapLeft`) use `formatValidationErrors` instead.

```ts
import * as t from 'io-ts'
import {formatValidationErrors} from 'io-ts-reporters'
import * as E from 'fp-ts/Either'
import {pipe} from 'fp-ts/pipeable'

const User = t.interface({name: t.string})

const result = User.decode({nam: 'Jane'}) // Either<t.Errors, User>

E.mapLeft(formatValidationErrors)(result) // Either<string[], User>
```

For more examples see [the tests](./tests/index.test.ts).

## TypeScript compatibility

| io-ts-reporters version | required typescript version |
| ----------------------- | --------------------------- |
| 1.0.0                   | 3.5+                        |
| <= 0.0.21               | 2.7+                        |

## Testing

```bash
yarn
yarn run test
```

[io-ts]: https://github.com/gcanti/io-ts#error-reporters

## Credits

This library was created by [OliverJAsh](https://github.com/OliverJAsh).
