# tailwind-scrollbar-hide

[![npm](https://img.shields.io/npm/v/tailwind-scrollbar-hide)](https://www.npmjs.com/package/tailwind-scrollbar-hide)
![npm](https://img.shields.io/npm/dt/tailwind-scrollbar-hide)
![npm](https://img.shields.io/npm/dw/tailwind-scrollbar-hide)
[![install size](https://packagephobia.com/badge?p=tailwind-scrollbar-hide)](https://packagephobia.com/result?p=tailwind-scrollbar-hide)

Tailwind plugin for hide scrollbars, although the element can still be scrolled if the element's content overflows.

<img src="https://user-images.githubusercontent.com/12596485/142972957-272010d3-29f6-4be7-99e1-dd03e7a8b92b.gif" alt="tailwind-scrollbar-hide animation demo" height="500" />

[🕹 Live Playground](https://reslear.github.io/tailwind-scrollbar-hide/)

## Features

🎨 Tailwind v2.x, v3.x, v4.x

🛠️ Port for [unocss-preset-scrollbar-hide](https://github.com/reslear/unocss-preset-scrollbar-hide)

![Firefox >=64 Chrome >= 2 Safari >= 4 Internet Explorer >= 10 ](https://badges.herokuapp.com/browsers?googlechrome=2&firefox=64&safari=4&iexplore=10)

## Installation

Install the plugin from npm:

```sh
# Using npm
npm install tailwind-scrollbar-hide

# Using Yarn
yarn add tailwind-scrollbar-hide

# Using pnpm
pnpm add tailwind-scrollbar-hide
```

Then add the plugin to your config file:

```js
// tailwind.config.js
module.exports = {
  theme: {
    // ...
  },
  plugins: [
    require('tailwind-scrollbar-hide')
    // ...
  ]
}
```

or [using TypeScript](https://tailwindcss.com/docs/configuration#using-esm-or-type-script):

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'
import scrollbarHide from 'tailwind-scrollbar-hide'

export default {
  theme: {
    // ...
  },
  plugins: [scrollbarHide]
} satisfies Config
```

### Tailwind v4 support

[Use legacy configuration files](https://tailwindcss.com/docs/v4-beta#using-legacy-configuration-files) like:

```css
/* index.css */
@import 'tailwindcss';
@config "../../tailwind.config.js";
```

## Usage

Use in you template `scrollbar-hide` for visual hiding scrollbar

```html
<div class="w-4 scrollbar-hide">...</div>
```

or restore default value use `scrollbar-default`

> ⚠️ webkit overriding not working https://github.com/reslear/tailwind-scrollbar-hide/issues/19#issuecomment-1086949110 need switch breakpoint system

```html
<div class="w-4 scrollbar-hide md:scrollbar-default">...</div>
```

## Plugin Inspiration

- https://github.com/tailwindlabs/tailwindcss-forms/tree/main
- https://github.com/tailwindlabs/tailwindcss/discussions/2310#discussioncomment-8592440

## License

[MIT](./LICENSE)
