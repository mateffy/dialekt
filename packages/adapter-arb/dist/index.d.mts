import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface ArbAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function arb(options: ArbAdapterOptions): TranslationAdapter;
//#endregion
export { type ArbAdapterOptions, arb };