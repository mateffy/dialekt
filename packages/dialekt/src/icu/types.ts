export interface IcuVariable {
  readonly type: "variable";
  readonly name: string;
}

export interface IcuPlural {
  readonly type: "plural";
  readonly variable: string;
  readonly offset?: number;
  readonly forms: Record<string, string>;
}

export interface IcuSelect {
  readonly type: "select";
  readonly variable: string;
  readonly cases: Record<string, string>;
}

export type IcuNode = IcuVariable | IcuPlural | IcuSelect | string;

export type IcuMessage = readonly IcuNode[];

export class IcuParseError extends Error {
  readonly _tag = "IcuParseError";
}
