import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface ParaglideAdapterOptions {
  readonly messagesDir: string;
  readonly scanPaths?: readonly string[];
}
declare function paraglide(options: ParaglideAdapterOptions): TranslationAdapter;
//#endregion
export { type ParaglideAdapterOptions, paraglide };
