import * as React from "react";
import {
  CSSProperties,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@sparkle/lib/utils";

interface NeonColorsProps {
  firstColor: string;
  secondColor: string;
}

interface NeonGradientCardProps {
  /**
   * @default <div />
   * @type ReactElement
   * @description
   * The component to be rendered as the card
   * */
  as?: ReactElement;
  /**
   * @default ""
   * @type string
   * @description
   * The className of the card
   */
  className?: string;

  /**
   * @default ""
   * @type ReactNode
   * @description
   * The children of the card
   * */
  children?: ReactNode;

  /**
   * @default 5
   * @type number
   * @description
   * The size of the border in pixels
   * */
  borderSize?: number;

  /**
   * @default 20
   * @type number
   * @description
   * The size of the radius in pixels
   * */
  borderRadius?: number;

  /**
   * @default "{ firstColor: '#ff00aa', secondColor: '#00FFF1' }"
   * @type string
   * @description
   * The colors of the neon gradient
   * */
  neonColors?: NeonColorsProps;

  [key: string]: unknown;
}

const NeonGradientCard: React.FC<NeonGradientCardProps> = ({
  className,
  children,
  borderSize = 1,
  borderRadius = 16,
  neonColors = {
    firstColor: "#93C5FD",
    secondColor: "#F9A8D4",
  },
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        setDimensions({ width: offsetWidth, height: offsetHeight });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const { offsetWidth, offsetHeight } = containerRef.current;
      setDimensions({ width: offsetWidth, height: offsetHeight });
    }
  }, [children]);

  return (
    <div
      ref={containerRef}
      style={
        {
          "--border-size": `${borderSize}px`,
          "--border-radius": `${borderRadius}px`,
          "--neon-first-color": neonColors.firstColor,
          "--neon-second-color": neonColors.secondColor,
          "--card-width": `${dimensions.width}px`,
          "--card-height": `${dimensions.height}px`,
          "--card-content-radius": `${borderRadius - borderSize}px`,
          "--pseudo-element-background-image": `linear-gradient(0deg, ${neonColors.firstColor}, ${neonColors.secondColor})`,
          "--pseudo-element-width": `${dimensions.width + borderSize * 2}px`,
          "--pseudo-element-height": `${dimensions.height + borderSize * 2}px`,
          "--after-blur": `${dimensions.width / 3}px`,
        } as CSSProperties
      }
      className={cn(
        "s-size-full s-relative s-z-10 s-rounded-[var(--border-radius)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "s-size-full s-relative s-min-h-[inherit] s-rounded-[var(--card-content-radius)] s-bg-white s-p-6",
          "before:s-absolute before:s--left-[var(--border-size)] before:s--top-[var(--border-size)] before:s--z-10 before:s-block",
          "before:s-h-[var(--pseudo-element-height)] before:s-w-[var(--pseudo-element-width)] before:s-rounded-[var(--border-radius)] before:s-content-['']",
          "before:s-bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] before:s-bg-[length:100%_200%]",
          "before:s-animate-background-position-spin",
          "after:s-absolute after:s--left-[var(--border-size)] after:s--top-[var(--border-size)] after:s--z-10 after:s-block",
          "after:s-h-[var(--pseudo-element-height)] after:s-w-[var(--pseudo-element-width)] after:s-rounded-[var(--border-radius)] after:s-blur-[var(--after-blur)] after:s-content-['']",
          "after:s-bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] after:s-bg-[length:100%_200%] after:s-opacity-80",
          "after:s-animate-background-position-spin"
        )}
      >
        {children}
      </div>
    </div>
  );
};

export { NeonGradientCard };
