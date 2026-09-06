import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface IosAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function ios(options: IosAdapterOptions): TranslationAdapter;
//#endregion
export { type IosAdapterOptions, ios };