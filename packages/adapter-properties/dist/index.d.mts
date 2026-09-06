import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface PropertiesAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function properties(options: PropertiesAdapterOptions): TranslationAdapter;
//#endregion
export { type PropertiesAdapterOptions, properties };