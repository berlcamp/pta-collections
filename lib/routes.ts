import type { Route } from "next";

/**
 * `typedRoutes` verifies literal hrefs at build time, which is exactly what we
 * want for the static links in the nav. Filter and pagination controls build
 * their URLs from user input at runtime, which the checker cannot verify.
 *
 * This is the single, deliberate escape hatch for those cases — so the cast is
 * in one reviewable place rather than sprinkled through the components.
 */
export function dynamicRoute(href: string): Route {
  return href as Route;
}
