import { Hono } from "hono";

import { lookupMembersApp } from "./lookup";
import { searchMembersApp } from "./search";

export const membersApp = new Hono();

membersApp.route("/lookup", lookupMembersApp);
membersApp.route("/search", searchMembersApp);
