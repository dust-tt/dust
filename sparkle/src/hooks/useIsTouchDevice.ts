import { useEffect, useState } from "react";

const detectTouchDevice = () => {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    return true;
  }

  return (
    "ontouchstart" in window ||
    (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
  );
};

export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(detectTouchDevice());
  }, []);

  return isTouchDevice;
}

