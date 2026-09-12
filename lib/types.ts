export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type ServingMode = "whole" | "perServing";

export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  fiber: string;
  // Reference to a shared library ingredient this line was filled from or
  // linked to. Always optional — this row's own quantity/unit/calories are
  // the source of truth for the recipe, this is just a backlink.
  libraryId?: string | null;
  // "whole" (default): quantity/calories are the total for the whole
  // recipe, calories get divided across servings. "perServing": the amount
  // and calories are per single serving (toppings, garnishes) — not
  // divided, and multiplied by servings for the shopping list instead.
  servingMode?: ServingMode;
};

// A shared ingredient library entry. The *PerUnit fields are RATES — the
// amount for one unit of `unit` — not totals, unlike Ingredient's fields.
export type LibraryIngredient = {
  id: string;
  name: string;
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  fiberPerUnit: number;
};

export type Recipe = {
  id: string;
  name: string;
  category: string;
  servings: number | string;
  ingredients: Ingredient[];
  instructions: string;
};

export type DayPlan = Partial<Record<MealSlot, string | null>>;

export type MealPlan = Record<string, DayPlan>;

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
  checked: boolean;
};
