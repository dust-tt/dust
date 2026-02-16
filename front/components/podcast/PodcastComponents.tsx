import { Grid, H1, P } from "@app/components/home/ContentComponents";
import type {
  PodcastChannelMetadata,
  PodcastEpisodeSummary,
} from "@app/lib/podcast/types";
import { classNames, formatTimestampToFriendlyDate } from "@app/lib/utils";
import { LinkWrapper } from "@dust-tt/sparkle";
import Image from "next/image";

export const PODCAST_PAGE_SIZE = 12;

function formatDuration(durationSeconds: number | null): string | null {
  if (durationSeconds === null) {
    return null;
  }
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

interface PodcastHeaderProps {
  channel: PodcastChannelMetadata;
}

export function PodcastHeader({ channel }: PodcastHeaderProps) {
  return (
    <div className="col-span-12 flex flex-col items-center gap-0 pt-1 text-center">
      {channel.imageUrl && (
        <Image
          src={channel.imageUrl}
          alt={channel.title}
          width={112}
          height={112}
          className="h-28 w-28 rounded-2xl"
          priority
        />
      )}
      <H1 className="text-5xl">{channel.title}</H1>
      {channel.description && (
        <P className="max-w-2xl text-center text-muted-foreground">
          {channel.description}
        </P>
      )}
    </div>
  );
}

interface PodcastEpisodeCardProps {
  episode: PodcastEpisodeSummary;
}

export function PodcastEpisodeCard({ episode }: PodcastEpisodeCardProps) {
  const duration = formatDuration(episode.durationSeconds);

  return (
    <LinkWrapper
      href={`/podcast/${episode.slug}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white"
    >
      {episode.imageUrl && (
        <Image
          src={episode.imageUrl}
          alt={episode.title}
          width={640}
          height={640}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="aspect-square w-full object-cover"
        />
      )}
      <div className="flex h-full flex-col gap-3 px-6 py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {formatTimestampToFriendlyDate(
              new Date(episode.publishedAt).getTime(),
              "short"
            )}
          </span>
          {duration && (
            <>
              <span>&middot;</span>
              <span>{duration}</span>
            </>
          )}
          {episode.episodeNumber !== null && (
            <>
              <span>&middot;</span>
              <span>Ep. {episode.episodeNumber}</span>
            </>
          )}
        </div>
        <h3 className="text-xl font-semibold text-foreground">
          {episode.title}
        </h3>
        {episode.description && (
          <p className="line-clamp-3 text-base text-muted-foreground">
            {episode.description}
          </p>
        )}
      </div>
    </LinkWrapper>
  );
}

interface PodcastEpisodeGridProps {
  episodes: PodcastEpisodeSummary[];
}

export function PodcastEpisodeGrid({ episodes }: PodcastEpisodeGridProps) {
  return (
    <div
      className={classNames(
        "col-span-12 pt-4",
        "grid gap-8 sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {episodes.length > 0 ? (
        episodes.map((episode) => (
          <PodcastEpisodeCard key={episode.slug} episode={episode} />
        ))
      ) : (
        <div className="col-span-full py-12 text-center">
          <P size="md" className="text-muted-foreground">
            No episodes available yet. Check back soon!
          </P>
        </div>
      )}
    </div>
  );
}

interface TransistorPlayerProps {
  transistorId: string;
  title: string;
}

export function TransistorPlayer({
  transistorId,
  title,
}: TransistorPlayerProps) {
  return (
    <iframe
      src={`https://share.transistor.fm/e/${transistorId}`}
      title={`Listen to ${title}`}
      width="100%"
      height="180"
      frameBorder="0"
      scrolling="no"
      seamless
      className="rounded-xl"
    />
  );
}

interface PodcastLayoutProps {
  children: React.ReactNode;
}

export function PodcastLayout({ children }: PodcastLayoutProps) {
  return <Grid>{children}</Grid>;
}
