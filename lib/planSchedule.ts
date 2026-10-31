// When a reading plan asks for you: the hour, and the days of the week. The
// types and the recommendation, shared by the server (lib/planReminders,
// which stores them) and the Journal (which sets them), and kept apart from
// the store so the page does not carry the database with it.

/** The hour a plan asks at, or that it has been told not to. */
export type PlanHour = number | "off";

/** Days of the week, Sunday 0 to Saturday 6, as Date.getDay() numbers them. */
export type PlanDays = number[];

/** What a plan asks at when nobody has said otherwise. */
export const DEFAULT_PLAN_HOUR = 7;

/** What a plan asks on when nobody has said otherwise: every day. */
export const EVERY_DAY: PlanDays = [0, 1, 2, 3, 4, 5, 6];
