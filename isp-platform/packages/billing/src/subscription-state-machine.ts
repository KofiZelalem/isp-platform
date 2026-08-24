/**
 * Subscription lifecycle state machine.
 *
 * Persisted states:   PENDING -> ACTIVE -> SUSPENDED -> EXPIRED -> CANCELLED
 * Requested flow:     PAYMENT -> PENDING -> ACTIVE -> EXPIRING -> EXPIRED
 *
 * "PAYMENT" is the CONFIRM_PAYMENT event that moves a subscription out of
 * PENDING, and "EXPIRING" is a computed warning phase (see isExpiringSoon)
 * rather than a state stored in the database.
 */

export const SUBSCRIPTION_STATES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export const SUBSCRIPTION_EVENTS = [
  "CONFIRM_PAYMENT",
  "SUSPEND",
  "REINSTATE",
  "EXPIRE",
  "CANCEL",
  "RENEW",
] as const;

export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

const TRANSITIONS: Record<
  SubscriptionState,
  Partial<Record<SubscriptionEvent, SubscriptionState>>
> = {
  PENDING: { CONFIRM_PAYMENT: "ACTIVE", CANCEL: "CANCELLED" },
  ACTIVE: { SUSPEND: "SUSPENDED", EXPIRE: "EXPIRED", CANCEL: "CANCELLED" },
  SUSPENDED: { REINSTATE: "ACTIVE", EXPIRE: "EXPIRED", CANCEL: "CANCELLED" },
  EXPIRED: { RENEW: "PENDING" },
  CANCELLED: { RENEW: "PENDING" },
};

export class InvalidSubscriptionTransitionError extends Error {
  constructor(from: SubscriptionState, event: SubscriptionEvent) {
    super(`Cannot apply event "${event}" to a subscription in the "${from}" state.`);
    this.name = "InvalidSubscriptionTransitionError";
  }
}

/** Checks whether an event is legal from the given state without throwing. */
export function canTransition(from: SubscriptionState, event: SubscriptionEvent): boolean {
  return TRANSITIONS[from]?.[event] !== undefined;
}

/** Applies an event to a state, throwing if the transition is not allowed. */
export function transition(
  from: SubscriptionState,
  event: SubscriptionEvent
): SubscriptionState {
  const next = TRANSITIONS[from]?.[event];
  if (!next) {
    throw new InvalidSubscriptionTransitionError(from, event);
  }
  return next;
}

/** Computes an expiry date `validityDays` after `startedAt`, in UTC days. */
export function computeExpiresAt(startedAt: Date, validityDays: number): Date {
  if (!Number.isInteger(validityDays) || validityDays <= 0) {
    throw new RangeError("Subscription validity must be a positive whole number of days.");
  }

  const expiresAt = new Date(startedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + validityDays);
  return expiresAt;
}

/**
 * True when an ACTIVE subscription is within `withinDays` of its expiry.
 * Represents the "EXPIRING" phase of the requested flow without requiring a
 * dedicated stored state.
 */
export function isExpiringSoon(expiresAt: Date | null, withinDays = 3): boolean {
  if (!expiresAt) return false;
  const msRemaining = expiresAt.getTime() - Date.now();
  return msRemaining > 0 && msRemaining <= withinDays * 24 * 60 * 60 * 1000;
}
