import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests boot an in-memory MongoDB replica set (first run downloads the binary).
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/placeholder',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
      BCRYPT_COST: '4',
      APP_URL: 'http://localhost:3000',
      PAYMENTS_MOCK_ENABLED: 'true',
      PAYMENTS_MOCK_SECRET: 'mock-webhook-secret',
    },
    coverage: { provider: 'v8', include: ['config/**', 'controllers/**', 'middleware/**', 'models/**', 'routes/**', 'services/**', 'utils/**'] },
  },
});
