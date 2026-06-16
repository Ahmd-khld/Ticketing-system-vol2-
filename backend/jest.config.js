/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Detect a local mongod (avoids the slow in-memory binary download). Portable:
  // falls back to a normal download when no system binary exists. See the file.
  setupFiles: ['<rootDir>/tests/jest.env.js'],
};
