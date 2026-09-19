// Schedule-to-property matching for the 100x flow: score live inventory against
// what the customer already told us (area, budget, room type, move-in).
import { properties, rooms } from "@/myt/lib/properties-seed";
import type { FlowLead } from "@/bookingflow/types";

export interface MatchRow {
  propertyId: string;
  name: string;
  area: string;
  roomId: string;
  roomType: string;
  price: number;
  bedsFree: number;
  score: number;
  reasons: string[];
  gaps: string[];
}

const TYPE_MAP: Record<string, string> = { SINGLE: "single", DOUBLE: "double", TRIPLE: "triple", ANY: "" };

export function matchesFor(lead: FlowLead, limit = 6): MatchRow[] {
  const f = lead.f ?? {};
  const area = (f["area"] ?? "").trim().toLowerCase();
  const budget = Number(f["budget"] ?? 0);
  const wanted = TYPE_MAP[f["roomType"] ?? "ANY"] ?? "";

  const rows: MatchRow[] = [];
  properties.forEach((p) => {
    rooms
      .filter((r) => r.propertyId === p.id && r.bedsTotal - r.bedsOccupied > 0)
      .forEach((r) => {
        const reasons: string[] = [];
        const gaps: string[] = [];
        let score = 40;

        if (area && p.area.toLowerCase().includes(area)) { score += 30; reasons.push(`Same area as asked (${p.area})`); }
        else if (area) { gaps.push(`Different area — ${p.area}`); }

        if (budget > 0) {
          if (r.currentPrice <= budget) { score += 25; reasons.push(`Inside budget ₹${budget.toLocaleString("en-IN")}`); }
          else if (r.currentPrice <= budget * 1.15) { score += 10; gaps.push(`₹${(r.currentPrice - budget).toLocaleString("en-IN")} over budget`); }
          else { score -= 15; gaps.push(`₹${(r.currentPrice - budget).toLocaleString("en-IN")} over budget`); }
        } else {
          gaps.push("Budget not captured yet");
        }

        if (wanted && r.type === wanted) { score += 20; reasons.push(`${r.type} sharing as wanted`); }
        else if (wanted) { gaps.push(`Only ${r.type} free here`); }

        if (p.hygieneRating >= 4) { score += 5; reasons.push(`Hygiene ${p.hygieneRating}/5`); }
        if (r.bedsTotal - r.bedsOccupied > 1) { score += 5; reasons.push(`${r.bedsTotal - r.bedsOccupied} beds free`); }

        rows.push({
          propertyId: p.id,
          name: p.name,
          area: p.area,
          roomId: r.id,
          roomType: r.type,
          price: r.currentPrice,
          bedsFree: r.bedsTotal - r.bedsOccupied,
          score: Math.max(0, Math.min(100, score)),
          reasons,
          gaps,
        });
      });
  });

  return rows.sort((a, b) => b.score - a.score || a.price - b.price).slice(0, limit);
}
