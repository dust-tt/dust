/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  purge: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      roboto: ["Roboto", "sans-serif"],
    },
    extend: {
      colors: {
        "brand": {
          DEFAULT: colors.violet[500],
          "dark": colors.violet[400]
        },
        "action": {
          "500": {DEFAULT: colors.violet[500], "dark": colors.violet[500]},
          "400": {DEFAULT: colors.violet[400], "dark": colors.violet[600]},
          "200": {DEFAULT: colors.violet[200], "dark": colors.violet[800]},
          "300": {DEFAULT: colors.violet[300], "dark": colors.violet[700]},
          "100": {DEFAULT: colors.violet[100], "dark": colors.violet[900]},
          "600": {DEFAULT: colors.violet[600], "dark": colors.violet[400]},
          "700": {DEFAULT: colors.violet[700], "dark": colors.violet[300]},
          "800": {DEFAULT: colors.violet[800], "dark": colors.violet[200]},
          "900": {DEFAULT: colors.violet[900], "dark": colors.violet[100]},
          "950": {DEFAULT: colors.violet[950], "dark": colors.violet[50]},
          "50": {DEFAULT: colors.violet[50], "dark": colors.violet[950]},
        },
        "ok": {
          DEFAULT: colors.emerald[500],
          "dark": colors.emerald[400]
        },
        "nok": {
          DEFAULT: colors.red[500],
          "dark": colors.red[500]
        },
        "structure": {
          "0": {DEFAULT: colors.white, "dark": colors.black},
          "50": {DEFAULT: colors.slate[50], "dark": colors.slate[900]},
          "100": {DEFAULT: colors.slate[100], "dark": colors.slate[800]},
          "200": {DEFAULT: colors.slate[200], "dark": colors.slate[700]},
          "300": {DEFAULT: colors.slate[300], "dark": colors.slate[600]},
        },
        "element": {
          "900": {DEFAULT: colors.slate[900], "dark": colors.slate[50]},
          "800": {DEFAULT: colors.slate[800], "dark": colors.slate[200]},
          "700": {DEFAULT: colors.slate[700], "dark": colors.slate[300]},
          "500": {DEFAULT: colors.slate[500], "dark": colors.slate[500]},
          "600": {DEFAULT: colors.slate[600], "dark": colors.slate[400]},
        }
      },
    },
  },
  darkMode: 'media',
  variants: {
    extend: {
      backgroundColor: ['dark'],
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
