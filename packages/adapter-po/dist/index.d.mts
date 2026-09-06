import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface PoAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function po(options: PoAdapterOptions): TranslationAdapter;
//#endregion
export { type PoAdapterOptions, po };