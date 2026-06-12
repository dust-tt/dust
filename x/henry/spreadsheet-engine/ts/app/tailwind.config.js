/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Mirrors front's tweaks so shared class names render the same.
      fontWeight: {
        medium: "450",
        semibold: "550",
      },
    },
  },
  plugins: [],
};
