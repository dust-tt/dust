import { CATEGORY_LABELS } from "@app/components/spaces/spaceCategoryLabels";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { SpaceType } from "@app/types/space";
import { Trans, useLingui } from "@lingui/react/macro";
import React from "react";

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
  const { t } = useLingui();
  const searchingIn = React.useMemo(() => {
    if (dataSourceViews.length === 1) {
      return `${space.name} / ${getDataSourceNameFromView(dataSourceViews[0])}`;
    }

    if (dataSourceViews.length > 1 && category) {
      return `${space.name} › ${t(CATEGORY_LABELS[category])}`;
    }

    return `${space.name}`;
  }, [space.name, dataSourceViews, category, t]);

  return (
    <p className="my-0.5 flex h-8 items-center gap-1">
      <Trans>
        Searching in <span className="font-bold">"{searchingIn}"</span>
      </Trans>
    </p>
  );
}
