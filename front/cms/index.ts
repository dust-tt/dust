/**
 * Central export for all CMS-related modules.
 * This keeps all Prismic/CMS functionality isolated and modular.
 */

export { createClient } from "./lib/prismicio";
export {
  getBlogPosts,
  getBlogPost,
  getRelatedPosts,
  type BlogPostType,
  type BlogListingParams,
} from "./lib/blog";
export { components } from "./slices";