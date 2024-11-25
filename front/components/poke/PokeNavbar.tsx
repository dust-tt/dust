import { Button, Logo } from "@dust-tt/sparkle";
import { isDevelopment } from "@dust-tt/types";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import {
  PokeCommandDialog,
  PokeCommandInput,
  PokeCommandItem,
  PokeCommandList,
} from "@app/components/poke/shadcn/ui/command";
import { classNames } from "@app/lib/utils";
import { usePokeSearch } from "@app/poke/swr/search";

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
        <Button href="/poke/plans" variant="ghost" label="Plans" />
        <Button href="/poke/templates" variant="ghost" label="Templates" />
        <Button href="/poke/plugins" variant="ghost" label="Plugins" />
      </div>
    </div>
    <PokeSearchCommand />
  </nav>
);

export default PokeNavbar;

export function PokeSearchCommand() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { isError, isLoading, results } = usePokeSearch({
    // Disable search until the user has typed at least 2 characters.
    disabled: searchTerm.length < 2,
    search: searchTerm,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <PokeButton variant="outline" size="sm" onClick={() => setOpen(true)}>
        Search
      </PokeButton>
      <PokeCommandDialog
        open={open}
        onOpenChange={setOpen}
        className="bg-structure-50 sm:max-w-[600px]"
        shouldFilter={false}
      >
        <PokeCommandInput
          placeholder="Type a command or search..."
          onValueChange={(value) => setSearchTerm(value)}
          className="border-none focus:outline-none focus:ring-0"
        />
        <PokeCommandList>
          {isLoading && <div className="p-4 text-sm">Searching...</div>}
          {searchTerm &&
            searchTerm.length >= 2 &&
            !isError &&
            !isLoading &&
            results.length === 0 && (
              <div className="p-4 text-sm">No results found.</div>
            )}
          {isError && <div className="p-4 text-sm">Something went wrong.</div>}
          {searchTerm.length < 2 && (
            <div className="p-4 text-sm">Enter at least 2 characters...</div>
          )}

          {results.map(({ id, link, name }) =>
            link ? (
              <Link href={link} key={id}>
                <PokeCommandItem value={name}>
                  {name} (id: {id})
                </PokeCommandItem>
              </Link>
            ) : (
              <PokeCommandItem key={id} value={name}>
                {name} (id: {id})
              </PokeCommandItem>
            )
          )}
        </PokeCommandList>
      </PokeCommandDialog>
    </>
  );
}
