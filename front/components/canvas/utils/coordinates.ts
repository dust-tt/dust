export interface Transform {
  x: number;
  y: number;
  k: number; // scale
}

export interface Point {
  x: number;
  y: number;
}

// Convert screen coordinates to canvas coordinates
export function screenToCanvas(
  screenPoint: Point,
  transform: Transform,
  containerRect: DOMRect
): Point {
  return {
    x: (screenPoint.x - containerRect.left - transform.x) / transform.k,
    y: (screenPoint.y - containerRect.top - transform.y) / transform.k,
  };
}

// Convert canvas coordinates to screen coordinates
export function canvasToScreen(
  canvasPoint: Point,
  transform: Transform
): Point {
  return {
    x: canvasPoint.x * transform.k + transform.x,
    y: canvasPoint.y * transform.k + transform.y,
  };
}

// Get the center of the current viewport in canvas coordinates
export function getViewportCenter(
  containerRect: DOMRect,
  transform: Transform
): Point {
  const screenCenter = {
    x: containerRect.width / 2,
    y: containerRect.height / 2,
  };
  
  return screenToCanvas(screenCenter, transform, {
    ...containerRect,
    left: 0,
    top: 0,
  });
}

// Clamp transform values to reasonable bounds
export function clampTransform(transform: Transform): Transform {
  return {
    x: Math.max(-5000, Math.min(5000, transform.x)),
    y: Math.max(-5000, Math.min(5000, transform.y)),
    k: Math.max(0.1, Math.min(3, transform.k)),
  };
}

// Calculate distance between two points
export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}