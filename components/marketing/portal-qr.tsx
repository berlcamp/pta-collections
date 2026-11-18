import QRCode from "qrcode";
import { ScanLine } from "lucide-react";

import { siteUrl } from "@/lib/brand/site";

/**
 * A QR code that opens the parent sign-in on a phone.
 *
 * The landing page is mostly read on a laptop or projected at a PTA meeting,
 * and the portal is used on a phone. A QR is how the link crosses that gap —
 * point the camera, tap the banner, and the parent is on the card-number
 * screen. Rendered to SVG on the server: no client script, nothing to load.
 *
 * It encodes the ABSOLUTE url from siteUrl(), so NEXT_PUBLIC_SITE_URL must be
 * the real domain in production — a QR pointing at localhost scans fine and
 * then goes nowhere.
 */
export async function PortalQr() {
  const url = `${siteUrl()}/portal/login`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0b1f4dff", light: "#ffffffff" },
  });

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 pr-5 shadow-sm">
      <div
        role="img"
        aria-label={`QR code for ${url}`}
        className="size-28 shrink-0 rounded-xl bg-white p-2 [&>svg]:size-full"
        // The SVG is generated here from our own URL, not from user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ScanLine className="size-4 text-primary" />
          Scan with your phone
        </p>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Opens the parent sign-in. Have your card ready.
        </p>
        <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </div>
  );
}
