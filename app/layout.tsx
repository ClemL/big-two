import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Two — Hong Kong Rules",
  description:
    "Play Hong Kong style Big Two (鋤大弟) against three AI opponents, or with friends round a shared table. Singles, pairs, triples and five-card poker hands, with Hong Kong penalty scoring.",
  applicationName: "Big Two",
  appleWebApp: { capable: true, title: "Big Two", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Big Two — Hong Kong Rules",
    description:
      "One to four players, AI filling the empty seats, and a tablet that can act as the table itself.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0b3d2e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
