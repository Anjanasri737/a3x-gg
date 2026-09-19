import { properties, rooms } from "@/myt/lib/properties-seed";
import type { MovementState } from "@/movement/types";

export interface PropertyOption {
  id: string;
  name: string;
  area: string;
  bedsFree: number;
  fromPrice: number;
}

export const propertyOptions: PropertyOption[] = properties
  .map((property) => {
    const free = rooms.filter((room) => room.propertyId === property.id);
    const bedsFree = free.reduce((sum, room) => sum + Math.max(0, room.bedsTotal - room.bedsOccupied), 0);
    const fromPrice = free.length ? Math.min(...free.map((room) => room.currentPrice)) : property.basePrice;
    return { id: property.id, name: property.name, area: property.area, bedsFree, fromPrice };
  })
  .sort((a, b) => b.bedsFree - a.bedsFree);

export function optionById(id: string) {
  return propertyOptions.find((option) => option.id === id);
}

export interface PropertyProgress extends PropertyOption {
  aimed: number;
  toursSet: number;
  toursDone: number;
  booked: number;
}

/** Live closing progress for the properties the operator is aiming to close today. */
export function propertyProgress(ids: string[], states: MovementState[]): PropertyProgress[] {
  return ids
    .map(optionById)
    .filter(Boolean)
    .map((option) => {
      const tagged = states.filter((state) => state.tourProperty === option!.name);
      return {
        ...option!,
        aimed: tagged.length,
        toursSet: tagged.filter((state) => Boolean(state.tourAt)).length,
        toursDone: tagged.filter((state) => Boolean(state.tourDoneAt)).length,
        booked: tagged.filter((state) => state.stage === "booked" || state.stage === "check-in").length,
      };
    });
}

/** Best-fit ordering for one customer: aimed properties first, then area / budget fit. */
export function rankedForCustomer(state: MovementState | undefined, aimed: string[]): PropertyOption[] {
  const area = (state?.q?.currentLocation ?? state?.q?.officeOrCollege ?? "").toString().toLowerCase();
  const budget = Number(state?.q?.budget ?? 0);
  return [...propertyOptions].sort((a, b) => score(b) - score(a));

  function score(option: PropertyOption) {
    let value = option.bedsFree > 0 ? 20 : 0;
    if (aimed.includes(option.id)) value += 100;
    if (area && option.area.toLowerCase().includes(area.split(" ")[0])) value += 40;
    if (budget > 0 && option.fromPrice <= budget) value += 30;
    return value;
  }
}
