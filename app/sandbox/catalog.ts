/** The sandbox storefront's stock. Three items, fixed, no backend. */

export interface Product {
  /** Internal key. Never appears in tool output (CLAUDE.md rule 7). */
  id: string;
  name: string;
  priceUsd: number;
  blurb: string;
  emoji: string;
}

export const PRODUCTS: readonly Product[] = [
  {
    id: "p_mixtape",
    name: "Summer Mixtape, side A",
    priceUsd: 8,
    blurb: "Ninety minutes, hand-labelled, one skip around minute forty.",
    emoji: "\u{1F4FC}",
  },
  {
    id: "p_lamp",
    name: "Lava lamp, still works",
    priceUsd: 34,
    blurb: "Amber over gold. Takes twenty minutes to get going, like everyone.",
    emoji: "\u{1FA94}",
  },
  {
    id: "p_duck",
    name: "Debugging duck",
    priceUsd: 6,
    blurb: "Explain the bug to it out loud. That is the entire product.",
    emoji: "\u{1F986}",
  },
];
