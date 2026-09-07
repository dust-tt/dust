import { useCellContext } from "@app/lib/auth/CellContext";
import { useUser } from "@app/lib/swr/user";
import type { CellInfo } from "@app/types/cell";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Novu } from "@novu/js";
import { useEffect, useMemo, useState } from "react";

const getNovuEnvForCell = ({
  cell,
}: {
  cell: CellInfo | undefined;
}): {
  applicationIdentifier: string | undefined;
  apiUrl: string | undefined;
  socketUrl: string | undefined;
} => {
  let applicationIdentifier: string | undefined;
  let apiUrl: string | undefined;
  let socketUrl: string | undefined;

  if (cell) {
    switch (cell.name) {
      case "cell-00000":
        applicationIdentifier =
          process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER_CELL_00000;
        break;
      case "cell-00001":
        applicationIdentifier =
          process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER_CELL_00001;
        break;
      case "cell-00002":
        applicationIdentifier =
          process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER_CELL_00002;
        break;
      default:
        assertNeverAndIgnore(cell.name);
        break;
    }

    switch (cell.region) {
      case "us-central1":
        apiUrl = process.env.NEXT_PUBLIC_NOVU_API_URL_US;
        socketUrl = process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL_US;
        break;
      case "europe-west1":
        apiUrl = process.env.NEXT_PUBLIC_NOVU_API_URL_EU;
        socketUrl = process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL_EU;
        break;
      default:
        assertNeverAndIgnore(cell.region);
        break;
    }
  }

  return {
    applicationIdentifier,
    apiUrl,
    socketUrl,
  };
};

export const useNovuClient = () => {
  const { user } = useUser();
  const cellContext = useCellContext();
  const [novuClient, setNovuClient] = useState<Novu | null>(null);

  const novuConfig = useMemo(() => {
    return getNovuEnvForCell({
      cell: cellContext?.cellInfo,
    });
  }, [cellContext?.cellInfo]);

  useEffect(() => {
    if (user?.subscriberHash && user?.sId) {
      if (!novuConfig.applicationIdentifier) {
        throw new Error(
          "NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER for cell is not set"
        );
      }
      if (!novuConfig.apiUrl) {
        throw new Error("NEXT_PUBLIC_NOVU_API_URL for cell is not set");
      }
      if (!novuConfig.socketUrl) {
        throw new Error(
          "NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL for cell is not set"
        );
      }

      const config = {
        applicationIdentifier: novuConfig.applicationIdentifier,
        apiUrl: novuConfig.apiUrl,
        socketUrl: novuConfig.socketUrl,
        subscriber: user.sId,
        subscriberHash: user.subscriberHash,
      };

      setNovuClient(new Novu(config));
    }
  }, [
    novuConfig.apiUrl,
    novuConfig.applicationIdentifier,
    novuConfig.socketUrl,
    user?.subscriberHash,
    user?.sId,
  ]);

  return { novuClient };
};
