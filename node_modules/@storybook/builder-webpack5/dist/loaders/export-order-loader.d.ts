import { LoaderContext } from 'webpack';

declare function loader(this: LoaderContext<any>, source: string, map: any, meta: any): Promise<void>;

export { loader as default };
