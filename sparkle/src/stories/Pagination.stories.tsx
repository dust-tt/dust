import type { Meta } from "@storybook/react";
import React from "react";

import { Pagination } from "../index_with_tw_base";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
} satisfies Meta<typeof Pagination>;

export default meta;

export const PaginationSM = () => {
  const [pageIndex, setPageIndex] = React.useState(0);
  return (
    <Pagination
      rowCount={960}
      pageSize={50}
      pageIndex={pageIndex}
      setPageIndex={setPageIndex}
    />
  );
};

export const PaginationXS = () => {
  const [pageIndex, setPageIndex] = React.useState(0);
  return (
    <Pagination
      rowCount={960}
      pageSize={50}
      size="xs"
      showDetails={false}
      pageIndex={pageIndex}
      setPageIndex={setPageIndex}
    />
  );
};

export const PaginationNoPageButtons = () => {
  const [pageIndex, setPageIndex] = React.useState(0);
  return (
    <Pagination
      rowCount={960}
      pageSize={50}
      size="xs"
      showDetails={false}
      showPageButtons={false}
      pageIndex={pageIndex}
      setPageIndex={setPageIndex}
    />
  );
};
