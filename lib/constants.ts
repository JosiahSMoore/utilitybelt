import type { MealSlot } from "./types";

export const UNITS = ["g", "oz", "kg", "lb", "ml", "l", "cup", "tbsp", "tsp", "count", "can", "unit"];

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
