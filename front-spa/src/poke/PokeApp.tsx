import { CellProvider } from "@dust-tt/front/lib/auth/CellContext";
import { fetcher, fetcherWithBody } from "@dust-tt/front/lib/swr/fetcher";
import { FetcherProvider } from "@dust-tt/front/lib/swr/FetcherContext";
import { SpaRouterRoot } from "@spa/app/components/SpaRouterRoot";
import { AppReadyProvider } from "@spa/app/contexts/AppReadyContext";
import { routes } from "@spa/poke/routes";
import { createBrowserRouter } from "react-router-dom";

const router = createBrowserRouter(routes, {
  basename: import.meta.env?.VITE_BASE_PATH ?? "",
});

export default function PokeApp() {
  return (
    <AppReadyProvider>
      <CellProvider>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <SpaRouterRoot router={router} />
        </FetcherProvider>
      </CellProvider>
    </AppReadyProvider>
  );
}
