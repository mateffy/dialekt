import { TranslationAdapter } from "dialekt";

//#region src/adapter.d.ts
interface LaravelAdapterOptions {
  readonly langDir: string;
  readonly phpBinary?: string;
  readonly scanPaths?: readonly string[];
}
declare function laravel(options: LaravelAdapterOptions): TranslationAdapter;
//#endregion
export { type LaravelAdapterOptions, laravel };
