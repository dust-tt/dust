import { Pagination } from "@app/components/shared/Pagination";

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
  rowCount: number;
  pageSize: number;
  tag?: string | null;
}

function buildBlogPageUrl(page: number, tag?: string | null): string {
  if (tag) {
    // Tag filtering stays on index page (client-side filtering)
    const params = new URLSearchParams();
    params.set("tag", tag);
    if (page > 1) {
      params.set("page", page.toString());
    }
    return `/blog?${params.toString()}`;
  }
  // Unfiltered uses path-based pagination for SEO
  return page === 1 ? "/blog" : `/blog/page/${page}`;
}

export function BlogPagination({
  tag,
  ...paginationProps
}: BlogPaginationProps) {
  return (
    <Pagination
      {...paginationProps}
      buildPageUrl={(page) => buildBlogPageUrl(page, tag)}
    />
  );
}
