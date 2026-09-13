import type { Ingredient, Recipe } from "./types";

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyIngredient(): Ingredient {
  return {
    id: generateId(),
    name: "",
    quantity: "",
    unit: "g",
    calories: "",
    protein: "",
    fiber: "",
    libraryId: null,
    servingMode: "whole",
    pantryStaple: false,
    isFlex: false,
    flexDefault: false,
  };
}

export function hasFlexIngredients(recipe: Recipe): boolean {
  return (recipe.ingredients || []).some((i) => i.isFlex);
}

export function defaultFlexIds(recipe: Recipe): string[] {
  return (recipe.ingredients || []).filter((i) => i.isFlex && i.flexDefault).map((i) => i.id);
}

export function emptyRecipe(): Recipe {
  return {
    id: "",
    name: "",
    category: "Dinner",
    servings: 4,
    ingredients: [emptyIngredient()],
    instructions: "",
  };
}

// `activeFlexIds`, when passed, says exactly which flex ingredients count
// (used for a specific scheduled occurrence). Omit it to fall back to the
// recipe's own flexDefault flags (used anywhere there's no schedule context
// — Browse cards, Recipe Detail, the recipe editor). Pass [] deliberately
// to mean "all flex ingredients off", distinct from "no selection given".
function sumIngredientField(
  recipe: Recipe,
  field: "calories" | "protein" | "fiber",
  activeFlexIds?: string[] | null
) {
  const servings = parseFloat(String(recipe.servings)) || 1;
  let wholeTotal = 0;
  let perServingTotal = 0;
  (recipe.ingredients || []).forEach((i) => {
    if (i.isFlex) {
      const isOn = activeFlexIds ? activeFlexIds.includes(i.id) : Boolean(i.flexDefault);
      if (!isOn) return;
    }
    const value = parseFloat(i[field]) || 0;
    if (i.servingMode === "perServing") {
      perServingTotal += value;
    } else {
      wholeTotal += value;
    }
  });
  const perServing = wholeTotal / servings + perServingTotal;
  return { total: Math.round(perServing * servings), perServing: Math.round(perServing) };
}

export function recipeCalories(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "calories", activeFlexIds);
}

export function recipeProtein(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "protein", activeFlexIds);
}

export function recipeFiber(recipe: Recipe, activeFlexIds?: string[] | null) {
  return sumIngredientField(recipe, "fiber", activeFlexIds);
}

export type PlanDay = {
  date: string;
  weekday: string;
  dayNum: number;
  month: string;
  isToday: boolean;
};

export function getNext7Days(): PlanDay[] {
  const days: PlanDay[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: i === 0,
    });
  }
  return days;
}
