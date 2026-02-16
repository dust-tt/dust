export interface PodcastEpisode {
  slug: string;
  title: string;
  description: string;
  descriptionHtml: string;
  publishedAt: string;
  durationSeconds: number | null;
  episodeNumber: number | null;
  imageUrl: string | null;
  audioUrl: string;
  transistorId: string;
  link: string;
}

export interface PodcastEpisodeSummary {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number | null;
  episodeNumber: number | null;
  imageUrl: string | null;
}

export interface PodcastChannelMetadata {
  title: string;
  description: string;
  imageUrl: string | null;
  link: string;
}

export interface PodcastListingPageProps {
  episodes: PodcastEpisodeSummary[];
  channel: PodcastChannelMetadata;
  gtmTrackingId: string | null;
}

export interface PodcastEpisodePageProps {
  episode: PodcastEpisode;
  channel: PodcastChannelMetadata;
  gtmTrackingId: string | null;
}
