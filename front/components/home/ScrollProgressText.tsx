import React, { useEffect, useRef, useState } from "react";

type ScrollProgressTextProps = {
  text: string;
  className?: string;
  startColor?: string; // TailwindCSS color class for starting color (light)
  endColor?: string; // TailwindCSS color class for ending color (dark)
  scrollDistance?: number; // How much scroll distance to complete the effect (in pixels)
};

export const ScrollProgressText: React.FC<ScrollProgressTextProps> = ({
  text,
  className = "",
  startColor = "text-gray-300",
  endColor = "text-gray-900",
  scrollDistance = 400,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Split the text into words
  const words = text.split(" ");

  // Calculate how many words should be highlighted based on scroll progress
  const highlightedWordCount = Math.floor(words.length * scrollProgress);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) {
        return;
      }

      // Get the section's position relative to the viewport
      const rect = sectionRef.current.getBoundingClientRect();

      // Calculate how far we've scrolled into the section
      // When the section just enters the viewport from the bottom, progress is 0
      // When we've scrolled scrollDistance pixels, progress is 1
      const distanceFromTop = window.innerHeight - rect.top;
      const rawProgress = Math.max(
        0,
        Math.min(1, distanceFromTop / scrollDistance)
      );

      setScrollProgress(rawProgress);
    };

    window.addEventListener("scroll", handleScroll);
    // Initial calculation
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [scrollDistance]);

  return (
    <div ref={sectionRef} className={`relative ${className}`}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={`transition-colors duration-300 ${
            index < highlightedWordCount ? endColor : startColor
          }`}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}

      {/* <div className="fixed right-4 top-4 z-50 bg-white p-2 text-black">
        Progress: {Math.round(scrollProgress * 100)}%
      </div> */}
    </div>
  );
};
