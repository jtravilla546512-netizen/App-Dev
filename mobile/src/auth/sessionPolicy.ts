export const IDLE_LOGOUT_AFTER_MS = 10 * 60 * 1000;

/** Fail closed for missing, corrupt, future, or expired activity timestamps. */
export function isSessionExpired(activity: number, now = Date.now()): boolean {
  return !Number.isFinite(activity) || activity <= 0 || activity > now
    || now - activity >= IDLE_LOGOUT_AFTER_MS;
}
