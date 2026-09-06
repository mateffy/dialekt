import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface XliffAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function xliff(options: XliffAdapterOptions): TranslationAdapter;
//#endregion
export { type XliffAdapterOptions, xliff };