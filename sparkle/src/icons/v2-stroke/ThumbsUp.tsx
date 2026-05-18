import type { SVGProps } from "react";
import * as React from "react";

const SvgThumbsUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.965 4.466c0-.745-.569-1.357-1.296-1.425L8.21 10.826q-.075.165-.175.313v9.826h9.39c.97 0 1.796-.708 1.943-1.666l1.077-7a1.965 1.965 0 0 0-1.942-2.264H15A2.035 2.035 0 0 1 12.965 8zM3.035 20c0 .533.432.965.965.965h1.965v-8.93H4a.965.965 0 0 0-.965.965zm12-12.035h3.468a4.035 4.035 0 0 1 3.988 4.648l-1.077 7a4.036 4.036 0 0 1-3.988 3.422H4A3.035 3.035 0 0 1 .965 20v-7A3.035 3.035 0 0 1 4 9.965h2.327l3.51-7.898A1.86 1.86 0 0 1 11.534.965l.18.005a3.5 3.5 0 0 1 3.321 3.496z"
    />
  </svg>
);
export default SvgThumbsUp;
