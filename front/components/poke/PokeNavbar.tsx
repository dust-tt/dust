import { Logo } from "@dust-tt/sparkle";
import { isDevelopment } from "@dust-tt/types";
import Link from "next/link";

import { classNames } from "@app/lib/utils";

export const PokeNavbar: React.FC = () => (
  <nav
    className={classNames(
      "flex items-center justify-between px-4 py-6 pr-8",
      isDevelopment() ? "bg-brand" : "bg-red-500"
    )}
  >
    <div className="flex items-center">
      <Link href="/poke">
        <Logo type="colored-grey" className="-mr-5 h-4 w-32 p-0" />
      </Link>
      <div className="flex flex-row gap-4">
        <Link href="/poke/plans">
          <div className="text-stucture-300 text-sm italic">Plans</div>
        </Link>
        <Link href="/poke/templates">
          <div className="text-stucture-300 text-sm italic">Templates</div>
        </Link>
      </div>
    </div>
  </nav>
);

export default PokeNavbar;
