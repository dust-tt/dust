import type { SVGProps } from "react";
import * as React from "react";

const SvgWifi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M12.01 18.465a1.036 1.036 0 0 1 0 2.07H12a1.035 1.035 0 0 1 0-2.07zm-.01-10c3.047 0 5.833 1.134 7.953 3.002a1.035 1.035 0 0 1-1.37 1.553A9.92 9.92 0 0 0 12 10.535a9.92 9.92 0 0 0-6.583 2.485 1.035 1.035 0 0 1-1.37-1.553A12 12 0 0 1 12 8.465"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M12 13.465a7 7 0 0 1 4.337 1.496 1.035 1.035 0 0 1-1.278 1.629A4.94 4.94 0 0 0 12 15.535c-1.172 0-2.249.406-3.098 1.085a1.035 1.035 0 1 1-1.292-1.617 7 7 0 0 1 4.39-1.538m0-10c4.434 0 8.475 1.696 11.506 4.473a1.036 1.036 0 0 1-1.399 1.526A14.9 14.9 0 0 0 12 5.535 14.9 14.9 0 0 0 1.892 9.464 1.035 1.035 0 1 1 .494 7.937 16.98 16.98 0 0 1 12 3.465"
    />
  </svg>
);
export default SvgWifi;
