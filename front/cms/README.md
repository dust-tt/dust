# CMS Module

This directory contains all Prismic CMS-related code for the blog functionality.

## Structure

```
cms/
├── lib/              # Core CMS utilities and wrappers
│   ├── prismicio.ts  # Prismic client configuration
│   ├── blog.ts       # Blog-specific data fetching functions
│   └── prismicio-types.d.ts  # Auto-generated Prismic types
├── slices/           # Prismic slice components
│   ├── CallToAction/
│   ├── CardGrid/
│   ├── FeaturedArticleHero/
│   ├── FeaturedCardList/
│   ├── RichText/
│   └── index.ts      # Slice components export
├── customtypes/      # Prismic custom type definitions
│   └── blog_post/
├── components/       # Reusable CMS UI components
├── api/              # CMS-related API utilities
└── index.ts          # Central export file
```

## Key Files

- `lib/prismicio.ts`: Configures the Prismic client with repository settings
- `lib/blog.ts`: Provides abstraction layer for blog data fetching (follows CODING_RULES pattern)
- `slices/`: Contains all slice components used in blog posts

## Usage

All CMS functionality is accessed through the central export:

```typescript
import { getBlogPosts, getBlogPost, components } from "@app/cms";
```

## Configuration

The Prismic repository name is configured in `slicemachine.config.json`:
- Repository: `dust-blog`

## Routes

Blog routes are configured under `/blog`:
- `/blog` - Blog listing page
- `/blog/[uid]` - Individual blog post pages

## Prismic Dashboard

Access the Prismic dashboard at: https://dust-blog.prismic.io/

## Development

To run Slice Machine locally:
```bash
cd front && npm run slicemachine
```

This opens the Slice Machine UI for editing slices and custom types.