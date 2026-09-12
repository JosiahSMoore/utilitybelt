"use server";

import { createAdminClient } from "@/lib/supabase/server";
import type {
  CustomMeal,
  DailyExtra,
  LibraryIngredient,
  MealSlot,
  Recipe,
  ShoppingItem,
} from "@/lib/types";

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
    .upsert({ date, slot, recipe_id: recipeId, custom_meal: null }, { onConflict: "date,slot" });
  if (error) throw new Error(error.message);
}

export async function assignCustomMealAction(
  date: string,
  slot: MealSlot,
  custom: CustomMeal
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("meal_plan")
    .upsert({ date, slot, recipe_id: null, custom_meal: custom }, { onConflict: "date,slot" });
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

  // Only wipe recipe-derived items — manually/quick-added items are left
  // alone so rebuilding the list from the meal plan doesn't erase them.
  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("source", "recipe");
  if (deleteError) throw new Error(deleteError.message);

  if (items.length > 0) {
    const payload = items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      recipe_names: item.recipes,
      checked: item.checked,
      source: "recipe",
    }));

    const { error: insertError } = await supabase.from("shopping_list_items").insert(payload);
    if (insertError) throw new Error(insertError.message);
  }

  const { data, error } = await supabase.from("shopping_list_items").select("*").order("name");
  if (error) throw new Error(error.message);

  return (data || []).map(rowToShoppingItem);
}

export async function addManualShoppingItemAction(name: string): Promise<ShoppingItem> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert({ name: name.trim(), quantity: 1, unit: "", recipe_names: [], checked: false, source: "manual" })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to add item.");
  return rowToShoppingItem(data);
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

type IngredientLibraryRow = {
  id: string;
  name: string;
  unit: string;
  calories_per_unit: number | string;
  protein_per_unit: number | string;
  fiber_per_unit: number | string;
  pantry_staple: boolean;
};

type LibraryIngredientInput = {
  name: string;
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  fiberPerUnit: number;
  pantryStaple: boolean;
};

function rowToLibraryIngredient(row: IngredientLibraryRow): LibraryIngredient {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    caloriesPerUnit: Number(row.calories_per_unit) || 0,
    proteinPerUnit: Number(row.protein_per_unit) || 0,
    fiberPerUnit: Number(row.fiber_per_unit) || 0,
    pantryStaple: Boolean(row.pantry_staple),
  };
}

export async function saveLibraryIngredientAction(
  input: LibraryIngredientInput
): Promise<LibraryIngredient> {
  const supabase = createAdminClient();
  const name = input.name.trim();
  const payload = {
    unit: input.unit,
    calories_per_unit: input.caloriesPerUnit,
    protein_per_unit: input.proteinPerUnit,
    fiber_per_unit: input.fiberPerUnit,
    pantry_staple: input.pantryStaple,
  };

  const { data: existing, error: findError } = await supabase
    .from("ingredients")
    .select("*")
    .ilike("name", name)
    .maybeSingle<IngredientLibraryRow>();
  if (findError) throw new Error(findError.message);

  const query = existing
    ? supabase.from("ingredients").update(payload).eq("id", existing.id)
    : supabase.from("ingredients").insert({ name, ...payload });

  const { data, error } = await query.select().single<IngredientLibraryRow>();
  if (error || !data) throw new Error(error?.message || "Failed to save ingredient.");

  return rowToLibraryIngredient(data);
}

export async function updateLibraryIngredientAction(
  id: string,
  input: LibraryIngredientInput
): Promise<LibraryIngredient> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ingredients")
    .update({
      name: input.name.trim(),
      unit: input.unit,
      calories_per_unit: input.caloriesPerUnit,
      protein_per_unit: input.proteinPerUnit,
      fiber_per_unit: input.fiberPerUnit,
      pantry_staple: input.pantryStaple,
    })
    .eq("id", id)
    .select()
    .single<IngredientLibraryRow>();
  if (error || !data) throw new Error(error?.message || "Failed to update ingredient.");

  return rowToLibraryIngredient(data);
}

export async function deleteLibraryIngredientAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

type DailyExtraRow = {
  id: string;
  date: string;
  name: string;
  calories: number | string;
};

function rowToDailyExtra(row: DailyExtraRow): DailyExtra {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    calories: Number(row.calories) || 0,
  };
}

export async function addDailyExtraAction(
  date: string,
  name: string,
  calories: number
): Promise<DailyExtra> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("daily_extras")
    .insert({ date, name: name.trim(), calories })
    .select()
    .single<DailyExtraRow>();
  if (error || !data) throw new Error(error?.message || "Failed to add extra.");
  return rowToDailyExtra(data);
}

export async function deleteDailyExtraAction(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("daily_extras").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
