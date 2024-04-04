import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import type { OAuth2Client } from "googleapis-common";

import { getConnectionFromNango } from "../utils/helpers";
import type { NangoConnectionResponse } from "../utils/types";

// SOLUTIONS CAN BE REMOVED AT ANY TIME, SO DEFINING TYPES DIRECTLY IN THE FILE TO AVOID IMPORTING FROM FRONT};
