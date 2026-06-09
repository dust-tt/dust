interface HomeQuoteMarkProps {
  className?: string;
  size?: number;
}

export function HomeQuoteMark({ className, size = 12 }: HomeQuoteMarkProps) {
  return (
    <div
      className={`flex items-center gap-1 ${className ?? ""}`.trim()}
      aria-hidden="true"
    >
      <span
        className="block rounded-full bg-green-300"
        style={{ width: size, height: size }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        className="block text-pink-300"
        aria-hidden="true"
      >
        <path d="M0 0 H12 A12 12 0 0 1 0 12 Z" fill="currentColor" />
      </svg>
    </div>
  );
}
