import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Context to share hover state
const Hover3DContext = createContext<{
  isHovered: boolean;
  setHovered?: (state: boolean) => void;
}>({ isHovered: false });

// Custom hook to use the context
export const useHover3D = () => useContext(Hover3DContext);

interface Hover3DProps {
  children: React.ReactNode;
  xOffset?: number;
  yOffset?: number;
  attack?: number;
  release?: number;
  perspective?: number;
  className?: string;
  depth?: number;
}

function Hover3D({
  children,
  xOffset = 10,
  yOffset = 10,
  attack = 0.1,
  release = 0.5,
  perspective = 500,
  depth = -10,
  className = "",
}: Hover3DProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isHovered, setHovered] = useState(false);
  const [transform, setTransform] = useState(
    "perspective(500px) translateZ(0px)"
  );
  const [transition, setTransition] = useState("");

  const map = (
    value: number,
    istart: number,
    istop: number,
    ostart: number,
    ostop: number
  ) => {
    return ostart + (ostop - ostart) * ((value - istart) / (istop - istart));
  };

  useEffect(() => {
    const element = elementRef.current;

    const handleMouseEnter = () => {
      setTransition(`transform ${attack}s`);
      setHovered(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (element) {
        const rect = element.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;

        const xRot = map(dx, 0, rect.width, -xOffset, xOffset);
        const yRot = map(dy, 0, rect.height, yOffset, -yOffset);

        setTransform(
          `perspective(${perspective}px) rotateX(${yRot}deg) rotateY(${xRot}deg) translateZ(${depth}px)`
        );
      }
    };

    const handleMouseLeave = () => {
      setTransition(`transform ${release}s`);
      setTransform(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`);
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
  }, [attack, release, perspective, xOffset, yOffset]);

  return (
    <Hover3DContext.Provider value={{ isHovered, setHovered }}>
      <div
        ref={elementRef}
        style={{
          transform: transform,
          transition: transition,
          transformStyle: "preserve-3d",
        }}
        className={className}
      >
        {children}
      </div>
    </Hover3DContext.Provider>
  );
}

interface divProps {
  depth: number;
  children: React.ReactNode;
  className?: string;
}

const Div3D = ({ depth, children, className = "" }: divProps) => {
  const { isHovered } = useHover3D();
  const style = {
    transform: `translateZ(${isHovered ? depth : 0}px)`,
    transition: "transform 0.5s",
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
};

export { Div3D, Hover3D };
