import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { DataSourceType, LightWorkspaceType } from "@app/types";
import { isOAuthProvider, setupOAuthConnection } from "@app/types";
