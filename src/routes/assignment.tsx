import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/assignment")({
  head: () => ({
    meta: [
      { title: "Hiring Assignment · Activate 3 Modules End-to-End" },
      {
        name: "description",
        content:
          "Hiring assignment: copy this rental CRM from GitHub, take any three modules end-to-end to a 2-3x level, and send us the live link.",
      },
      { property: "og:title", content: "Hiring Assignment · Activate 3 Modules End-to-End" },
      {
        property: "og:description",
        content:
          "Copy the project from GitHub, deepen any three modules end-to-end, and share your live link with us.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssignmentPage,
});

const modules = [
  {
    name: "M-POWER CALL (Call Conversation Engine)",
    where: "/leads — open a lead, press M-POWER CALL",
    does: "Runs a real call: why we are calling, what is already known, what to confirm, what to say, and what gets written back after the call.",
  },
  {
    name: "Movement CARE (daily draft + result promise)",
    where: "/movement-care",
    does: "A person promises a result for the day, picks 30 leads one by one, works them, and closes the day with a WhatsApp update.",
  },
  {
    name: "Booking Flow Split (operator workspace)",
    where: "/booking-flow-split",
    does: "One screen split for WhatsApp on one side and the CRM on the other: questions, answers, next step, deadline, closing promise.",
  },
  {
    name: "Movement OS",
    where: "/movement-os",
    does: "The full customer list with stages, owners, overdue work and the work panel beside it.",
  },
  {
    name: "Admin Movement Control",
    where: "/admin",
    does: "Founder and team views: who is doing what, what is late, where money is leaking, and the full history.",
  },
  {
    name: "Closing desk",
    where: "/closing",
    does: "Everyone past the tour: quote, decision, booking, money pending, check-in, with promised closing times.",
  },
];

const questions = [
  {
    q: "What result does this module produce?",
    how: "Name the outcome in one line, e.g. \"more tours actually happen\". Put that line on the screen so the person using it sees it.",
  },
  {
    q: "Who is accountable, and by when?",
    how: "Every item must carry an owner and a deadline. Show what is late in red, on the same screen, not in a report.",
  },
  {
    q: "What is the smallest number of clicks to finish one customer?",
    how: "Count the clicks today. Cut them at least in half. Typing should save itself; Enter should move forward.",
  },
  {
    q: "What gets captured, and can I see it without scrolling?",
    how: "Everything already filled stays visible while working. Nothing should need a second page to read.",
  },
  {
    q: "What happens after the work is done?",
    how: "Auto-write the customer message, the follow-up and the next step. The person should only copy and send.",
  },
  {
    q: "Where does the data go?",
    how: "Save to the hosted backend, not just the browser, so the same state shows on another device and to the admin.",
  },
  {
    q: "How do I prove it works?",
    how: "Walk one real customer through the whole module and show the trail: what changed, who changed it, at what time.",
  },
];

export default function AssignmentPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-5 py-10 space-y-10">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Hiring assignment
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Take any three modules end-to-end, 2–3x deeper
          </h1>
          <p className="text-muted-foreground">
            This is a live rental CRM used by a team that finds homes for people
            and closes bookings. Your job is not to redesign it. Your job is to
            pick three modules and make them actually finish the work they claim
            to do.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What this product is</h2>
          <p className="text-sm text-muted-foreground">
            A customer comes in from WhatsApp. Someone calls them, understands
            what they need, matches a property, schedules a tour, gets a
            decision, takes the booking, collects the money and hands over the
            keys. Every screen here exists to move one customer one step
            forward, with a named owner and a deadline. The same customer is the
            same record everywhere — the list, the call screen, the work panel
            and the admin room all read one truth.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pick any three</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <div
                key={m.name}
                className="rounded-lg border border-border bg-card p-4 space-y-1"
              >
                <p className="font-medium">{m.name}</p>
                <p className="text-sm text-muted-foreground">{m.does}</p>
                <p className="text-xs text-muted-foreground">{m.where}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Answer these for each module you pick
          </h2>
          <ol className="space-y-3">
            {questions.map((item, i) => (
              <li
                key={item.q}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="font-medium">
                  {i + 1}. {item.q}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">How: </span>
                  {item.how}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What 2–3x means here</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Half the clicks for the same outcome, or less.</li>
            <li>No empty screen and no screen that asks only one question.</li>
            <li>Nothing silently lost — every edit shows who, what and when.</li>
            <li>
              The customer message, the follow-up and the next step are written
              for the person, not by the person.
            </li>
            <li>Admin can see the exact same state the operator is seeing.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How to submit</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Copy the project from GitHub into your own account.</li>
            <li>
              Build your changes on the three modules you chose. Keep the
              existing buttons and options working.
            </li>
            <li>Publish it and get a live link that we can open.</li>
            <li>
              Send us the live link plus a short note: which three modules, what
              you changed, and the before/after click count.
            </li>
          </ol>
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">Repository</p>
            <a
              className="text-primary underline break-all"
              href="https://github.com/Gharpayytechy/lead-zen-cleaner"
              target="_blank"
              rel="noreferrer"
            >
              github.com/Gharpayytechy/lead-zen-cleaner
            </a>
            <p className="mt-2 text-muted-foreground">
              We judge the live link, not the code style. If it does not work in
              the browser, it does not count.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">See the product first</h2>
          <div className="flex flex-wrap gap-2">
            {[
              { to: "/leads", label: "Leads" },
              { to: "/movement-care", label: "Movement CARE" },
              { to: "/booking-flow-split", label: "Booking Flow Split" },
              { to: "/closing", label: "Closing desk" },
              { to: "/admin", label: "Admin control" },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
