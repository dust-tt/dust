import type { LoaderContext } from "webpack";

import { compileMergedCatalog } from "../../front/scripts/i18n/merged_catalog";

export default function linguiCatalogLoader(this: LoaderContext<unknown>) {
  const callback = this.async();
  compileMergedCatalog(this.resourcePath).then(({ source, dependencies }) => {
    dependencies.forEach((file) => this.addDependency(file));
    callback(null, source);
  }, callback);
}
