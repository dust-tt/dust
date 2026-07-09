// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file

interface HeroVideoProps {
  /** YouTube video id rendered in the hero's right column. */
  videoId: string;
  /** Accessible iframe title. */
  title: string;
}

// Video treatment for the hero's right column (collaboration variant). It plays
// the same role the animated office scene does in the control — an ambient,
// self-playing visual — but shows a customer-story clip instead. Autoplays
// muted and loops so it behaves like the scene it replaces; controls stay
// available so visitors can unmute and watch. Unlike the office scene (which
// fills the viewport height), the embed sizes to its natural 16:9 ratio so it
// sits at the top of the hero without a tall empty gap; the parent row centers
// it against the copy column. On brand: rounded corners with a soft border and
// shadow to match the rest of the landing surface.
export function HeroVideo({ videoId, title }: HeroVideoProps) {
  const src = new URL(`https://www.youtube.com/embed/${videoId}`);
  src.searchParams.set("autoplay", "1");
  src.searchParams.set("mute", "1");
  src.searchParams.set("loop", "1");
  // `loop` only takes effect when the video is also listed as the playlist.
  src.searchParams.set("playlist", videoId);
  src.searchParams.set("playsinline", "1");
  src.searchParams.set("modestbranding", "1");
  src.searchParams.set("rel", "0");

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-gray-100 shadow-[0_24px_60px_-28px_rgba(20,22,28,0.24)]">
      <iframe
        src={src.toString()}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
