import React, { useEffect, useRef, useState } from "react";
import Confetti from "react-confetti";

const baseConfettiProps = {
  wind: 0.005,
  gravity: 0.02,
  numberOfPieces: 80,
  colors: ["#FCD34D", "#6EE7B7", "#7DD3FC", "#F9A8D4", "#FCA5A5", "#D8B4FE"],
};

const baseSnowProps = {
  wind: 0.003,
  gravity: 0.01,
  numberOfPieces: 100,
  colors: ["#BFDBFE", "#93C5FD", "#DBEAFE", "#EFF6FF"],
  drawShape: drawSnowflake,
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function drawSnowflake(ctx: CanvasRenderingContext2D): void {
  const numPoints = randomInt(3, 4) * 2;
  const innerRadius = 0.2;
  const outerRadius = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0 - outerRadius);

  for (let n = 1; n < numPoints * 2; n++) {
    const radius = n % 2 === 0 ? outerRadius : innerRadius;
    const x = radius * Math.sin((n * Math.PI) / numPoints);
    const y = -1 * radius * Math.cos((n * Math.PI) / numPoints);
    ctx.lineTo(x, y);
  }
  ctx.fill();
  ctx.stroke();
  ctx.closePath();
}

export interface ConfettiBackgroundProps {
  width?: number;
  height?: number;
  variant?: "confetti" | "snow";
  referentSize?: React.RefObject<HTMLElement>;
}

const ConfettiBackground: React.FC<ConfettiBackgroundProps> = ({
  width,
  height,
  variant = "confetti",
  referentSize,
}) => {
  const [referentWidth, setReferentWidth] = useState(0);
  const [referentHeight, setReferentHeight] = useState(0);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (referentSize && referentSize.current) {
      const { clientWidth, clientHeight } = referentSize.current;
      setReferentWidth(clientWidth);
      setReferentHeight(clientHeight);

      resizeObserver.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setReferentWidth(entry.target.clientWidth);
          setReferentHeight(entry.target.clientHeight);
        }
      });

      resizeObserver.current.observe(referentSize.current);
    }

    return () => {
      if (resizeObserver.current && referentSize && referentSize.current) {
        resizeObserver.current.unobserve(referentSize.current);
      }
    };
  }, [referentSize]);

  const confettiProps = {
    ...baseConfettiProps,
    width: referentSize ? referentWidth : width,
    height: referentSize ? referentHeight : height,
  };

  const snowProps = {
    ...baseSnowProps,
    width: referentSize ? referentWidth : width,
    height: referentSize ? referentHeight : height,
  };

  switch (variant) {
    case "confetti":
      return <Confetti {...confettiProps} />;
    case "snow":
      return <Confetti {...snowProps} />;
    default:
      return <Confetti {...confettiProps} />;
  }
};

export default ConfettiBackground;
