import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['oidc/**/*.test.ts'],
  },
});
