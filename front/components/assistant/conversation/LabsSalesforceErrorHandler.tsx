import { Button, CloudArrowLeftRightIcon } from "@dust-tt/sparkle";
import { useEffect } from "react";

import {
  useCreateSalesforcePersonalConnection,
  useSalesforceDataSourcesWithPersonalConnection,
} from "@app/lib/swr/labs_salesforce";
import type { LightWorkspaceType } from "@app/types";

export function LabsSalesforceAuthenticationError({
  owner,
  retryHandler,
}: {
  owner: LightWorkspaceType;
  retryHandler: () => void;
}) {
  const { dataSources } = useSalesforceDataSourcesWithPersonalConnection({
    owner,
  });
  const dataSource = dataSources[0];
  const { createPersonalConnection } =
    useCreateSalesforcePersonalConnection(owner);

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
