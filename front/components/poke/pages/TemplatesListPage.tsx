import { TemplatesDataTable } from "@app/components/poke/templates/TemplatesDataTable";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";

export function TemplatesListPage() {
  usePokePageMetadata({ name: "Templates" });

  return (
    <div className="mx-auto h-full w-full max-w-7xl flex-grow flex-col items-center justify-center p-8 pt-8">
      <TemplatesDataTable />
    </div>
  );
}
