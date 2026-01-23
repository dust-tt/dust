import { TemplatesDataTable } from "@app/components/poke/templates/TemplatesDataTable";

export function TemplatesListPage() {
  return (
    <div className="mx-auto h-full w-full max-w-7xl flex-grow flex-col items-center justify-center p-8 pt-8">
      <TemplatesDataTable />
    </div>
  );
}
