import { Pagination } from "@app/components/shared/Pagination";

interface PodcastPaginationProps {
  currentPage: number;
  totalPages: number;
  rowCount: number;
  pageSize: number;
}

function buildPodcastPageUrl(page: number): string {
  return page === 1 ? "/podcast" : `/podcast?page=${page}`;
}

export function PodcastPagination(props: PodcastPaginationProps) {
  return <Pagination {...props} buildPageUrl={buildPodcastPageUrl} />;
}
