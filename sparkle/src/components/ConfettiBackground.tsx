import React from "react";
import Confetti from "react-confetti";

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
  variant?: "confetti" | "snow";
}

const ConfettiBackground: React.FC<ConfettiBackgroundProps> = ({
  variant = "confetti",
}) => {
  const confettiProps = {
    wind: 0.005,
    gravity: 0.02,
    numberOfPieces: 80,
    colors: ["#FCD34D", "#6EE7B7", "#7DD3FC", "#F9A8D4", "#FCA5A5", "#D8B4FE"],
  };

  const snowProps = {
    wind: 0.003,
    gravity: 0.01,
    numberOfPieces: 100,
    colors: ["#BFDBFE", "#93C5FD", "#DBEAFE", "#EFF6FF"],
    drawShape: drawSnowflake,
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
