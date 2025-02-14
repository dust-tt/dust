import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { AppType, WorkspaceType } from "@dust-tt/types";

import { useDatasets } from "@app/lib/swr/datasets";

export default function DatasetPicker({
  owner,
  dataset,
  app,
  readOnly,
  onDatasetUpdate,
}: {
  owner: WorkspaceType;
  dataset: string;
  app: AppType;
  readOnly: boolean;
  onDatasetUpdate: (dataset: string) => void;
}) {
  const { datasets, isDatasetsLoading, isDatasetsError } = useDatasets({
    owner,
    app,
    disabled: readOnly,
  });

  // Remove the dataset if it was suppressed.
  if (
    !readOnly &&
    !isDatasetsLoading &&
    !isDatasetsError &&
    dataset &&
    datasets.filter((d) => d.name === dataset).length == 0
  ) {
    setTimeout(() => {
      onDatasetUpdate("");
    });
  }

  const createDatasetUrl = `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/new`;

  return (
    <div className="flex items-center rounded-md px-2">
      {datasets.length === 0 && !dataset && !readOnly ? (
        <Button
          href={createDatasetUrl}
          label={isDatasetsLoading ? "Loading..." : "Create dataset"}
          size="xs"
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              variant="outline"
              disabled={readOnly}
              label={dataset ? dataset : "Select dataset"}
              size="xs"
            />
          </DropdownMenuTrigger>

          {!readOnly && (
            <DropdownMenuContent>
              {datasets.map((d) => (
                <DropdownMenuItem
                  key={d.name}
                  label={d.name}
                  onClick={() => onDatasetUpdate(d.name)}
                />
              ))}

              {datasets.length > 0 && <DropdownMenuSeparator />}

              <DropdownMenuItem
                label="Create new dataset"
                href={createDatasetUrl}
              />
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      )}
    </div>
  );
}
