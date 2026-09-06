import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface CsvAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function csv(options: CsvAdapterOptions): TranslationAdapter;
//#endregion
export { type CsvAdapterOptions, csv };