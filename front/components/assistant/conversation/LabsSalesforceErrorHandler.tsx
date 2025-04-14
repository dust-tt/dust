import { Button, CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import { useEffect } from "react";

import {
  useLabsCreateSalesforcePersonalConnection,
  useLabsSalesforceDataSourcesWithPersonalConnection,
} from "@app/lib/swr/labs";
import type { LightWorkspaceType } from "@app/types";

export function LabsSalesforceAuthenticationError({
  owner,
  retryHandler,
}: {
  owner: LightWorkspaceType;
  retryHandler: () => void;
}) {
  const { dataSources } = useLabsSalesforceDataSourcesWithPersonalConnection({
    owner,
  });
  const dataSource = dataSources[0];
  const { createPersonalConnection } =
    useLabsCreateSalesforcePersonalConnection(owner);

  useEffect(() => {
    if (dataSource && dataSource.personalConnection) {
      retryHandler();
    }
  }, [dataSource, retryHandler]);

  return (
    <div className="flex flex-col gap-9">
      {dataSource && !dataSource.personalConnection && (
        <>
          <p>Please log in to your Salesforce account to continue.</p>
          <div>
            <Button
              label={`Connect`}
              variant="outline"
              className="flex-grow"
              size="sm"
              icon={CloudArrowLeftRightIcon}
              onClick={async () => {
                await createPersonalConnection(dataSource);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
