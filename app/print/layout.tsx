import "../globals.css";

/**
 * Print surface. No app chrome, no navigation — just the document.
 * The viewer prints with Ctrl+P and can "Save as PDF" from the browser dialog,
 * which is the whole PDF story (D19).
 */
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-svh bg-white text-black">{children}</div>;
}
