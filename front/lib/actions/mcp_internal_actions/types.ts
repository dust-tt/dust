import { z } from "zod";

export const SearchInputSchema = z.object({
  query: z
    .string()
    .describe(
      "The string used to retrieve relevant chunks of information using semantic similarity" +
        " based on the user request and conversation context." +
        " Include as much semantic signal based on the entire conversation history," +
        " paraphrasing if necessary. longer queries are generally better."
    ),
  relativeTimeFrame: z
    .string()
    .regex(/^(all|\d+[hdwmy])$/)
    .describe(
      "The time frame (relative to LOCAL_TIME) to restrict the search based" +
        " on the user request and past conversation context." +
        " Possible values are: `all`, `{k}h`, `{k}d`, `{k}w`, `{k}m`, `{k}y`" +
        " where {k} is a number. Be strict, do not invent invalid values."
    ),
});

export type SearchInputType = z.infer<typeof SearchInputSchema>;

export function isSearchInputType(input: unknown): input is SearchInputType {
  return SearchInputSchema.safeParse(input).success;
}

export const TagsInputSchema = z.object({
  tagsIn: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to restrict the search based on the user request and past conversation context." +
        "If multiple labels are provided, the search will return documents that have at least one of the labels." +
        "You can't check that all labels are present, only that at least one is present." +
        "If no labels are provided, the search will return all documents regardless of their labels."
    ),
  tagsNot: z
    .array(z.string())
    .describe(
      "A list of labels (also called tags) to exclude from the search based on the user request and past conversation context." +
        "Any document having one of these labels will be excluded from the search."
    ),
});
