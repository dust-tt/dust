import config from "@app/lib/api/config";
import type {
  PodcastChannelMetadata,
  PodcastEpisode,
  PodcastEpisodeSummary,
} from "@app/lib/podcast/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { XMLParser } from "fast-xml-parser";

// ISR revalidation time for podcast content (15 minutes).
export const PODCAST_REVALIDATE_SECONDS = 15 * 60;

interface RssItem {
  title?: string;
  description?: string;
  link?: string;
  pubDate?: string;
  enclosure?: { "@_url"?: string; "@_type"?: string };
  "itunes:duration"?: string | number;
  "itunes:episode"?: string | number;
  "itunes:image"?: { "@_href"?: string };
  "content:encoded"?: string;
  guid?: string | { "#text"?: string };
}

interface RssChannel {
  title?: string;
  description?: string;
  link?: string;
  "itunes:image"?: { "@_href"?: string };
  image?: { url?: string };
  item?: RssItem | RssItem[];
}

/**
 * Parses itunes:duration which can be HH:MM:SS, MM:SS, or raw seconds.
 */
function parseDurationSeconds(
  duration: string | number | undefined
): number | null {
  if (duration === undefined || duration === null) {
    return null;
  }

  if (typeof duration === "number") {
    return duration;
  }

  const trimmed = duration.trim();

  // Raw seconds (no colons).
  if (!trimmed.includes(":")) {
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) ? null : parsed;
  }

  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) {
    return null;
  }

  switch (parts.length) {
    case 2:
      return parts[0] * 60 + parts[1];
    case 3:
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    default:
      return null;
  }
}

/**
 * Extracts the Transistor ID from a Transistor share link.
 * Example: "https://share.transistor.fm/s/my-episode" → "my-episode"
 */
function extractTransistorId(link: string): string {
  try {
    const url = new URL(link);
    const segments = url.pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  } catch {
    // Fallback: extract last path segment.
    const segments = link.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEpisodeNumber(
  value: string | number | undefined
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const num = typeof value === "number" ? value : parseInt(String(value), 10);
  return isNaN(num) ? null : num;
}

function rssItemToEpisode(item: RssItem): PodcastEpisode | null {
  const title = isString(item.title) ? item.title : "";
  const link = isString(item.link) ? item.link : "";
  const audioUrl = item.enclosure?.["@_url"] ?? "";

  if (!title || !link) {
    return null;
  }

  const descriptionHtml = isString(item["content:encoded"])
    ? item["content:encoded"]
    : isString(item.description)
      ? item.description
      : "";

  const description = stripHtml(descriptionHtml);

  const publishedAt = isString(item.pubDate)
    ? new Date(item.pubDate).toISOString()
    : new Date().toISOString();

  const imageUrl = item["itunes:image"]?.["@_href"] ?? null;
  const transistorId = extractTransistorId(link);

  return {
    slug: transistorId,
    title,
    description,
    descriptionHtml,
    publishedAt,
    durationSeconds: parseDurationSeconds(item["itunes:duration"]),
    episodeNumber: parseEpisodeNumber(item["itunes:episode"]),
    imageUrl,
    audioUrl,
    transistorId,
    link,
  };
}

function episodeToSummary(episode: PodcastEpisode): PodcastEpisodeSummary {
  return {
    slug: episode.slug,
    title: episode.title,
    description: episode.description,
    publishedAt: episode.publishedAt,
    durationSeconds: episode.durationSeconds,
    episodeNumber: episode.episodeNumber,
    imageUrl: episode.imageUrl,
  };
}

async function fetchAndParseRss(): Promise<
  Result<{ channel: RssChannel }, Error>
> {
  const feedUrl = config.getPodcastRssFeedUrl();
  if (!feedUrl) {
    return new Err(
      new Error(
        "PODCAST_RSS_FEED_URL is not configured. Set the environment variable to enable the podcast page."
      )
    );
  }

  try {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      return new Err(
        new Error(`Failed to fetch podcast RSS feed: ${response.status}`)
      );
    }

    const xml = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel as RssChannel | undefined;
    if (!channel) {
      return new Err(new Error("Invalid RSS feed: no channel found"));
    }

    return new Ok({ channel });
  } catch (error) {
    logger.error({ error }, "[Podcast] Failed to fetch/parse RSS feed");
    return new Err(normalizeError(error));
  }
}

function extractChannelMetadata(channel: RssChannel): PodcastChannelMetadata {
  return {
    title: isString(channel.title) ? channel.title : "Podcast",
    description: isString(channel.description) ? channel.description : "",
    imageUrl:
      channel["itunes:image"]?.["@_href"] ?? channel.image?.url ?? null,
    link: isString(channel.link) ? channel.link : "",
  };
}

export async function getAllPodcastEpisodes(): Promise<
  Result<
    { episodes: PodcastEpisodeSummary[]; channel: PodcastChannelMetadata },
    Error
  >
> {
  const result = await fetchAndParseRss();
  if (result.isErr()) {
    return result;
  }

  const { channel } = result.value;
  const items = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  const episodes = items
    .map(rssItemToEpisode)
    .filter((e): e is PodcastEpisode => e !== null)
    .sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    .map(episodeToSummary);

  return new Ok({ episodes, channel: extractChannelMetadata(channel) });
}

export async function getPodcastEpisodeBySlug(
  slug: string
): Promise<Result<{ episode: PodcastEpisode; channel: PodcastChannelMetadata } | null, Error>> {
  const result = await fetchAndParseRss();
  if (result.isErr()) {
    return result;
  }

  const { channel } = result.value;
  const items = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  const episodes = items
    .map(rssItemToEpisode)
    .filter((e): e is PodcastEpisode => e !== null);

  const episode = episodes.find((e) => e.slug === slug) ?? null;
  if (!episode) {
    return new Ok(null);
  }

  return new Ok({ episode, channel: extractChannelMetadata(channel) });
}
