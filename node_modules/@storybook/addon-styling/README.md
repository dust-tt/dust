# `@storybook/addon-styling`

Get started in Storybook 7 faster with popular styling tools.

**Using Storybook 6?** Check out the [`release-0-3` branch](https://github.com/storybookjs/addon-styling/tree/release-0-3)

![Toggling between themes](./.github/media/styles-addon.gif)

## ✨ Features

- 🧩 Configuration templates for popular tools
- ⚡️ Options for css modules, postCss, and Sass
- 🎨 Provide themes
- 🔄 Toggle between multiple themes when more than one is provided
- ❗️ Override theme at the component and story level through parameters

## 🏁 Getting Started

To get started, **install the package** as a dev dependency

yarn:

```zsh
yarn add -D @storybook/addon-styling
```

npm:

```zsh
npm install -D @storybook/addon-styling
```

pnpm:

```zsh
pnpm add -D @storybook/addon-styling
```

Then, **include the addon** in your `.storybook/main.js` file

```diff
module.exports = {
  stories: [
    "../stories/**/*.stories.mdx",
    "../stories/**/*.stories.@(js|jsx|ts|tsx)",
  ],
  addons: [
    "@storybook/addon-essentials",
+   "@storybook/addon-styling"
  ],
};
```

### 👇 Tool specific configuration

For tool-specific setup, check out the recipes below

- [`@emotion/styled`](./docs/getting-started/emotion.md)
- [`@mui/material`](./docs/getting-started/material-ui.md)
- [`bootstrap`](./docs/getting-started/bootstrap.md)
- [`cssModules`](./docs/api.md#optionscssmodules)
- [`postcss`](./docs/api.md#optionspostcss)
- [`sass`](./docs/api.md#optionssass)
- [`styled-components`](./docs/getting-started/styled-components.md)
- [`tailwind`](./docs/getting-started/tailwind.md)
- [`vuetify@3.x`](./docs/api.md#writing-a-custom-decorator)

Don't see your favorite tool listed? Don't worry! That doesn't mean this addon isn't for you. Check out the ["Writing a custom decorator"](./docs/api.md#writing-a-custom-decorator) section of the [api reference](./docs/api.md).

### ❗️ Overriding theme

If you want to override your theme for a particular component or story, you can use the `theming.themeOverride` parameter.

```js
import React from "react";
import { Button } from "./Button";

export default {
  title: "Example/Button",
  component: Button,
  parameters: {
    theming: {
      themeOverride: "light", // component level override
    },
  },
};

const Template = (args) => <Button {...args} />;

export const Primary = Template.bind({});
Primary.args = {
  primary: true,
  label: "Button",
};

export const PrimaryDark = Template.bind({});
PrimaryDark.args = {
  primary: true,
  label: "Button",
};
PrimaryDark.parameters = {
  theming: {
    themeOverride: "dark", // Story level override
  },
};
```

## 🤝 Contributing

If you'd like to contribute to this addon, **THANK YOU**, I'd love your help 🙏

### 📝 Development scripts

- `yarn start` runs babel in watch mode and starts Storybook
- `yarn build` build and package your addon code

### 🌲 Branch structure

- **next** - the `next` version on npm, and the development branch where most work occurs
- **main** - the `latest` version on npm and the stable version that most users use

### 🚀 Release process

1. All PRs should target the `next` branch, which depends on the `next` version of Storybook.
2. When merged, a new version of this package will be released on the `next` NPM tag.
3. If the change contains a bugfix that needs to be patched back to the stable version, please note that in PR description.
4. PRs labeled `pick` will get cherry-picked back to the `main` branch and will generate a release on the `latest` npm tag.
