import * as t from "io-ts";

import { ActiveRoleSchema } from "../../user";

export const PostInvitationSchema = t.type({
  email: t.string,
  role: ActiveRoleSchema,
});
