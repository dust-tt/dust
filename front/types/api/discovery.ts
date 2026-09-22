import { z } from "zod";

export type DiscoveryAgentType = {
  sId: string;
  name: string;
  description: string;
  pictureUrl: string;
};

export type DiscoverySkillType = {
  sId: string;
  name: string;
  description: string;
  icon: string | null;
};

type DiscoveryPinType = {
  groupId: string;
  position: number;
};

export type DiscoveryItemType =
  | {
      type: "agent";
      pin: DiscoveryPinType;
      target: DiscoveryAgentType;
    }
  | {
      type: "skill";
      pin: DiscoveryPinType;
      target: DiscoverySkillType;
    };

export const PutGroupDiscoveryPinBodySchema = z.object({
  type: z.enum(["agent", "skill"]),
  itemId: z.string().min(1),
});

export type GetFeaturedDiscoveryItemsResponseBody = {
  items: DiscoveryItemType[];
};

export type GetGroupDiscoveryPinsResponseBody = {
  items: DiscoveryItemType[];
};

export type PutGroupDiscoveryPinResponseBody = {
  item: DiscoveryItemType;
};

export type DeleteGroupDiscoveryPinResponseBody = {
  success: true;
};
