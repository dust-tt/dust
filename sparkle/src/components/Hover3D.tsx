import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Context to share hover state
const Hover3DContext = createContext<{
  isHovered: boolean;
  setHovered?: (state: boolean) => void;
  isTouchDevice: boolean;
}>({ isHovered: false, isTouchDevice: false });

// Custom hook to use the context
export const useHover3D = () => useContext(Hover3DContext);

// Function to detect touch devices
const isTouchDevice = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const map = (
  value: number,
  istart: number,
  istop: number,
  ostart: number,
  ostop: number
) => {
  return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
};

interface Hover3DProps {
  children: React.ReactNode;
  /** Maximum rotation (degrees) around the Y axis as the cursor moves horizontally. */
  xOffset?: number;
  /** Maximum rotation (degrees) around the X axis as the cursor moves vertically. */
  yOffset?: number;
  /** Transition duration in seconds when the tilt engages on hover. */
  attack?: number;
  /** Transition duration in seconds when the tilt settles back on leave. */
  release?: number;
  /** CSS perspective distance in pixels — smaller values exaggerate the 3D effect. */
  perspective?: number;
  className?: string;
  /** Z translation in pixels applied to the container itself. */
  depth?: number;
  /** Multiplier bounding how far the vertical rotation can go. */
  range?: number;
  /** Tracks the cursor across the whole viewport instead of only while hovering the element. */
  fullscreenSensible?: boolean;
  /** Whether cursor position is measured against the element ("object") or the page body ("screen"). */
  reference?: "screen" | "object";
}

/**
 * A container that tilts in 3D toward the cursor, with nested Div3D children
 * shifting along the Z axis by their depth to create a parallax, layered
 * effect (disabled on touch devices). Use it for showcase or marketing
 * surfaces where playful depth adds delight; keep it off dense, interactive
 * UI where motion would distract.
 * @summary Cursor-tracking 3D tilt container.
 */
function Hover3D({
  children,
  xOffset = 10,
  yOffset = 10,
  attack = 0.1,
  release = 0.5,
  perspective = 500,
  depth = -10,
  className = "",
  range = 3,
  fullscreenSensible = false,
  reference = "object",
}: Hover3DProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isHovered, setHovered] = useState(fullscreenSensible);
  const [isTouch, setIsTouch] = useState(false);
  const [transform, setTransform] = useState(
    `perspective(${perspective}px) translateZ(${
      fullscreenSensible ? depth : 0
    }px)`
  );
  const [transition, setTransition] = useState("");

  // Detect touch device on mount
  useEffect(() => {
    setIsTouch(isTouchDevice());
  }, []);

  useEffect(() => {
    // Skip 3D effect setup if on a touch device
    if (isTouch) {
      return;
    }

    const element = elementRef.current;

    const handleMouseEnter = () => {
      setTransition(`transform ${attack}s`);
      setHovered(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (element) {
        const rect =
          reference === "object"
            ? element.getBoundingClientRect()
            : document.body.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;

        const xRot = clamp(
          map(dx, 0, rect.width, -xOffset, xOffset),
          -xOffset,
          xOffset
        );
        const yRot = clamp(
          map(dy, 0, rect.height, yOffset, -yOffset),
          -range * yOffset,
          range * yOffset
        );

        setTransform(
          `perspective(${perspective}px) rotateX(${yRot}deg) rotateY(${xRot}deg) translateZ(${depth}px)`
        );
      }
    };
    if (fullscreenSensible) {
      window.addEventListener("mousemove", handleMouseMove);
    } else {
      const handleMouseLeave = () => {
        setTransition(`transform ${release}s`);
        setTransform(
          `perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`
        );
        setHovered(false);
      };

      element?.addEventListener("mouseenter", handleMouseEnter);
      element?.addEventListener("mousemove", handleMouseMove);
      element?.addEventListener("mouseleave", handleMouseLeave);

      return () => {
        element?.removeEventListener("mouseenter", handleMouseEnter);
        element?.removeEventListener("mousemove", handleMouseMove);
        element?.removeEventListener("mouseleave", handleMouseLeave);
      };
    }
  }, [
    attack,
    release,
    perspective,
    xOffset,
    yOffset,
    isTouch,
    fullscreenSensible,
    reference,
    depth,
    range,
  ]);

  const hover3DContextValue = useMemo(
    () => ({ isHovered, setHovered, isTouchDevice: isTouch }),
    [isHovered, isTouch]
  );

  return (
    <Hover3DContext.Provider value={hover3DContextValue}>
      <div
        ref={elementRef}
        style={{
          transform: isTouch ? "none" : transform,
          transition: isTouch ? "none" : transition,
          transformStyle: isTouch ? "flat" : "preserve-3d",
        }}
        className={className}
      >
        {children}
      </div>
    </Hover3DContext.Provider>
  );
}

interface divProps {
  /** Z translation in pixels applied while the parent Hover3D is hovered — larger values pop the layer further forward. */
  depth: number;
  children: React.ReactNode;
  className?: string;
}

/** A layer inside Hover3D that shifts along the Z axis by its depth while hovered. */
const Div3D = ({ depth, children, className = "" }: divProps) => {
  const { isHovered, isTouchDevice } = useHover3D();
  const style = {
    transform: isTouchDevice
      ? "none"
      : `translateZ(${isHovered ? depth : 0}px)`,
    transition: isTouchDevice ? "none" : "transform 0.5s",
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
};

export { Div3D, Hover3D };
