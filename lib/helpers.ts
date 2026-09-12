import type { Ingredient, Recipe } from "./types";

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyIngredient(): Ingredient {
  return { id: generateId(), name: "", quantity: "", unit: "g", calories: "" };
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

export function recipeCalories(recipe: Recipe) {
  const total = (recipe.ingredients || []).reduce(
    (sum, i) => sum + (parseFloat(i.calories) || 0),
    0
  );
  const servings = parseFloat(String(recipe.servings)) || 1;
  return { total: Math.round(total), perServing: Math.round(total / servings) };
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
