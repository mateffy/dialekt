import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface AndroidAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function android(options: AndroidAdapterOptions): TranslationAdapter;
//#endregion
export { type AndroidAdapterOptions, android };