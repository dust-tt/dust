import StatsD from "hot-shots";

export const statsDClient = new StatsD({
  globalTags: process.env.DD_ENTITY_ID
    ? { "dd.internal.entity_tag": process.env.DD_ENTITY_ID }
    : {},
});
