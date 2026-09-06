import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface YamlAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}
declare function yaml(options: YamlAdapterOptions): TranslationAdapter;
//#endregion
export { type YamlAdapterOptions, yaml };