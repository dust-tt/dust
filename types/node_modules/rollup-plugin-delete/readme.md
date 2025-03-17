# rollup-plugin-delete

[![Build Status](https://travis-ci.org/vladshcherbin/rollup-plugin-delete.svg?branch=master)](https://travis-ci.org/vladshcherbin/rollup-plugin-delete)
[![Codecov](https://codecov.io/gh/vladshcherbin/rollup-plugin-delete/branch/master/graph/badge.svg)](https://codecov.io/gh/vladshcherbin/rollup-plugin-delete)

Delete files and folders using Rollup.

## About

This plugin is useful when you want to clean `dist` or other folders and files before bundling. It's using [del package](https://github.com/sindresorhus/del) inside, check it for pattern examples.

## Installation

```bash
# yarn
yarn add rollup-plugin-delete -D

# npm
npm install rollup-plugin-delete -D
```

## Usage

```js
// rollup.config.js
import del from 'rollup-plugin-delete'

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/app.js',
    format: 'cjs'
  },
  plugins: [
    del({ targets: 'dist/*' })
  ]
}
```

### Configuration

There are some useful options:

#### targets

A string or an array of patterns of files and folders to be deleted. Default is `[]`.

```js
del({
  targets: 'dist/*'
})

del({
  targets: ['dist/*', 'build/*']
})
```

#### verbose

Output removed files and folders to console. Default is `false`.

```js
del({
  targets: 'dist/*',
  verbose: true
})
```

> Note: use \* (wildcard character) in pattern to show removed files

#### hook

[Rollup hook](https://rollupjs.org/guide/en/#build-hooks) the plugin should use. Default is `buildStart`.

```js
del({
  targets: 'dist/*',
  hook: 'buildEnd'
})
```

#### runOnce

Type: `boolean` | Default: `false`

Delete items once. Useful in watch mode.

```js
del({
  targets: 'dist/*',
  runOnce: true
})
```

All other options are passed to [del package](https://github.com/sindresorhus/del) which is used inside.

## License

MIT
