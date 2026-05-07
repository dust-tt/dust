import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowBlockDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14.2 1.965c.123 0 .277 0 .412.01.11.01.259.03.42.087l.165.07.106.06c.206.126.38.3.506.505l.06.106.07.165c.057.161.076.31.085.42.011.135.011.289.011.412v9.165H19a1.035 1.035 0 0 1 .732 1.766l-7 7a1.034 1.034 0 0 1-1.463 0l-7-7A1.035 1.035 0 0 1 5 12.965h2.965V3.8c0-.123 0-.277.01-.412.013-.148.043-.362.157-.585l.06-.106c.147-.24.358-.436.61-.565l.166-.07c.161-.058.31-.077.42-.086.135-.011.289-.011.412-.011zM10.035 14c0 .572-.463 1.035-1.035 1.035H7.498L12 19.537l4.502-4.502H15A1.035 1.035 0 0 1 13.965 14V4.035h-3.93z"
    />
  </svg>
);
export default SvgArrowBlockDown;
