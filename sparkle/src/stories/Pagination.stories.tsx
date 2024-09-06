import type { Meta } from "@storybook/react";
import React from "react";

import { usePaginationFromUrl } from "@sparkle/hooks/usePaginationFromUrl";

import { Pagination } from "../index_with_tw_base";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
} satisfies Meta<typeof Pagination>;

export default meta;
export const PaginationSM = () => {
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  });
  return (
    <Pagination
      rowCount={960}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
};

export const PaginationXS = () => {
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  });
  return (
    <Pagination
      rowCount={960}
      size="xs"
      showDetails={false}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
};

export const PaginationNoPageButtons = () => {
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 50,
  });
  return (
    <Pagination
      rowCount={960}
      size="xs"
      showDetails={false}
      showPageButtons={false}
      pagination={pagination}
      setPagination={setPagination}
    />
  );
};

export const PaginationWithUrl = () => {
  const { pagination, setPagination } = usePaginationFromUrl("example", 50);

  return (
    <>
      <div className="s-p-2">Current hash: {location.hash}</div>
      <Pagination
        rowCount={960}
        pagination={pagination}
        setPagination={setPagination}
      />
    </>
  );
};
