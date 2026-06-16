import config from "@app/lib/api/config";
import type {
  ConversationDraft,
  ConversationDraftAttachment,
  ConversationDraftSkeleton,
} from "@app/lib/contentful/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { Asset, ContentfulClientApi, Entry } from "contentful";
import { createClient } from "contentful";
import { z } from "zod";

let client: ContentfulClientApi<undefined> | null = null;

function getClient() {
  if (!client) {
    const spaceId = config.getContentfulSpaceId();
    const accessToken = config.getContentfulAccessToken();

    if (!spaceId || !accessToken) {
      throw new Error(
        "Contentful credentials not configured. " +
          "Set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN environment variables."
      );
    }

    client = createClient({
      space: spaceId,
      accessToken,
      environment: config.getContentfulEnvironment(),
    });
  }
  return client.withoutUnresolvableLinks;
}

function isContentfulAsset(value: unknown): value is Asset {
  return (
    typeof value === "object" &&
    value !== null &&
    "sys" in value &&
    "fields" in value &&
    value.fields !== undefined
  );
}

const ConversationDraftFieldsSchema = z.object({
  slug: z.string(),
  title: z.string(),
  prompt: z.string().min(1),
  attachments: z
    .array(z.custom<Asset>((value): value is Asset => isContentfulAsset(value)))
    .optional(),
});

function contentfulAssetToAttachment(
  asset: Asset
): ConversationDraftAttachment | null {
  const file = asset.fields?.file;
  if (!file || !isString(file.url)) {
    return null;
  }

  const url = file.url.startsWith("//")
    ? `https:${file.url}`
    : file.url.startsWith("http")
      ? file.url
      : `https:${file.url}`;

  const fileName =
    (isString(asset.fields.title) ? asset.fields.title : null) ||
    (isString(file.fileName) ? file.fileName : null) ||
    new URL(url).pathname.split("/").pop() ||
    "attachment";

  const contentType = isString(file.contentType) ? file.contentType : null;

  return { url, fileName, contentType };
}

function contentfulEntryToConversationDraft(
  entry: Entry<ConversationDraftSkeleton>
): ConversationDraft | null {
  const result = ConversationDraftFieldsSchema.safeParse(entry.fields);
  if (!result.success) {
    return null;
  }

  const parsed = result.data;

  const attachments = (parsed.attachments ?? [])
    .map(contentfulAssetToAttachment)
    .filter(
      (attachment): attachment is ConversationDraftAttachment =>
        attachment !== null
    );

  return {
    slug: parsed.slug,
    title: parsed.title,
    prompt: parsed.prompt.trim(),
    attachments,
  };
}

export async function getConversationDraftBySlug(
  slug: string
): Promise<Result<ConversationDraft | null, Error>> {
  try {
    const contentfulClient = getClient();
    const queryParams: Record<string, string | number> = {
      content_type: "conversationDraft",
      "fields.slug": slug,
      limit: 1,
      include: 1,
    };
    const response =
      await contentfulClient.getEntries<ConversationDraftSkeleton>(queryParams);

    if (response.items.length === 0) {
      return new Ok(null);
    }

    return new Ok(contentfulEntryToConversationDraft(response.items[0]));
  } catch (error) {
    logger.error(
      { error, slug },
      "[Contentful] Failed to get conversation draft by slug"
    );
    return new Err(normalizeError(error));
  }
}

export function isHttpsUrl(url: string): boolean {
  if (!isString(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}
