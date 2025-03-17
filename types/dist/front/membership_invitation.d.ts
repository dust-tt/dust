import * as t from "io-ts";
import { ModelId } from "../shared/model_id";
import { ActiveRoleType } from "./user";
export type MembershipInvitationType = {
    sId: string;
    id: ModelId;
    status: "pending" | "consumed" | "revoked";
    inviteEmail: string;
    inviteLink: string;
    initialRole: ActiveRoleType;
    createdAt: number;
};
export declare const InviteMemberFormSchema: t.TypeC<{
    email: import("io-ts-types").NonEmptyStringC;
    role: t.KeyofC<{
        admin: null;
        builder: null;
        user: null;
    }>;
}>;
export type InviteMemberFormType = t.TypeOf<typeof InviteMemberFormSchema>;
//# sourceMappingURL=membership_invitation.d.ts.map