import type { Ingredient, Recipe } from "./types";

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Used by Recipe Detail's serving-size multiplier and by Cooking Mode's
// ingredient checklist (launched with that same multiplier) to show a scaled
// quantity without touching the recipe's stored data. Non-numeric amounts
// ("a pinch") pass through unscaled since there's nothing to multiply.
export function scaleQuantityDisplay(quantity: string, multiplier: number): string {
  if (multiplier === 1) return quantity;
  const num = parseFloat(quantity);
  if (Number.isNaN(num)) return quantity;
  const scaled = Math.round(num * multiplier * 100) / 100;
  return String(scaled);
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
    isFlex: false,
    flexDefault: false,
  };
}

export function emptySectionHeader(): Ingredient {
  return {
    id: generateId(),
    name: "",
    quantity: "",
    unit: "g",
    calories: "0",
    protein: "0",
    fiber: "0",
    libraryId: null,
    servingMode: "whole",
    isFlex: false,
    flexDefault: false,
    isSectionHeader: true,
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
    if (i.isSectionHeader) return;
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

// A single line of `Recipe.instructions`. A line may start with one or more
// bracketed, comma-separated category tags — e.g. "[SAUCE] Whisk together…"
// — matched case-insensitively against ingredient section titles. Tags are
// always stripped from `text`; no tags means an empty `categories` array.
export type InstructionStep = {
  text: string;
  categories: string[];
};

const STEP_TAG_RE = /^\[([^\]]+)\]\s*/;

export function parseInstructionSteps(instructions: string): InstructionStep[] {
  return (instructions || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(STEP_TAG_RE);
      if (!match) return { text: line, categories: [] };
      const categories = match[1]
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      return { text: line.slice(match[0].length).trim(), categories };
    });
}

// Splits a flat ingredient list into groups at each `isSectionHeader` entry,
// the same grouping Recipe Detail's ingredient table already renders — used
// by Cooking Mode to match a step's category tags to the section they refer
// to. A leading run of ingredients before any header comes back as a group
// with `title: null`; empty groups (two headers back to back) are dropped.
export type IngredientSection = {
  key: string;
  title: string | null;
  items: Ingredient[];
};

export function groupIngredientsBySection(ingredients: Ingredient[]): IngredientSection[] {
  const groups: IngredientSection[] = [{ key: "default", title: null, items: [] }];
  ingredients.forEach((ing) => {
    if (ing.isSectionHeader) {
      groups.push({ key: ing.id, title: ing.name?.trim() || null, items: [] });
    } else {
      groups[groups.length - 1].items.push(ing);
    }
  });
  return groups.filter((g) => g.items.length > 0);
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
