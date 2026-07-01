import { defineArchitecture } from 'gesetz';

export const layers = defineArchitecture({
  layers: [
    { name: 'core', pattern: 'packages/core/src/**/*', canImportFrom: [] },
    { name: 'adapters', pattern: 'packages/adapter-*/src/**/*', canImportFrom: ['core'] },
  ],
  forbidden: [
    {
      from: 'core',
      to: 'adapters',
      message: 'core must never import from adapter packages — adapters depend on core, not the reverse.',
    },
  ],
});
