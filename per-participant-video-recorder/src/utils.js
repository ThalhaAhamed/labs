/**
 * Small shared helpers used across the project.
 */

/**
 * Sanitize a participant name into a filesystem-safe folder name.
 * Strips path separators and characters that are invalid on common
 * filesystems, collapses whitespace, and trims trailing dots/spaces
 * (which Windows disallows at the end of a filename).
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unknown_participant';

  return name
    .normalize('NFKC')
    .replace(/[/\\?%*:|"<>]/g, '') // filesystem-illegal characters
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') // no trailing dots/spaces
    .slice(0, 150) || 'unknown_participant';
}

/**
 * Given a base name and a set of names already used, return a unique
 * variant (e.g. "John Doe", "John Doe (2)", "John Doe (3)", ...).
 * Mutates `usedNames` by adding the returned name.
 *
 * @param {string} baseName
 * @param {Set<string>} usedNames
 * @returns {string}
 */
export function dedupeName(baseName, usedNames) {
  let candidate = baseName;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (${suffix})`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Sleep helper for backoff delays.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatTimestampForFolder(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Exponential backoff delay with jitter.
 * @param {number} attempt - 0-indexed attempt number
 * @param {number} baseDelayMs
 * @returns {number} delay in ms
 */
export function backoffDelay(attempt, baseDelayMs) {
  const exp = baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exp + jitter, 30_000);
}

/**
 * Read a required environment variable, throwing a clear error if missing.
 * @param {string} name
 * @returns {string}
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}
