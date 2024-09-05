import type { Meta } from "@storybook/react";
import React from "react";

import { Pagination } from "../index_with_tw_base";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
} satisfies Meta<typeof Pagination>;

export default meta;

export const PaginationSM = () => {
  return <Pagination rowCount={960} pageSize={50} />;
};

export const PaginationXS = () => {
  return (
    <Pagination rowCount={960} pageSize={50} size="xs" showDetails={false} />
  );
};

export const PaginationNoPageButtons = () => {
  return (
    <Pagination
      rowCount={960}
      pageSize={50}
      size="xs"
      showDetails={false}
      showPageButtons={false}
    />
  );
};
