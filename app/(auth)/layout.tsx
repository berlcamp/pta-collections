export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-sidebar p-6">
      {/* A soft wash off the brand hue, so the sign-in screen reads as the same
          product as the dark rail behind the app. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55rem_35rem_at_50%_-15%,color-mix(in_oklch,var(--sidebar-primary)_45%,transparent),transparent)]"
      />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
