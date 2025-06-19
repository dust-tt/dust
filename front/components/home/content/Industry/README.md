# Industry Page Configuration System

This directory contains a configurable system for creating industry-specific landing pages that follow the same layout as the B2B SaaS page. The system allows you to easily create new industry pages by simply defining a configuration object instead of duplicating code.

## Structure

```
Industry/
├── README.md                 # This documentation
├── IndustryTemplate.tsx      # Reusable template component
└── configs/
    ├── utils.tsx            # Type definitions for configs
    ├── b2bSaasConfig.tsx    # B2B SaaS industry config
    └── financeConfig.tsx    # Example Finance industry config
```

## How to Create a New Industry Page

### 1. Create a New Config File

Create a new config file in `configs/` (e.g., `healthcareConfig.tsx`):

```tsx
import { HeartIcon } from "@dust-tt/sparkle";
import type { IndustryPageConfig } from "./utils";

export const healthcareConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Healthcare",
      color: "green",
      icon: HeartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Healthcare
      </>
    ),
    description: "Your industry-specific description here...",
    ctaButtons: {
      primary: { label: "Get started", href: "/home/pricing" },
      secondary: { label: "Talk to sales", href: "/home/contact" },
    },
    testimonialCard: {
      quote: "Your customer testimonial...",
      author: { name: "Dr. Jane Smith", title: "CTO at HealthTech" },
      company: { logo: "/path/to/logo.png", alt: "Company logo" },
      bgColor: "bg-green-600",
      textColor: "text-white",
    },
    // ... other hero config
  },
  // ... other section configs
};
```

### 2. Create the Page Component

Create a new page file (e.g., `pages/home/industry/healthcare.tsx`):

```tsx
import type { ReactElement } from "react";
import { healthcareConfig } from "@app/components/home/content/Industry/configs/healthcareConfig";
import IndustryTemplate from "@app/components/home/content/Industry/IndustryTemplate";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

export default function Healthcare() {
  return <IndustryTemplate config={healthcareConfig} />;
}

Healthcare.getLayout = (page: ReactElement, pageProps: LandingLayoutProps) => {
  return IndustryTemplate.getLayout!(page, pageProps);
};
```

That's it! Your new industry page is ready.

## Configuration Options

The `IndustryPageConfig` interface defines all the configurable sections:

### Hero Section

- **chip**: Industry label with color and icon
- **title**: Main heading (supports JSX for line breaks)
- **description**: Subtitle text
- **ctaButtons**: Primary and secondary call-to-action buttons
- **testimonialCard**: Customer quote with author info and company logo
- **decorativeShapes**: Optional background decorative elements

### AI Agents Section

- **title**: Section heading
- **description**: Section description
- **bgColor**: Background color (optional)

### Trusted By Section

- **title**: Section title
- **logoSet**: Which set of logos to display (defined in TrustedBy component)

### Pain Points Section

- **title**: Section heading
- **painPoints**: Array of pain point objects with icon, title, and description

### Dust in Action Section

- **title**: Section heading
- **useCases**: Array of use case blocks with features

### Impact Metrics Section

- **bgColor**: Background color
- **metrics**: Array of metric objects with value, unit, type, and description

### Demo Video Section

- **sectionTitle**: Video section title
- **videoUrl**: Wistia embed URL
- **showCaptions**: Whether to show captions (optional)

### Testimonial Section

- **quote**: Customer testimonial
- **author**: Author name and title
- **company**: Company logo and alt text
- **bgColor**: Background color
- **textColor**: Text color

### Customer Stories Section

- **title**: Section title
- **stories**: Array of customer story objects

### Just Use Dust Section

- **title**: CTA section title
- **titleColor**: Title color
- **ctaButtons**: Primary and secondary buttons
- **bgColor**: Background color
- **decorativeShapes**: Whether to show decorative shapes

## Available Chip Colors

The chip component supports these colors:

- `primary`
- `success`
- `warning`
- `info`
- `highlight`
- `green`
- `blue`
- `rose`
- `golden`

## Tips

1. **Icons**: Use icons from `@dust-tt/sparkle`. Check the available icons in the sparkle package.

2. **Colors**: Follow the existing color scheme. Use Tailwind classes like `bg-blue-600`, `text-white`, etc.

3. **Images**: Place industry-specific images in `/static/landing/industry/features/` and reference them in the config.

4. **Logo Sets**: You can create new logo sets in the TrustedBy component or use existing ones like `default`, `b2bSaas`, `landing`.

5. **Consistency**: Keep the same structure and naming conventions for easy maintenance.

## Benefits

- **DRY Principle**: No code duplication between industry pages
- **Consistency**: All pages follow the same layout and structure
- **Easy Maintenance**: Update the template once, affect all industry pages
- **Quick Creation**: New industry pages can be created in minutes
- **Type Safety**: Full TypeScript support with comprehensive types

## Example

See `b2bSaasConfig.tsx` for a complete example of how to configure an industry page, and `financeConfig.tsx` for another example showing different content and styling.
