/**
 * Pure session policy definitions and deterministic lifetime calculation.
 * Zero external or framework dependencies.
 */

export const SESSION_IDLE_TIMEOUT_MINUTES = 15;
export const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

export const SESSION_ABSOLUTE_TIMEOUT_HOURS = 12;
export const SESSION_ABSOLUTE_TIMEOUT_MS = SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;

export const SESSION_TOUCH_THROTTLE_MINUTES = 1;
export const SESSION_TOUCH_THROTTLE_MS = SESSION_TOUCH_THROTTLE_MINUTES * 60 * 1000;

export interface SessionLifetimeInput {
  createdAt: Date;
  lastSeenAt?: Date | null;
  expiresAt: Date;
  idleExpiresAt?: Date | null;
}

export interface EffectiveSessionLifetime {
  effectiveExpiresAt: Date;
  effectiveIdleExpiresAt: Date;
}

/**
 * Computes deterministic effective expiration boundaries for an active session.
 * Enforces strict fail-closed ceiling on absolute and idle timeouts, ensuring
 * legacy sessions created under older long-lived policies cannot exceed the CMS 1.0
 * hardened lifetime boundaries.
 */
export function calculateEffectiveSessionLifetime(input: SessionLifetimeInput): EffectiveSessionLifetime {
  const { createdAt, lastSeenAt, expiresAt, idleExpiresAt } = input;

  const policyAbsoluteMs = createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS;
  const effectiveAbsoluteMs = Math.min(expiresAt.getTime(), policyAbsoluteMs);

  const activityBaseMs = (lastSeenAt ?? createdAt).getTime();
  const policyIdleMs = activityBaseMs + SESSION_IDLE_TIMEOUT_MS;

  const storedIdleMs = idleExpiresAt ? idleExpiresAt.getTime() : Number.POSITIVE_INFINITY;
  const effectiveIdleMs = Math.min(storedIdleMs, policyIdleMs, effectiveAbsoluteMs);

  return {
    effectiveExpiresAt: new Date(effectiveAbsoluteMs),
    effectiveIdleExpiresAt: new Date(effectiveIdleMs),
  };
}
