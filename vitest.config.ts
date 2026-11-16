import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    env: {
      RUNTIME_CACHE_DISABLE_BUILD_CACHE: 'true',
      SUSPENSE_CACHE_DEBUG: 'false',
    },
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
})
