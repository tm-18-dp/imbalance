/** CS2 rarity colours, as the game shows them. Knives and gloves ("Rare") are gold. */
export const RARITY_COLORS: Record<string, string> = {
  "Consumer Grade": "#b0c3d9",
  "Industrial Grade": "#5e98d9",
  "Mil-Spec Grade": "#4b69ff",
  Restricted: "#8847ff",
  Classified: "#d32ce6",
  Covert: "#eb4b4b",
  Rare: "#e4ae39",
  Contraband: "#e4ae39",
};

/** Colour for a market item name, using the skin's rarity; knives and gloves ("★") are gold. */
export const nameColor = (name: string, rarity?: string | null) =>
  name.startsWith("★")
    ? RARITY_COLORS.Rare
    : rarity
      ? RARITY_COLORS[rarity]
      : undefined;
