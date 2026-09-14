module.exports = {
  icon: true,
  expandProps: true,
  // Figma exports black as `black`; svgo normalizes that to `#000` before this
  // runs. Keyed on the value, so it covers both `fill` and `stroke`.
  replaceAttrValues: {
    "#111418": "currentColor",
    black: "currentColor",
    "#000": "currentColor",
    "#000000": "currentColor",
    "#0C0A09": "currentColor",
    "#0c0a09": "currentColor",
  },
  typescript: true,
  prettier: false,
};
