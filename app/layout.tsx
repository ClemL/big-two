import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Two — Hong Kong Rules",
  description:
    "Play Hong Kong style Big Two (鋤大弟) against three AI opponents. Singles, pairs, triples and five-card poker hands, with Hong Kong penalty scoring.",
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
