import * as react_docgen from 'react-docgen';
import * as TsconfigPaths from 'tsconfig-paths';
import { LoaderContext } from 'webpack';

declare function reactDocgenLoader(this: LoaderContext<{
    debug: boolean;
}>, source: string, map: any): Promise<void>;
declare function getReactDocgenImporter(matchingPath: TsconfigPaths.MatchPath | undefined): react_docgen.Importer;

export { reactDocgenLoader as default, getReactDocgenImporter };
