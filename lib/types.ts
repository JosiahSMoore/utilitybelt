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
  // Pantry staples (salt, oil, spices you always have) get skipped when
  // building the shopping list from the meal plan. Defaults from the
  // library ingredient when picked, but overridable per recipe.
  pantryStaple?: boolean;
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
  pantryStaple: boolean;
};

export type Recipe = {
  id: string;
  name: string;
  category: string;
  servings: number | string;
  ingredients: Ingredient[];
  instructions: string;
};

// A one-off meal typed directly into a slot — never saved to the recipes
// table, only ever lives inside that slot's meal_plan row.
export type CustomMeal = {
  name: string;
  calories: number;
  protein: number;
  fiber: number;
};

// A slot holds either a reference to a saved recipe OR an inline custom
// meal, never both. `null` (or absent) means nothing assigned.
export type MealSlotValue = {
  recipeId: string | null;
  custom: CustomMeal | null;
};

export type DayPlan = Partial<Record<MealSlot, MealSlotValue | null>>;

export type MealPlan = Record<string, DayPlan>;

export type ShoppingItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  recipes: string[];
  checked: boolean;
};

// Something eaten on a given day outside any planned meal slot. Calories
// only, by design — no protein/fiber tracking for these.
export type DailyExtra = {
  id: string;
  date: string;
  name: string;
  calories: number;
};
