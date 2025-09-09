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

const spacing = [
  'sm:p-0', 'sm:p-1', 'sm:p-2', 'sm:p-3', 'sm:p-4', 'sm:p-5', 'sm:p-6', 'sm:p-8', 'sm:p-10', 'sm:p-12', 'sm:p-16', 'sm:p-20', 'sm:p-24', 'sm:p-32',
  'md:p-0', 'md:p-1', 'md:p-2', 'md:p-3', 'md:p-4', 'md:p-5', 'md:p-6', 'md:p-8', 'md:p-10', 'md:p-12', 'md:p-16', 'md:p-20', 'md:p-24', 'md:p-32',
  'lg:p-0', 'lg:p-1', 'lg:p-2', 'lg:p-3', 'lg:p-4', 'lg:p-5', 'lg:p-6', 'lg:p-8', 'lg:p-10', 'lg:p-12', 'lg:p-16', 'lg:p-20', 'lg:p-24', 'lg:p-32',
  'xl:p-0', 'xl:p-1', 'xl:p-2', 'xl:p-3', 'xl:p-4', 'xl:p-5', 'xl:p-6', 'xl:p-8', 'xl:p-10', 'xl:p-12', 'xl:p-16', 'xl:p-20', 'xl:p-24', 'xl:p-32',
  '2xl:p-0', '2xl:p-1', '2xl:p-2', '2xl:p-3', '2xl:p-4', '2xl:p-5', '2xl:p-6', '2xl:p-8', '2xl:p-10', '2xl:p-12', '2xl:p-16', '2xl:p-20', '2xl:p-24', '2xl:p-32',
  'sm:m-0', 'sm:m-1', 'sm:m-2', 'sm:m-3', 'sm:m-4', 'sm:m-5', 'sm:m-6', 'sm:m-8', 'sm:m-10', 'sm:m-12', 'sm:m-16', 'sm:m-20', 'sm:m-24', 'sm:m-32',
  'md:m-0', 'md:m-1', 'md:m-2', 'md:m-3', 'md:m-4', 'md:m-5', 'md:m-6', 'md:m-8', 'md:m-10', 'md:m-12', 'md:m-16', 'md:m-20', 'md:m-24', 'md:m-32',
  'lg:m-0', 'lg:m-1', 'lg:m-2', 'lg:m-3', 'lg:m-4', 'lg:m-5', 'lg:m-6', 'lg:m-8', 'lg:m-10', 'lg:m-12', 'lg:m-16', 'lg:m-20', 'lg:m-24', 'lg:m-32',
  'xl:m-0', 'xl:m-1', 'xl:m-2', 'xl:m-3', 'xl:m-4', 'xl:m-5', 'xl:m-6', 'xl:m-8', 'xl:m-10', 'xl:m-12', 'xl:m-16', 'xl:m-20', 'xl:m-24', 'xl:m-32',
  '2xl:m-0', '2xl:m-1', '2xl:m-2', '2xl:m-3', '2xl:m-4', '2xl:m-5', '2xl:m-6', '2xl:m-8', '2xl:m-10', '2xl:m-12', '2xl:m-16', '2xl:m-20', '2xl:m-24', '2xl:m-32',
  'sm:gap-0', 'sm:gap-1', 'sm:gap-2', 'sm:gap-3', 'sm:gap-4', 'sm:gap-5', 'sm:gap-6', 'sm:gap-8', 'sm:gap-10', 'sm:gap-12', 'sm:gap-16', 'sm:gap-20', 'sm:gap-24', 'sm:gap-32',
  'md:gap-0', 'md:gap-1', 'md:gap-2', 'md:gap-3', 'md:gap-4', 'md:gap-5', 'md:gap-6', 'md:gap-8', 'md:gap-10', 'md:gap-12', 'md:gap-16', 'md:gap-20', 'md:gap-24', 'md:gap-32',
  'lg:gap-0', 'lg:gap-1', 'lg:gap-2', 'lg:gap-3', 'lg:gap-4', 'lg:gap-5', 'lg:gap-6', 'lg:gap-8', 'lg:gap-10', 'lg:gap-12', 'lg:gap-16', 'lg:gap-20', 'lg:gap-24', 'lg:gap-32',
  'xl:gap-0', 'xl:gap-1', 'xl:gap-2', 'xl:gap-3', 'xl:gap-4', 'xl:gap-5', 'xl:gap-6', 'xl:gap-8', 'xl:gap-10', 'xl:gap-12', 'xl:gap-16', 'xl:gap-20', 'xl:gap-24', 'xl:gap-32',
  '2xl:gap-0', '2xl:gap-1', '2xl:gap-2', '2xl:gap-3', '2xl:gap-4', '2xl:gap-5', '2xl:gap-6', '2xl:gap-8', '2xl:gap-10', '2xl:gap-12', '2xl:gap-16', '2xl:gap-20', '2xl:gap-24', '2xl:gap-32',
];

const flexbox = [
  'sm:flex-row', 'sm:flex-col', 'sm:flex-wrap', 'sm:flex-nowrap',
  'sm:justify-start', 'sm:justify-end', 'sm:justify-center', 'sm:justify-between', 'sm:justify-around', 'sm:justify-evenly',
  'sm:items-start', 'sm:items-end', 'sm:items-center', 'sm:items-baseline', 'sm:items-stretch',
  'md:flex-row', 'md:flex-col', 'md:flex-wrap', 'md:flex-nowrap',
  'md:justify-start', 'md:justify-end', 'md:justify-center', 'md:justify-between', 'md:justify-around', 'md:justify-evenly',
  'md:items-start', 'md:items-end', 'md:items-center', 'md:items-baseline', 'md:items-stretch',
  'lg:flex-row', 'lg:flex-col', 'lg:flex-wrap', 'lg:flex-nowrap',
  'lg:justify-start', 'lg:justify-end', 'lg:justify-center', 'lg:justify-between', 'lg:justify-around', 'lg:justify-evenly',
  'lg:items-start', 'lg:items-end', 'lg:items-center', 'lg:items-baseline', 'lg:items-stretch',
  'xl:flex-row', 'xl:flex-col', 'xl:flex-wrap', 'xl:flex-nowrap',
  'xl:justify-start', 'xl:justify-end', 'xl:justify-center', 'xl:justify-between', 'xl:justify-around', 'xl:justify-evenly',
  'xl:items-start', 'xl:items-end', 'xl:items-center', 'xl:items-baseline', 'xl:items-stretch',
  '2xl:flex-row', '2xl:flex-col', '2xl:flex-wrap', '2xl:flex-nowrap',
  '2xl:justify-start', '2xl:justify-end', '2xl:justify-center', '2xl:justify-between', '2xl:justify-around', '2xl:justify-evenly',
  '2xl:items-start', '2xl:items-end', '2xl:items-center', '2xl:items-baseline', '2xl:items-stretch',
];

const typography = [
  'sm:text-xs', 'sm:text-sm', 'sm:text-base', 'sm:text-lg', 'sm:text-xl', 'sm:text-2xl', 'sm:text-3xl', 'sm:text-4xl', 'sm:text-5xl', 'sm:text-6xl',
  'md:text-xs', 'md:text-sm', 'md:text-base', 'md:text-lg', 'md:text-xl', 'md:text-2xl', 'md:text-3xl', 'md:text-4xl', 'md:text-5xl', 'md:text-6xl',
  'lg:text-xs', 'lg:text-sm', 'lg:text-base', 'lg:text-lg', 'lg:text-xl', 'lg:text-2xl', 'lg:text-3xl', 'lg:text-4xl', 'lg:text-5xl', 'lg:text-6xl',
  'xl:text-xs', 'xl:text-sm', 'xl:text-base', 'xl:text-lg', 'xl:text-xl', 'xl:text-2xl', 'xl:text-3xl', 'xl:text-4xl', 'xl:text-5xl', 'xl:text-6xl',
  '2xl:text-xs', '2xl:text-sm', '2xl:text-base', '2xl:text-lg', '2xl:text-xl', '2xl:text-2xl', '2xl:text-3xl', '2xl:text-4xl', '2xl:text-5xl', '2xl:text-6xl',
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
    {
     pattern: /^(sm:|md:|lg:|xl:|2xl:)./
    },
    ...gridCols,
    ...colSpans,
    ...display,
    ...spacing,
    ...flexbox,
    ...typography,

  ],
};
export default config;
