/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    fontFamily: {
      roboto: ["Roboto", "sans-serif"],
    },
    extend: {
      colors: {
        'action': colors.violet,
        'success': colors.green,
        'warning': colors.yellow,
        'danger': colors.red,
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};