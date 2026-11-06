/**
 * The same queue as /collections/claims, in the cashier's workspace. Confirming
 * a GCash transfer is taking a payment (0016), so it belongs on this desk, and
 * there is one page rather than two that could drift apart.
 */
export { default } from "@/app/(app)/collections/claims/page";

export const dynamic = "force-dynamic";
