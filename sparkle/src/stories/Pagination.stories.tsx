import type { Meta } from "@storybook/react";
import React from "react";

import { Pagination } from "../index_with_tw_base";

const meta = {
  title: "Components/Pagination",
  component: Pagination,
} satisfies Meta<typeof Pagination>;

export default meta;

export const PaginationSM = () => {
  return (
    <Pagination 
      itemsCount={960} 
      maxItemsPerPage={50}
      onButtonClick={() => {}}
    />
  )
}

export const PaginationXS = () => {
  return (
    <Pagination 
      itemsCount={960} 
      maxItemsPerPage={50} 
      size="xs" 
      showDetails={false}
      onButtonClick={() => {}}
    />
  )
}

export const PaginationNoPageButtons = () => {
  return (
    <Pagination 
      itemsCount={960} 
      maxItemsPerPage={50} 
      size="xs" 
      showDetails={false} 
      showPageButtons={false} 
      onButtonClick={() => {}}
    />
  )
}

