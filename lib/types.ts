export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  calories: string;
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
