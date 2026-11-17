import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    // Fuerza la base de pruebas (<DB_NAME>_test, ver config.cjs) y silencia los logs.
    // El límite de login por IP se sube en las pruebas (todas salen de 127.0.0.1); el limitador
    // se prueba por separado con createRateLimiter.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      LOGIN_RATE_LIMIT_PER_MINUTE: '10000',
      FORGOT_PASSWORD_RATE_LIMIT_PER_HOUR: '10000',
      RESET_PASSWORD_RATE_LIMIT_PER_15_MIN: '10000',
    },
    setupFiles: ['./tests/setup.js'],
    // Las pruebas de integración comparten la misma base: se ejecutan de a un archivo a la vez.
    fileParallelism: false,
  }
});
