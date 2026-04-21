/**
 * Resolve PostgreSQL schema from CLI flags and/or environment.
 * Undefined, null, or whitespace-only → `public`.
 */
export function resolvePgSchema(
  fromOptions?: string | null,
  fromEnv?: string | null
): string {
  const raw = fromOptions ?? fromEnv;
  if (raw === undefined || raw === null) {
    return 'public';
  }
  const trimmed = String(raw).trim();
  return trimmed === '' ? 'public' : trimmed;
}
