import type {
  DataSourceViewCategory,
  DataSourceViewType,
  SpaceType,
} from "@dust-tt/types";
import React from "react";

import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { CATEGORY_DETAILS } from "@app/lib/spaces";

interface SearchLocationProps {
  category: DataSourceViewCategory | undefined;
  dataSourceViews: DataSourceViewType[];
  space: SpaceType;
}

export function SearchLocation({
  category,
  dataSourceViews,
  space,
}: SearchLocationProps) {
  const searchingIn = React.useMemo(() => {
    if (dataSourceViews.length === 1) {
      return `${space.name} / ${getDataSourceNameFromView(dataSourceViews[0])}`;
    }

    if (dataSourceViews.length > 1 && category) {
      return `${space.name} › ${CATEGORY_DETAILS[category].label}`;
    }

    return `${space.name}`;
  }, [space.name, dataSourceViews, category]);

  return (
    <p className="my-0.5 flex h-8 items-center gap-1">
      Searching in <span className="font-bold">"{searchingIn}"</span>
    </p>
  );
}
