import { createFileRoute } from "@tanstack/react-router";
import { Ways } from "@/ways/Ways";

export const Route = createFileRoute("/ways")({
  head: () => ({
    meta: [
      { title: "Ten Ways to Run the Booking Journey | Gharpayy" },
      {
        name: "description",
        content:
          "Ten designs for the same booking journey, three built and clickable, all ranked on timed trials for clicks, attention and capture accuracy.",
      },
      { property: "og:title", content: "Ten Ways to Run the Booking Journey" },
      {
        property: "og:description",
        content: "Three clickable ways plus a ranked trial table for running the Gharpayy booking journey.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Ways,
});
