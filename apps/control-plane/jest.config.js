/* eslint-disable */
const { readFileSync } = require('fs');
const { join } = require('path');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(join(__dirname, '.spec.swcrc'), 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: '@platform/control-plane',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  // Transform ESM-only packages in node_modules that Jest cannot handle natively
  transformIgnorePatterns: [
    '/node_modules/(?!(@scure|@noble|otplib|@otplib)/)',
  ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['**/*.integration-spec.ts', '**/*.spec.ts'],
  coverageDirectory: 'test-output/jest/coverage',
  testTimeout: 30000,
};
