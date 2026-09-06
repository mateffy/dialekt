import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface JsonAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function json(options: JsonAdapterOptions): TranslationAdapter;
//#endregion
export { type JsonAdapterOptions, json };