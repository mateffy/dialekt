import { describe, expect, it } from "vitest";
import { resolveEffectiveConfig } from "./config-resolution.js";
import type { DialektConfig } from "../config/types.js";

const baseConfig: DialektConfig = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  strategy: "one-shot",
  model: { provider: "openai", modelId: "gpt-4o" },
  fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [],
};

describe("resolveEffectiveConfig", () => {
  it("uses loaded config when no flags given", () => {
    const result = resolveEffectiveConfig({}, baseConfig);
    expect(result.sourceLocale).toBe("en");
    expect(result.targetLocales).toEqual(["de", "fr"]);
  });

  it("overrides sourceLocale with flag", () => {
    const result = resolveEffectiveConfig({ baseLanguage: "fr" }, baseConfig);
    expect(result.sourceLocale).toBe("fr");
  });

  it("overrides strategy with flag", () => {
    const result = resolveEffectiveConfig({ strategy: "tool-loop-agent" }, baseConfig);
    expect(result.strategy).toBe("tool-loop-agent");
  });

  it("filters adapters by name flag", () => {
    const adapterA = {
      name: "a",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const adapterB = {
      name: "b",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const config = { ...baseConfig, adapters: [adapterA, adapterB] };
    const result = resolveEffectiveConfig({ adapter: "b" }, config);
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0]!.name).toBe("b");
  });

  it("returns all adapters when adapter flag does not match any", () => {
    const adapterA = {
      name: "a",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const config = { ...baseConfig, adapters: [adapterA] };
    const result = resolveEffectiveConfig({ adapter: "nonexistent" }, config);
    expect(result.adapters).toHaveLength(0);
  });

  it("overrides targetLocales with language flag", () => {
    const result = resolveEffectiveConfig({ language: ["es"] }, baseConfig);
    expect(result.targetLocales).toEqual(["es"]);
  });

  it("preserves targetLocales when language flag is empty", () => {
    const result = resolveEffectiveConfig({ language: [] }, baseConfig);
    expect(result.targetLocales).toEqual(["de", "fr"]);
  });

  it("preserves targetLocales when language flag is undefined", () => {
    const result = resolveEffectiveConfig({}, baseConfig);
    expect(result.targetLocales).toEqual(["de", "fr"]);
  });

  it("does not override strategy when flag is undefined", () => {
    const result = resolveEffectiveConfig({}, baseConfig);
    expect(result.strategy).toBe("one-shot");
  });

  it("does not override sourceLocale when baseLanguage is undefined", () => {
    const result = resolveEffectiveConfig({}, baseConfig);
    expect(result.sourceLocale).toBe("en");
  });

  it("preserves other config fields unchanged", () => {
    const result = resolveEffectiveConfig({}, baseConfig);
    expect(result.model).toEqual(baseConfig.model);
    expect(result.fastModel).toEqual(baseConfig.fastModel);
    expect(result.chunking).toEqual(baseConfig.chunking);
    expect(result.retry).toEqual(baseConfig.retry);
  });

  it("handles multiple adapter filters matching one", () => {
    const a1 = {
      name: "laravel",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const a2 = {
      name: "paraglide",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const config = { ...baseConfig, adapters: [a1, a2] };
    const result = resolveEffectiveConfig({ adapter: "laravel" }, config);
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0]!.name).toBe("laravel");
  });

  it("preserves adapter order after filtering", () => {
    const a1 = {
      name: "first",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const a2 = {
      name: "second",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const a3 = {
      name: "third",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as import("../config/types.js").DialektConfig["adapters"][number];
    const config = { ...baseConfig, adapters: [a1, a2, a3] };
    const result = resolveEffectiveConfig({ adapter: "second" }, config);
    expect(result.adapters[0]!.name).toBe("second");
  });
});
