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
  };
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

function sumIngredientField(recipe: Recipe, field: "calories" | "protein" | "fiber") {
  const servings = parseFloat(String(recipe.servings)) || 1;
  let wholeTotal = 0;
  let perServingTotal = 0;
  (recipe.ingredients || []).forEach((i) => {
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

export function recipeCalories(recipe: Recipe) {
  return sumIngredientField(recipe, "calories");
}

export function recipeProtein(recipe: Recipe) {
  return sumIngredientField(recipe, "protein");
}

export function recipeFiber(recipe: Recipe) {
  return sumIngredientField(recipe, "fiber");
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
