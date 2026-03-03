# Porting a Replit Landing Page into Dust

This runbook covers how to take a landing page built in a Replit project (React+Vite) and port it
into the Dust front codebase as a Next.js landing page.

## Reference Files

Read these before starting to understand the patterns:

- `pages/landing/chatgpt-enterprise.tsx` — page file example
- `components/home/content/ChatGptEnterprise/` — component structure example
- `components/home/content/ChatGptEnterprise/config/chatGptEnterpriseConfig.tsx` — config pattern
- `components/home/content/Competitive/` — shared competitive components
- `components/home/LandingLayout.tsx` — layout wrapper (handles nav, cookies, GTM)
- `components/home/ContentComponents.tsx` — H2, P, A, Grid, FullWidthSection
- `components/home/content/Landing/LandingEmailSignup.tsx` — email CTA component

## Step-by-Step

### 1. Read the Replit Source

- `client/src/pages/landing.tsx` — the design to port
- `client/src/index.css` — custom animations/styles
- `ls attached_assets/` — available images

### 2. Copy Images

Copy needed images from the Replit project to `public/static/landing/<page-name>/`.

- Rename files descriptively (e.g. `everett.png` not `image_1768441613947.png`)
- Reuse existing company logos from `public/static/landing/logos/gray/` when available
  (vanta.svg, clay.svg, assembled.svg, persona.svg, whatnot.svg, etc.)

### 3. Create Config File

Create `components/home/content/<PageName>/config/<pageName>Config.tsx`:

- Extract ALL text content, testimonials, feature lists, etc. into a typed config object
- Image paths reference `/static/landing/<page-name>/...` or `/static/landing/logos/gray/...`
- Use `ReactNode` type for headlines with JSX (gradient text, line breaks)
- Export both the config object and its TypeScript interface

### 4. Create Components

Create `components/home/content/<PageName>/` with **one file per section**.

Key conversions from Replit (Vite) to Dust (Next.js):

| Replit (Vite)                    | Dust (Next.js)                                                |
|----------------------------------|---------------------------------------------------------------|
| `import img from "@assets/..."` | `<Image src="/static/landing/..." unoptimized />`             |
| `<img src={img} />`             | `<Image src="..." width={W} height={H} unoptimized />`       |
| `<Button>` (shadcn)             | `<Button variant="highlight" label="..." onClick={...} />`   |
| `className={\`...\`}`           | `className={cn("...", cond && "...")}`                        |
| `<h2>`                          | `<H2>` from ContentComponents                                |
| `<p>`                           | `<P size="md">` from ContentComponents                       |
| `onClick={() => navigate()}`    | `onClick={withTracking(AREA, "id", () => { ... })}`          |
| Full-width section bg           | `className="relative left-1/2 -ml-[50vw] w-screen"`         |

Rules:

- Use `next/image` with `unoptimized` prop instead of `<img>` tags
- Use Sparkle `Button` (variant `"highlight"` / `"outline"`) instead of shadcn Button
- Use `cn()` from `@dust-tt/sparkle` for conditional classNames
- Use `withTracking(TRACKING_AREAS.COMPETITIVE, "tracking_id", callback)` on all CTAs
- Use `appendUTMParams()` from `@app/lib/utils/utm` for external links
- `framer-motion` is available — fine to use for animations
- `lucide-react` icons are available
- Add `// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file` at top if using
  `next/image` or `next/router`
- Each component should define a `Props` interface (per CODING_RULES [REACT1])

### 5. Create Page File

Create `pages/landing/<page-name>.tsx` following this template:

```tsx
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import type { ReactElement } from "react";

export async function getStaticProps() {
  return {
    props: {
      shape: 0,
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
      hideNavigation: true,
    },
  };
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function MyLandingPage() {
  return (
    <>
      <PageMetadata
        title="Page Title | Dust"
        description="Page description for SEO."
        pathname="/landing/my-page"
      />

      {/* Render sections here, passing config props */}
    </>
  );
}

MyLandingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
```

### 6. Verify

```bash
# Type check
npx tsgo --noEmit

# If you see phantom errors about missing files, clear the cache:
rm -rf .next

# Start dev server and verify
./admin/dev.sh
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/landing/<page-name>
# Should return 200
```

## Common Pitfalls

- **Stale `.next` cache**: If you see errors about missing files that don't exist in source,
  `rm -rf .next` and restart the dev server
- **Unused imports**: Clean up imports that were in the Replit code but aren't needed after
  conversion (e.g. shadcn components replaced by Sparkle)
- **Full-width sections**: The `LandingLayout` wraps children in a `container` class. Use
  `relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen` to break out for full-bleed
  backgrounds
- **Image sizing**: `next/image` requires `width` and `height` props. Use `unoptimized` for
  external or non-optimized images
