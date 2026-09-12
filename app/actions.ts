"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type { MealSlot, Recipe, ShoppingItem } from "@/lib/types";

type RecipeRow = {
  id: string;
  name: string;
  category: string;
  servings: number;
  ingredients: Recipe["ingredients"];
  instructions: string;
};

function rowToShoppingItem(row: {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  recipe_names: string[] | null;
  checked: boolean;
}): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
    recipes: row.recipe_names || [],
    checked: row.checked,
  };
}

export async function saveRecipeAction(recipe: Recipe): Promise<Recipe> {
  const supabase = createAdminClient();
  const payload = {
    name: recipe.name,
    category: recipe.category,
    servings: Number(recipe.servings) || 1,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
  };

  const query = recipe.id
    ? supabase.from("recipes").update(payload).eq("id", recipe.id)
    : supabase.from("recipes").insert(payload);

  const { data, error } = await query.select().single<RecipeRow>();
  if (error || !data) throw new Error(error?.message || "Failed to save recipe.");

  return {
    id: data.id,
    name: data.name,
    category: data.category,
    servings: data.servings,
    ingredients: data.ingredients,
    instructions: data.instructions,
  };
}

export async function deleteRecipeAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function assignMealAction(
  date: string,
  slot: MealSlot,
  recipeId: string
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .upsert({ date, slot, recipe_id: recipeId }, { onConflict: "date,slot" });
  if (error) throw new Error(error.message);
}

export async function clearMealAction(date: string, slot: MealSlot): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .delete()
    .eq("date", date)
    .eq("slot", slot);
  if (error) throw new Error(error.message);
}

export async function syncShoppingListAction(
  items: ShoppingItem[]
): Promise<ShoppingItem[]> {
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .gte("created_at", "1970-01-01");
  if (deleteError) throw new Error(deleteError.message);

  if (items.length === 0) return [];

  const payload = items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    recipe_names: item.recipes,
    checked: item.checked,
  }));

  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert(payload)
    .select();
  if (error) throw new Error(error.message);

  return (data || []).map(rowToShoppingItem);
}

export async function toggleShoppingItemAction(
  id: string,
  checked: boolean
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ checked })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteShoppingItemsAction(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("shopping_list_items").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
