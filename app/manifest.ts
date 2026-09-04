import type { MetadataRoute } from "next";

/** Lets the table display be saved to a tablet home screen and open full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Big Two — Hong Kong Rules",
    short_name: "Big Two",
    description:
      "Hong Kong style Big Two (鋤大弟) for one to four players, with AI filling any empty seats and a tablet acting as the shared table.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b3d2e",
    theme_color: "#0b3d2e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
