import type { Config } from "tailwindcss";

// Since we don't build css files from generated files, we need to include all the possible classnames.
// Default tailwind classes don't contain classes with responsive prefix, we need to add them manually.
const gridCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap(i => [
  `sm:grid-cols-${i}`,
  `md:grid-cols-${i}`,
  `lg:grid-cols-${i}`,
  `xl:grid-cols-${i}`,
  `2xl:grid-cols-${i}`,
]);

const colSpans = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 'full'].flatMap(i => [
  `sm:col-span-${i}`,
  `md:col-span-${i}`,
  `lg:col-span-${i}`,
  `xl:col-span-${i}`,
  `2xl:col-span-${i}`,
]);

const rowSpans = [1, 2, 3, 4, 5, 6, 'full'].flatMap(i => [
  `sm:row-span-${i}`,
  `md:row-span-${i}`,
  `lg:row-span-${i}`,
  `xl:row-span-${i}`,
  `2xl:row-span-${i}`,
]);

const display = [
  'sm:flex', 'sm:block', 'sm:inline', 'sm:inline-block', 'sm:grid', 'sm:hidden',
  'md:flex', 'md:block', 'md:inline', 'md:inline-block', 'md:grid', 'md:hidden', 
  'lg:flex', 'lg:block', 'lg:inline', 'lg:inline-block', 'lg:grid', 'lg:hidden',
  'xl:flex', 'xl:block', 'xl:inline', 'xl:inline-block', 'xl:grid', 'xl:hidden',
  '2xl:flex', '2xl:block', '2xl:inline', '2xl:inline-block', '2xl:grid', '2xl:hidden',
];

const sizing = [
  'sm:w-full', 'sm:w-auto', 'sm:w-screen', 'sm:h-full', 'sm:h-auto', 'sm:h-screen',
  'md:w-full', 'md:w-auto', 'md:w-screen', 'md:h-full', 'md:h-auto', 'md:h-screen',
  'lg:w-full', 'lg:w-auto', 'lg:w-screen', 'lg:h-full', 'lg:h-auto', 'lg:h-screen',
  'xl:w-full', 'xl:w-auto', 'xl:w-screen', 'xl:h-full', 'xl:h-auto', 'xl:h-screen',
  '2xl:w-full', '2xl:w-auto', '2xl:w-screen', '2xl:h-full', '2xl:h-auto', '2xl:h-screen',
];

// Combine all classes
export const SAFELIST_CLASSES = [
  ...gridCols,
  ...colSpans,
  ...rowSpans,
  ...display,
  ...sizing,
];
const config: Config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    fontFamily: {
      sans: ["var(--font-geist)", "sans-serif"],
      mono: ["var(--font-geist-mono)", "monospace"],
    },
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      containers: {
        xxxs: "16rem",
        xxs: "24rem",
        xs: "32rem",
        sm: "40rem",
        md: "48rem",
        lg: "64rem",
        xl: "80rem",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/container-queries"),
  ],
  safelist: [
    {
      pattern: /./, // This matches all class names.
    },
    ...gridCols,
    ...colSpans,
    ...display,
  ],
};
export default config;
