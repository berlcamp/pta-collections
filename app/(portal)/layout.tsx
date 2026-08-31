/**
 * The portal shell.
 *
 * Deliberately NOT the app shell. Parents get no sidebar, no school switcher,
 * no breadcrumb rail — those exist to help staff move between modules, and a
 * parent has six screens. The whole portal is built mobile-first because that
 * is the only device most of them will ever open it on.
 */
export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-svh bg-muted/30">{children}</div>;
}
