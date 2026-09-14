import type { MealSlot, VolumeUnit } from "./types";

export const UNITS = ["g", "oz", "kg", "lb", "ml", "l", "cup", "tbsp", "tsp", "count", "can", "unit"];

// Fixed, ingredient-independent weight conversions to grams — every weight
// unit is always this many grams, for anything. Contrast with volume units
// below, where the grams equivalent depends on the specific ingredient's
// density.
export const WEIGHT_TO_GRAMS: Record<string, number> = {
  g: 1,
  oz: 28.3495,
  lb: 453.592,
  kg: 1000,
};

export const VOLUME_UNITS: VolumeUnit[] = ["tsp", "tbsp", "cup", "ml", "l"];

// Fixed, ingredient-independent volume conversions to milliliters. A
// library ingredient stores exactly one (referenceUnit, gramsPerReferenceUnit)
// density pair — converting between tsp/tbsp/cup/ml/l for that same
// ingredient is just this table, never a second stored number.
export const VOLUME_TO_ML: Record<VolumeUnit, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  cup: 236.588,
  ml: 1,
  l: 1000,
};

// Units that are neither a weight nor a volume — discrete/countable, no
// universal conversion to grams exists (a "can" isn't always the same
// size). Only meaningful paired with a "count" baseUnit library ingredient.
export const COUNT_UNITS = ["count", "can", "unit"];

export const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"];

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const CATEGORY_STYLE: Record<string, string> = {
  Breakfast: "bg-amber-200 text-amber-900",
  Lunch: "bg-emerald-200 text-emerald-900",
  Dinner: "bg-orange-200 text-orange-900",
  Snack: "bg-stone-200 text-stone-700",
  Dessert: "bg-rose-200 text-rose-900",
};
