/**
 * Minimal leveled logger to replace scattered console.* calls.
 *
 * Kept dependency-free on purpose (a grad project doesn't need winston/pino).
 * - Honors LOG_LEVEL (error < warn < info < debug); defaults to 'info'.
 * - Stays silent in tests unless LOG_LEVEL is explicitly set, so the suite output
 *   isn't polluted by expected error-path logging.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel = () => {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL in LEVELS) return process.env.LOG_LEVEL;
  if (process.env.NODE_ENV === 'test') return 'error';
  return 'info';
};

const enabled = (level) => LEVELS[level] <= LEVELS[configuredLevel()];

const emit = (level, consoleFn) => (...args) => {
  if (enabled(level)) consoleFn(`[${level.toUpperCase()}]`, ...args);
};

module.exports = {
  error: emit('error', console.error),
  warn: emit('warn', console.warn),
  info: emit('info', console.log),
  debug: emit('debug', console.log),
};
