"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Home as HomeIcon,
  BookOpen,
  CalendarDays,
  ShoppingCart,
  Plus,
  X,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Search,
  Printer,
  Check,
  Flame,
  Dumbbell,
  Wheat,
  Package,
  SlidersHorizontal,
  Star,
  ChefHat,
  Minus,
} from "lucide-react";
import {
  addDailyExtraAction,
  addManualShoppingItemAction,
  assignCustomMealAction,
  assignMealAction,
  clearMealAction,
  deleteDailyExtraAction,
  deleteLibraryIngredientAction,
  deleteRecipeAction,
  deleteShoppingItemsAction,
  saveLibraryIngredientAction,
  saveRecipeAction,
  syncShoppingListAction,
  toggleShoppingItemAction,
  updateFlexSelectionAction,
  updateLibraryIngredientAction,
} from "@/app/actions";
import { CATEGORIES, CATEGORY_STYLE, MEAL_SLOTS, SLOT_LABEL, UNITS } from "@/lib/constants";
import {
  defaultFlexIds,
  emptyIngredient,
  emptyRecipe,
  emptySectionHeader,
  generateId,
  getNext7Days,
  groupIngredientsBySection,
  hasFlexIngredients,
  parseInstructionSteps,
  recipeCalories,
  recipeFiber,
  recipeProtein,
  scaleQuantityDisplay,
} from "@/lib/helpers";
import type {
  CustomMeal,
  DailyExtra,
  Ingredient,
  LibraryIngredient,
  MealPlan,
  MealSlot,
  MealSlotValue,
  Recipe,
  ShoppingItem,
} from "@/lib/types";

type View =
  | "home"
  | "addRecipe"
  | "browse"
  | "recipeDetail"
  | "mealPlan"
  | "shoppingList"
  | "ingredientLibrary";

type DayNutrition = { calories: number; protein: number; fiber: number };

type LibraryIngredientInput = {
  name: string;
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  fiberPerUnit: number;
  pantryStaple: boolean;
};

// Keying checked-ingredient/step state by date+slot (when launched from a
// scheduled meal) keeps each occurrence's cooking session independent, same
// as flexSelection already is; launched from Recipe Detail with no
// date/slot, it just keys off the recipe.
function cookingSessionKey(recipeId: string, date?: string, slot?: MealSlot): string {
  return `cookingMode:${recipeId}${date && slot ? `:${date}:${slot}` : ""}`;
}

function slotDisplayName(slot: MealSlotValue | null | undefined, recipes: Recipe[]): string | null {
  if (!slot) return null;
  if (slot.custom) return slot.custom.name;
  if (slot.recipeId) return recipes.find((r) => r.id === slot.recipeId)?.name ?? null;
  return null;
}

function NutritionChips({ nutrition, size = "sm" }: { nutrition: DayNutrition; size?: "sm" | "xs" }) {
  const textSize = size === "xs" ? "text-[10px]" : "text-sm";
  const iconSize = size === "xs" ? 9 : 15;
  return (
    <div className={`flex items-center gap-3 font-medium ${textSize}`}>
      <span className="flex items-center gap-1 text-orange-800">
        <Flame size={iconSize} /> {nutrition.calories} cal
      </span>
      <span className="flex items-center gap-1 text-emerald-800">
        <Dumbbell size={iconSize} /> {nutrition.protein}g
      </span>
      <span className="flex items-center gap-1 text-[#7a5230]">
        <Wheat size={iconSize} /> {nutrition.fiber}g
      </span>
    </div>
  );
}

function useToast(): [string | null, (msg: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function show(msg: string) {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }
  return [message, show];
}

export default function LarderApp({
  initialRecipes,
  initialMealPlan,
  initialShoppingList,
  initialIngredientLibrary,
  initialDailyExtras,
  initialView,
}: {
  initialRecipes: Recipe[];
  initialMealPlan: MealPlan;
  initialShoppingList: ShoppingItem[];
  initialIngredientLibrary: LibraryIngredient[];
  initialDailyExtras: DailyExtra[];
  initialView?: View;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [mealPlan, setMealPlan] = useState<MealPlan>(initialMealPlan);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(initialShoppingList);
  const [ingredientLibrary, setIngredientLibrary] = useState<LibraryIngredient[]>(
    initialIngredientLibrary
  );
  const [dailyExtras, setDailyExtras] = useState<DailyExtra[]>(initialDailyExtras);

  const [view, setView] = useState<View>(initialView ?? "home");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [modifySlot, setModifySlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [slotActionTarget, setSlotActionTarget] = useState<{ date: string; slot: MealSlot } | null>(
    null
  );
  const [cookingSession, setCookingSession] = useState<{
    recipe: Recipe;
    flexIds: string[];
    date?: string;
    slot?: MealSlot;
    servingMultiplier: number;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [extrasDate, setExtrasDate] = useState<string | null>(null);

  const [browseQuery, setBrowseQuery] = useState("");
  const [browseCategory, setBrowseCategory] = useState("All");

  const [toast, showToast] = useToast();

  const days = useMemo(() => getNext7Days(), []);

  async function saveRecipe(recipe: Recipe) {
    try {
      const saved = await saveRecipeAction(recipe);
      const exists = recipes.some((r) => r.id === saved.id);
      const next = exists
        ? recipes.map((r) => (r.id === saved.id ? saved : r))
        : [...recipes, saved];
      setRecipes(next);
      setEditingRecipe(null);
      setView("browse");
      showToast(exists ? "Recipe updated." : "Recipe saved.");
    } catch {
      showToast("Couldn't save recipe — try again.");
    }
  }

  async function deleteRecipe(id: string) {
    try {
      await deleteRecipeAction(id);
      const next = recipes.filter((r) => r.id !== id);
      const nextPlan: MealPlan = {};
      Object.entries(mealPlan).forEach(([date, slots]) => {
        const cleaned = { ...slots };
        MEAL_SLOTS.forEach((mt) => {
          if (cleaned[mt]?.recipeId === id) cleaned[mt] = null;
        });
        nextPlan[date] = cleaned;
      });
      setRecipes(next);
      setMealPlan(nextPlan);
      setConfirmDeleteId(null);
      setSelectedRecipeId(null);
      setView("browse");
      showToast("Recipe deleted.");
    } catch {
      showToast("Couldn't delete recipe — try again.");
    }
  }

  async function assignMeal(date: string, slot: MealSlot, recipeId: string) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const flexSelection = recipe ? defaultFlexIds(recipe) : [];
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { recipeId, custom: null, flexSelection } },
    };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await assignMealAction(date, slot, recipeId, flexSelection);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't save that meal — try again.");
    }
  }

  async function updateFlexSelection(date: string, slot: MealSlot, flexSelection: string[]) {
    const currentSlot = mealPlan[date]?.[slot];
    if (!currentSlot) return;
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { ...currentSlot, flexSelection } },
    };
    setMealPlan(next);
    setModifySlot(null);
    try {
      await updateFlexSelectionAction(date, slot, flexSelection);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't update that meal — try again.");
    }
  }

  async function assignCustomMeal(date: string, slot: MealSlot, custom: CustomMeal) {
    const prev = mealPlan;
    const next = {
      ...mealPlan,
      [date]: { ...(mealPlan[date] || {}), [slot]: { recipeId: null, custom } },
    };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await assignCustomMealAction(date, slot, custom);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't save that meal — try again.");
    }
  }

  async function clearMeal(date: string, slot: MealSlot) {
    const prev = mealPlan;
    const next = { ...mealPlan, [date]: { ...(mealPlan[date] || {}), [slot]: null } };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await clearMealAction(date, slot);
    } catch {
      setMealPlan(prev);
      showToast("Couldn't clear that meal — try again.");
    }
  }

  function dayNutrition(date: string) {
    const slots = mealPlan[date] || {};
    const fromMeals = MEAL_SLOTS.reduce(
      (acc, mt) => {
        const slot = slots[mt];
        if (slot?.custom) {
          return {
            calories: acc.calories + slot.custom.calories,
            protein: acc.protein + slot.custom.protein,
            fiber: acc.fiber + slot.custom.fiber,
          };
        }
        const r = recipes.find((rc) => rc.id === slot?.recipeId);
        if (!r) return acc;
        const flexIds = slot?.flexSelection;
        return {
          calories: acc.calories + recipeCalories(r, flexIds).perServing,
          protein: acc.protein + recipeProtein(r, flexIds).perServing,
          fiber: acc.fiber + recipeFiber(r, flexIds).perServing,
        };
      },
      { calories: 0, protein: 0, fiber: 0 }
    );
    const extraCalories = dailyExtras
      .filter((e) => e.date === date)
      .reduce((sum, e) => sum + e.calories, 0);
    return { ...fromMeals, calories: fromMeals.calories + extraCalories };
  }

  async function buildShoppingList() {
    const map: Record<
      string,
      { name: string; unit: string; quantity: number; recipes: Set<string> }
    > = {};

    days.forEach((day) => {
      const slots = mealPlan[day.date];
      if (!slots) return;
      MEAL_SLOTS.forEach((mt) => {
        const slotValue = slots[mt];
        const recipe = recipes.find((r) => r.id === slotValue?.recipeId);
        if (!recipe) return;
        const servings = parseFloat(String(recipe.servings)) || 1;
        const flexIds = slotValue?.flexSelection;
        (recipe.ingredients || []).forEach((ing) => {
          if (ing.isSectionHeader) return;
          if (!ing.name || !ing.name.trim()) return;
          const linkedLibraryEntry = ing.libraryId
            ? ingredientLibrary.find((l) => l.id === ing.libraryId)
            : null;
          if (linkedLibraryEntry?.pantryStaple) return;
          if (ing.isFlex) {
            const isOn = flexIds ? flexIds.includes(ing.id) : Boolean(ing.flexDefault);
            if (!isOn) return;
          }
          const key = ing.name.trim().toLowerCase() + "|" + (ing.unit || "");
          const enteredQty = parseFloat(ing.quantity) || 0;
          // "Whole recipe" quantities are already the total to buy. "Per
          // serving" quantities (toppings, garnishes) need scaling up by
          // how many servings the recipe makes.
          const qty = ing.servingMode === "perServing" ? enteredQty * servings : enteredQty;
          if (!map[key]) {
            map[key] = { name: ing.name.trim(), unit: ing.unit || "", quantity: 0, recipes: new Set() };
          }
          map[key].quantity += qty;
          map[key].recipes.add(recipe.name);
        });
      });
    });

    const list: ShoppingItem[] = Object.values(map)
      .map((item) => ({
        id: generateId(),
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        recipes: Array.from(item.recipes),
        checked: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    try {
      const saved = await syncShoppingListAction(list);
      setShoppingList(saved);
      setView("shoppingList");
      showToast(saved.length ? "Shopping list ready." : "No meals planned yet — nothing to shop for.");
    } catch {
      showToast("Couldn't build the shopping list — try again.");
    }
  }

  async function toggleShoppingItem(id: string) {
    const prev = shoppingList;
    const next = shoppingList.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    setShoppingList(next);
    const item = next.find((i) => i.id === id);
    try {
      if (item) await toggleShoppingItemAction(id, item.checked);
    } catch {
      setShoppingList(prev);
      showToast("Couldn't update that item — try again.");
    }
  }

  async function clearCheckedItems() {
    const checkedIds = shoppingList.filter((i) => i.checked).map((i) => i.id);
    if (checkedIds.length === 0) return;
    const prev = shoppingList;
    const next = shoppingList.filter((i) => !i.checked);
    setShoppingList(next);
    try {
      await deleteShoppingItemsAction(checkedIds);
      showToast("Removed purchased items.");
    } catch {
      setShoppingList(prev);
      showToast("Couldn't clear checked items — try again.");
    }
  }

  async function addManualShoppingItem(name: string) {
    if (!name.trim()) return;
    try {
      const saved = await addManualShoppingItemAction(name);
      setShoppingList((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      showToast("Added to shopping list.");
    } catch {
      showToast("Couldn't add that item — try again.");
    }
  }

  async function saveLibraryIngredient(
    input: LibraryIngredientInput
  ): Promise<LibraryIngredient | null> {
    try {
      const saved = await saveLibraryIngredientAction(input);
      setIngredientLibrary((prev) => {
        const exists = prev.some((i) => i.id === saved.id);
        const next = exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      return saved;
    } catch {
      showToast("Couldn't save to ingredient library — try again.");
      return null;
    }
  }

  async function updateLibraryIngredient(
    id: string,
    input: LibraryIngredientInput
  ): Promise<LibraryIngredient | null> {
    try {
      const saved = await updateLibraryIngredientAction(id, input);
      setIngredientLibrary((prev) =>
        prev.map((i) => (i.id === saved.id ? saved : i)).sort((a, b) => a.name.localeCompare(b.name))
      );
      showToast("Ingredient updated.");
      return saved;
    } catch {
      showToast("Couldn't update ingredient — that name might already be in use.");
      return null;
    }
  }

  async function deleteLibraryIngredient(id: string) {
    const prev = ingredientLibrary;
    setIngredientLibrary((cur) => cur.filter((i) => i.id !== id));
    try {
      await deleteLibraryIngredientAction(id);
      showToast("Ingredient removed from library.");
    } catch {
      setIngredientLibrary(prev);
      showToast("Couldn't delete ingredient — try again.");
    }
  }

  async function addDailyExtra(date: string, name: string, calories: number) {
    try {
      const saved = await addDailyExtraAction(date, name, calories);
      setDailyExtras((prev) => [...prev, saved]);
    } catch {
      showToast("Couldn't add that — try again.");
    }
  }

  async function deleteDailyExtra(id: string) {
    const prev = dailyExtras;
    setDailyExtras((cur) => cur.filter((e) => e.id !== id));
    try {
      await deleteDailyExtraAction(id);
    } catch {
      setDailyExtras(prev);
      showToast("Couldn't remove that — try again.");
    }
  }

  const filteredRecipes = recipes.filter((r) => {
    const matchesQuery = r.name.toLowerCase().includes(browseQuery.toLowerCase());
    const matchesCategory = browseCategory === "All" || r.category === browseCategory;
    return matchesQuery && matchesCategory;
  });

  const todaysPlan = mealPlan[days[0]?.date] || {};

  return (
    <div className="min-h-screen bg-stone-100 pb-20 md:pb-8">
      <TopBar view={view} setView={setView} />

      <main className="max-w-5xl mx-auto px-4 pt-6 md:pt-10">
        {view === "home" && (
          <HomeView
            recipes={recipes}
            days={days}
            todaysPlan={todaysPlan}
            dayNutrition={dayNutrition}
            setView={setView}
            setEditingRecipe={setEditingRecipe}
            onQuickAdd={addManualShoppingItem}
          />
        )}

        {view === "addRecipe" && (
          <RecipeForm
            initial={editingRecipe || emptyRecipe()}
            onCancel={() => {
              setEditingRecipe(null);
              setView(editingRecipe ? "recipeDetail" : "browse");
            }}
            onSave={saveRecipe}
            ingredientLibrary={ingredientLibrary}
            onSaveLibraryIngredient={saveLibraryIngredient}
          />
        )}

        {view === "browse" && (
          <BrowseView
            recipes={filteredRecipes}
            query={browseQuery}
            setQuery={setBrowseQuery}
            category={browseCategory}
            setCategory={setBrowseCategory}
            onOpen={(id) => {
              setSelectedRecipeId(id);
              setView("recipeDetail");
            }}
            onAdd={() => {
              setEditingRecipe(null);
              setView("addRecipe");
            }}
            onManageIngredients={() => setView("ingredientLibrary")}
          />
        )}

        {view === "ingredientLibrary" && (
          <IngredientLibraryView
            library={ingredientLibrary}
            onAdd={saveLibraryIngredient}
            onUpdate={updateLibraryIngredient}
            onDelete={deleteLibraryIngredient}
            onBack={() => setView("browse")}
          />
        )}

        {view === "recipeDetail" &&
          (() => {
            const recipe = recipes.find((r) => r.id === selectedRecipeId);
            if (!recipe) {
              setView("browse");
              return null;
            }
            return (
              <RecipeDetail
                recipe={recipe}
                onBack={() => setView("browse")}
                onEdit={() => {
                  setEditingRecipe(recipe);
                  setView("addRecipe");
                }}
                onDelete={() => setConfirmDeleteId(recipe.id)}
                onPrint={() => showToast("4×6 label export is coming in a future version.")}
                onStartCooking={(multiplier) =>
                  setCookingSession({
                    recipe,
                    flexIds: defaultFlexIds(recipe),
                    servingMultiplier: multiplier,
                  })
                }
              />
            );
          })()}

        {view === "mealPlan" && (
          <MealPlanView
            days={days}
            mealPlan={mealPlan}
            recipes={recipes}
            dailyExtras={dailyExtras}
            dayNutrition={dayNutrition}
            activeDayIdx={activeDayIdx}
            setActiveDayIdx={setActiveDayIdx}
            openPicker={(date, slot) => setPickerSlot({ date, slot })}
            openExtras={(date) => setExtrasDate(date)}
            openSlotActions={(date, slot) => setSlotActionTarget({ date, slot })}
            onBuildList={buildShoppingList}
          />
        )}

        {view === "shoppingList" && (
          <ShoppingListView
            list={shoppingList}
            onToggle={toggleShoppingItem}
            onRebuild={buildShoppingList}
            onClearChecked={clearCheckedItems}
            onAdd={addManualShoppingItem}
          />
        )}
      </main>

      {pickerSlot && (
        <RecipePickerModal
          recipes={recipes}
          slot={pickerSlot}
          current={(mealPlan[pickerSlot.date] || {})[pickerSlot.slot] || null}
          onPick={(id) => assignMeal(pickerSlot.date, pickerSlot.slot, id)}
          onSaveCustom={(custom) => assignCustomMeal(pickerSlot.date, pickerSlot.slot, custom)}
          onClear={() => clearMeal(pickerSlot.date, pickerSlot.slot)}
          onClose={() => setPickerSlot(null)}
          onAddNew={() => {
            setPickerSlot(null);
            setEditingRecipe(null);
            setView("addRecipe");
          }}
        />
      )}

      {extrasDate && (
        <ExtrasModal
          date={extrasDate}
          extras={dailyExtras.filter((e) => e.date === extrasDate)}
          ingredientLibrary={ingredientLibrary}
          onAdd={(name, calories) => addDailyExtra(extrasDate, name, calories)}
          onDelete={deleteDailyExtra}
          onClose={() => setExtrasDate(null)}
        />
      )}

      {modifySlot &&
        (() => {
          const slotValue = mealPlan[modifySlot.date]?.[modifySlot.slot];
          const recipe = slotValue?.recipeId
            ? recipes.find((r) => r.id === slotValue.recipeId)
            : null;
          if (!recipe) {
            setModifySlot(null);
            return null;
          }
          return (
            <FlexModifyModal
              recipeName={recipe.name}
              flexIngredients={recipe.ingredients.filter((i) => i.isFlex)}
              selected={slotValue?.flexSelection ?? defaultFlexIds(recipe)}
              onSave={(ids) => updateFlexSelection(modifySlot.date, modifySlot.slot, ids)}
              onClose={() => setModifySlot(null)}
            />
          );
        })()}

      {slotActionTarget &&
        (() => {
          const slotValue = mealPlan[slotActionTarget.date]?.[slotActionTarget.slot];
          if (!slotValue || (!slotValue.recipeId && !slotValue.custom)) {
            setSlotActionTarget(null);
            return null;
          }
          const recipe = slotValue.recipeId
            ? recipes.find((r) => r.id === slotValue.recipeId) ?? null
            : null;
          const canModify = Boolean(recipe && hasFlexIngredients(recipe));
          const canCook = Boolean(recipe);
          const name = slotValue.custom ? slotValue.custom.name : recipe?.name ?? "";
          return (
            <MealSlotActionModal
              name={name}
              canModify={canModify}
              canCook={canCook}
              onRemove={() => {
                clearMeal(slotActionTarget.date, slotActionTarget.slot);
                setSlotActionTarget(null);
              }}
              onModify={() => {
                setModifySlot(slotActionTarget);
                setSlotActionTarget(null);
              }}
              onCook={() => {
                if (recipe) {
                  setCookingSession({
                    recipe,
                    flexIds: slotValue.flexSelection ?? defaultFlexIds(recipe),
                    date: slotActionTarget.date,
                    slot: slotActionTarget.slot,
                    servingMultiplier: 1,
                  });
                }
                setSlotActionTarget(null);
              }}
              onClose={() => setSlotActionTarget(null)}
            />
          );
        })()}

      {cookingSession && (
        <CookingModeView
          recipe={cookingSession.recipe}
          flexIds={cookingSession.flexIds}
          servingMultiplier={cookingSession.servingMultiplier}
          sessionKey={cookingSessionKey(
            cookingSession.recipe.id,
            cookingSession.date,
            cookingSession.slot
          )}
          onClose={() => setCookingSession(null)}
        />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this recipe? It'll be removed from any planned meals too."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteRecipe(confirmDeleteId)}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-stone-900 text-amber-50 text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}

      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* ---------- Navigation ---------- */

function NavItems({
  view,
  setView,
  orientation,
}: {
  view: View;
  setView: (v: View) => void;
  orientation: "row" | "col";
}) {
  const items: { key: View; label: string; Icon: typeof HomeIcon }[] = [
    { key: "home", label: "Home", Icon: HomeIcon },
    { key: "browse", label: "Recipes", Icon: BookOpen },
    { key: "mealPlan", label: "Meal Plan", Icon: CalendarDays },
    { key: "shoppingList", label: "Shopping", Icon: ShoppingCart },
  ];
  const isRow = orientation === "row";
  return (
    <>
      {items.map(({ key, label, Icon }) => {
        const active =
          view === key ||
          (key === "browse" &&
            (view === "recipeDetail" || view === "addRecipe" || view === "ingredientLibrary"));
        return (
          <button
            key={key}
            onClick={() => setView(key)}
            className={
              isRow
                ? `flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    active ? "bg-emerald-800 text-amber-50" : "text-stone-600 hover:bg-stone-200"
                  }`
                : `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-xs font-medium ${
                    active ? "text-emerald-800" : "text-stone-400"
                  }`
            }
          >
            <Icon size={isRow ? 16 : 20} strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </button>
        );
      })}
    </>
  );
}

function TopBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <header className="hidden md:flex items-center justify-between max-w-5xl mx-auto px-4 pt-6">
      <button onClick={() => setView("home")} className="font-display text-2xl text-stone-900 tracking-tight">
        The Larder
      </button>
      <nav className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-full">
        <NavItems view={view} setView={setView} orientation="row" />
      </nav>
    </header>
  );
}

function BottomNav({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-amber-50 border-t border-stone-200 flex z-40">
      <NavItems view={view} setView={setView} orientation="col" />
    </nav>
  );
}

/* ---------- Home ---------- */

function HomeView({
  recipes,
  days,
  todaysPlan,
  dayNutrition,
  setView,
  setEditingRecipe,
  onQuickAdd,
}: {
  recipes: Recipe[];
  days: ReturnType<typeof getNext7Days>;
  todaysPlan: MealPlan[string];
  dayNutrition: (date: string) => DayNutrition;
  setView: (v: View) => void;
  setEditingRecipe: (r: Recipe | null) => void;
  onQuickAdd: (name: string) => void;
}) {
  const today = days[0];
  const [quickAddName, setQuickAddName] = useState("");

  function submitQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!quickAddName.trim()) return;
    onQuickAdd(quickAddName.trim());
    setQuickAddName("");
  }

  return (
    <div>
      <div className="mb-6 md:hidden">
        <h1 className="font-display text-3xl text-stone-900">The Larder</h1>
        <p className="text-stone-500 text-sm mt-1">Your recipes, meal plan, and shopping list.</p>
      </div>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5 mb-8">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-display text-xl text-stone-900">
            Today · {today.weekday} {today.month} {today.dayNum}
          </h2>
          <NutritionChips nutrition={dayNutrition(today.date)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {MEAL_SLOTS.map((slot) => {
            const name = slotDisplayName(todaysPlan[slot], recipes);
            return (
              <div key={slot} className="text-sm">
                <p className="text-stone-400 uppercase tracking-wide text-[11px] mb-1 flex items-center gap-1">
                  {SLOT_LABEL[slot]}
                  {name && <Check size={11} className="text-emerald-600" strokeWidth={3} />}
                </p>
                <p className="text-stone-800 font-medium truncate">{name || "—"}</p>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setView("mealPlan")}
          className="mt-4 text-sm text-emerald-800 font-medium hover:underline"
        >
          Go to meal plan →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <ActionCard
          title="Add a recipe"
          subtitle="Write down something new"
          Icon={Plus}
          accent="bg-emerald-800"
          onClick={() => {
            setEditingRecipe(null);
            setView("addRecipe");
          }}
        />
        <ActionCard
          title="Build meal plan"
          subtitle="Plan the next 7 days"
          Icon={CalendarDays}
          accent="bg-orange-700"
          onClick={() => setView("mealPlan")}
        />
        <ActionCard
          title="Browse recipes"
          subtitle={`${recipes.length} saved`}
          Icon={BookOpen}
          accent="bg-stone-700"
          onClick={() => setView("browse")}
        />
      </div>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-5 mb-8">
        <h2 className="font-display text-lg text-stone-900 mb-3">Quick add to shopping list</h2>
        <form onSubmit={submitQuickAdd} className="flex gap-2">
          <input
            value={quickAddName}
            onChange={(e) => setQuickAddName(e.target.value)}
            placeholder="e.g. Paper towels"
            className="flex-1 px-3 py-2 rounded-full border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
          <button
            type="submit"
            disabled={!quickAddName.trim()}
            className="flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full disabled:opacity-40"
          >
            <Plus size={15} /> Add
          </button>
        </form>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  subtitle,
  Icon,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  Icon: typeof HomeIcon;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-amber-50 border border-stone-200 rounded-2xl p-5 hover:border-stone-300 hover:shadow-sm transition-all"
    >
      <div className={`w-10 h-10 rounded-full ${accent} flex items-center justify-center mb-4`}>
        <Icon size={18} className="text-amber-50" />
      </div>
      <p className="font-display text-lg text-stone-900">{title}</p>
      <p className="text-stone-500 text-sm mt-0.5">{subtitle}</p>
    </button>
  );
}

/* ---------- Browse ---------- */

function BrowseView({
  recipes,
  query,
  setQuery,
  category,
  setCategory,
  onOpen,
  onAdd,
  onManageIngredients,
}: {
  recipes: Recipe[];
  query: string;
  setQuery: (q: string) => void;
  category: string;
  setCategory: (c: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onManageIngredients: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-stone-900">Recipes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onManageIngredients}
            className="flex items-center gap-1.5 border border-stone-200 text-stone-600 text-sm font-medium px-3.5 py-2 rounded-full hover:bg-stone-100"
          >
            <BookOpen size={15} /> Manage ingredients
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-3.5 py-2 rounded-full"
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full pl-9 pr-3 py-2 rounded-full border border-stone-200 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border ${
                category === c ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {recipes.length === 0 ? (
        <EmptyState
          title="No recipes yet"
          body="Add your first recipe to start building your book."
          actionLabel="Add a recipe"
          onAction={onAdd}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {recipes.map((r) => {
            const { perServing } = recipeCalories(r);
            const { perServing: proteinPerServing } = recipeProtein(r);
            const { perServing: fiberPerServing } = recipeFiber(r);
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="text-left bg-amber-50 border border-stone-200 rounded-xl p-4 hover:border-stone-300 hover:shadow-sm transition-all"
              >
                <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${CATEGORY_STYLE[r.category]}`}>
                  {r.category}
                </span>
                <p className="font-display text-lg text-stone-900 leading-snug">{r.name || "Untitled recipe"}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-stone-500 flex-wrap">
                  <span>{r.ingredients.length} ingredients</span>
                  <span className="flex items-center gap-1 text-orange-800 font-medium">
                    <Flame size={12} /> {perServing} cal
                  </span>
                  <span className="flex items-center gap-1 text-emerald-800 font-medium">
                    <Dumbbell size={12} /> {proteinPerServing}g
                  </span>
                  <span className="flex items-center gap-1 text-[#7a5230] font-medium">
                    <Wheat size={12} /> {fiberPerServing}g
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="text-center py-16 border border-dashed border-stone-300 rounded-2xl">
      <p className="font-display text-xl text-stone-800">{title}</p>
      <p className="text-stone-500 text-sm mt-1">{body}</p>
      {actionLabel && (
        <button onClick={onAction} className="mt-4 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ---------- Recipe Detail ---------- */

function RecipeDetail({
  recipe,
  onBack,
  onEdit,
  onDelete,
  onPrint,
  onStartCooking,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
  onStartCooking: (servingMultiplier: number) => void;
}) {
  const [multiplier, setMultiplier] = useState(1);
  const { perServing } = recipeCalories(recipe);
  const { perServing: proteinPerServing } = recipeProtein(recipe);
  const { perServing: fiberPerServing } = recipeFiber(recipe);
  const fixedIngredients = recipe.ingredients.filter((i) => !i.isFlex);
  const flexIngredients = recipe.ingredients.filter((i) => i.isFlex);
  const steps = parseInstructionSteps(recipe.instructions);
  const baseServings = parseFloat(String(recipe.servings)) || 0;
  const scaledServings = Math.round(baseServings * multiplier * 10) / 10;
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mb-2 ${CATEGORY_STYLE[recipe.category]}`}>
              {recipe.category}
            </span>
            <h1 className="font-display text-3xl text-stone-900">{recipe.name}</h1>
            <div className="flex items-center gap-3 flex-wrap mt-1.5">
              <span className="text-stone-500 text-sm">
                {scaledServings} serving{scaledServings === 1 ? "" : "s"}
              </span>
              <NutritionChips
                nutrition={{ calories: perServing, protein: proteinPerServing, fiber: fiberPerServing }}
                size="sm"
              />
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-full p-1">
              <button
                onClick={() => setMultiplier((m) => Math.max(0.5, Math.round((m - 0.5) * 10) / 10))}
                title="Scale recipe down"
                className="w-7 h-7 flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
              >
                <Minus size={13} />
              </button>
              <span className="text-xs font-medium text-stone-700 w-8 text-center">{multiplier}×</span>
              <button
                onClick={() => setMultiplier((m) => Math.round((m + 0.5) * 10) / 10)}
                title="Scale recipe up"
                className="w-7 h-7 flex items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
              >
                <Plus size={13} />
              </button>
            </div>
            <button
              onClick={() => onStartCooking(multiplier)}
              className="flex items-center gap-1.5 bg-amber-700 text-amber-50 text-sm font-medium px-3.5 py-2 rounded-full"
            >
              <ChefHat size={15} /> Start cooking
            </button>
            <button
              onClick={onPrint}
              title="Export as 4×6 label PDF (coming soon)"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100"
            >
              <Printer size={15} />
            </button>
            <button
              onClick={onEdit}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-stone-600 hover:bg-stone-100"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onDelete}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 text-orange-700 hover:bg-orange-50"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-6">
          <div className="md:col-span-1">
            <h2 className="font-display text-lg text-stone-900 mb-3">Ingredients</h2>
            <table className="w-full text-sm">
              <tbody>
                {fixedIngredients.map((ing) =>
                  ing.isSectionHeader ? (
                    <tr key={ing.id}>
                      <td colSpan={2} className="pt-4 pb-1.5 first:pt-0">
                        {ing.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wide whitespace-nowrap">
                              {ing.name}
                            </span>
                            <div className="flex-1 border-t border-stone-200" />
                          </div>
                        ) : (
                          <div className="border-t border-stone-200" />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={ing.id} className="border-b border-stone-200 last:border-0">
                      <td className="py-2 text-stone-800">
                        {ing.name}
                        {ing.servingMode === "perServing" && (
                          <span className="text-[10px] text-stone-400 ml-1.5">/serving</span>
                        )}
                      </td>
                      <td className="py-2 text-stone-500 text-right whitespace-nowrap">
                        {scaleQuantityDisplay(ing.quantity, multiplier)} {ing.unit}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>

            {flexIngredients.length > 0 && (
              <div className="mt-5 pt-4 border-t border-dashed border-stone-300">
                <h3 className="flex items-center gap-1.5 text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">
                  <SlidersHorizontal size={12} /> Flexible ingredients
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {flexIngredients.map((ing) => (
                      <tr key={ing.id} className="border-b border-stone-200 last:border-0">
                        <td className="py-2 text-stone-800">
                          <span className="flex items-center gap-1.5">
                            {ing.name}
                            {ing.flexDefault && (
                              <Star size={11} className="text-amber-500 fill-amber-500" />
                            )}
                          </span>
                        </td>
                        <td className="py-2 text-stone-500 text-right whitespace-nowrap">
                          {scaleQuantityDisplay(ing.quantity, multiplier)} {ing.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-stone-400 mt-2 flex items-center gap-1">
                  <Star size={10} className="text-amber-500 fill-amber-500" /> = included by default when
                  scheduled
                </p>
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <h2 className="font-display text-lg text-stone-900 mb-3">Instructions</h2>
            {steps.length === 0 ? (
              <p className="text-stone-500 text-sm">No instructions added.</p>
            ) : (
              <ol className="space-y-3">
                {steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="font-display text-stone-400 flex-shrink-0 w-5">{idx + 1}</span>
                    <div>
                      {step.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {step.categories.map((c) => (
                            <span
                              key={c}
                              className="text-[10px] font-medium uppercase tracking-wide bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-stone-700 leading-relaxed">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Recipe Form ---------- */

function RecipeForm({
  initial,
  onCancel,
  onSave,
  ingredientLibrary,
  onSaveLibraryIngredient,
}: {
  initial: Recipe;
  onCancel: () => void;
  onSave: (r: Recipe) => void;
  ingredientLibrary: LibraryIngredient[];
  onSaveLibraryIngredient: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
}) {
  const [recipe, setRecipe] = useState<Recipe>(initial);

  function updateField<K extends keyof Recipe>(field: K, value: Recipe[K]) {
    setRecipe((r) => ({ ...r, [field]: value }));
  }

  function updateIngredient<K extends keyof Ingredient>(id: string, field: K, value: Ingredient[K]) {
    setRecipe((r) => ({
      ...r,
      ingredients: r.ingredients.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)),
    }));
  }

  function addIngredientRow() {
    setRecipe((r) => ({ ...r, ingredients: [...r.ingredients, emptyIngredient()] }));
  }

  function addFlexIngredientRow() {
    setRecipe((r) => ({
      ...r,
      ingredients: [...r.ingredients, { ...emptyIngredient(), isFlex: true, flexDefault: false }],
    }));
  }

  function addSectionHeader() {
    setRecipe((r) => ({ ...r, ingredients: [...r.ingredients, emptySectionHeader()] }));
  }

  function removeIngredientRow(id: string) {
    setRecipe((r) => ({ ...r, ingredients: r.ingredients.filter((ing) => ing.id !== id) }));
  }

  function handleSave() {
    if (!recipe.name.trim()) return;
    // Section headers are kept regardless of title (blank is a valid,
    // untitled divider) — only blank-named real ingredient rows get dropped.
    const cleanedIngredients = recipe.ingredients.filter((i) => i.isSectionHeader || i.name.trim());
    const cleanedFixed = cleanedIngredients.filter((i) => !i.isFlex);
    const cleanedFlex = cleanedIngredients.filter((i) => i.isFlex);
    const finalFixed = cleanedFixed.length === 0 ? [emptyIngredient()] : cleanedFixed;
    onSave({ ...recipe, ingredients: [...finalFixed, ...cleanedFlex] });
  }

  const fixedIngredients = recipe.ingredients.filter((i) => !i.isFlex);
  const flexIngredients = recipe.ingredients.filter((i) => i.isFlex);
  const realFixedCount = fixedIngredients.filter((i) => !i.isSectionHeader).length;

  const { perServing } = recipeCalories(recipe);
  const { perServing: proteinPerServing } = recipeProtein(recipe);
  const { perServing: fiberPerServing } = recipeFiber(recipe);

  return (
    <div>
      <button onClick={onCancel} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Cancel
      </button>

      <div className="bg-amber-50 border border-stone-200 rounded-2xl p-6">
        <h1 className="font-display text-2xl text-stone-900 mb-5">{initial.name ? "Edit recipe" : "New recipe"}</h1>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="sm:col-span-2">
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Recipe name</label>
            <input
              value={recipe.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Weeknight Chili"
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div>
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Category</label>
            <select
              value={recipe.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Servings</label>
            <input
              type="number"
              min="1"
              value={recipe.servings}
              onChange={(e) => updateField("servings", e.target.value)}
              className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Ingredients</label>
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1 text-orange-800">
              <Flame size={12} /> {perServing} cal/serving
            </span>
            <span className="flex items-center gap-1 text-emerald-800">
              <Dumbbell size={12} /> {proteinPerServing}g protein
            </span>
            <span className="flex items-center gap-1 text-[#7a5230]">
              <Wheat size={12} /> {fiberPerServing}g fiber
            </span>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-stone-400 px-1">
            <span className="col-span-5">Ingredient</span>
            <span className="col-span-1">Qty</span>
            <span className="col-span-1">Unit</span>
            <span className="col-span-4 text-center flex items-center justify-center gap-1" title="Calories · Protein · Fiber · whole recipe vs. per serving (click a row's chip to edit)">
              <Flame size={10} />
              <Dumbbell size={10} />
              <Wheat size={10} />
            </span>
            <span className="col-span-1"></span>
          </div>
          {fixedIngredients.map((ing) =>
            ing.isSectionHeader ? (
              <SectionHeaderEditRow
                key={ing.id}
                title={ing.name}
                onChangeTitle={(title) => updateIngredient(ing.id, "name", title)}
                onRemove={() => removeIngredientRow(ing.id)}
              />
            ) : (
              <IngredientRow
                key={ing.id}
                ingredient={ing}
                library={ingredientLibrary}
                onChange={(field, value) => updateIngredient(ing.id, field, value)}
                onRemove={() => removeIngredientRow(ing.id)}
                disableRemove={realFixedCount === 1}
                onSaveNewLibraryIngredient={onSaveLibraryIngredient}
              />
            )
          )}
        </div>

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button onClick={addIngredientRow} className="flex items-center gap-1.5 py-2 sm:py-0 text-base sm:text-sm text-emerald-800 font-medium hover:underline">
            <Plus size={16} className="sm:hidden" />
            <Plus size={14} className="hidden sm:block" />
            Add ingredient
          </button>
          <button onClick={addSectionHeader} className="flex items-center gap-1.5 py-2 sm:py-0 text-base sm:text-sm text-stone-500 font-medium hover:underline">
            <Plus size={16} className="sm:hidden" />
            <Plus size={14} className="hidden sm:block" />
            Add section
          </button>
        </div>

        {flexIngredients.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                Flexible ingredients
              </label>
              <span className="text-[11px] text-stone-400">
                Swappable options — check "Default" for what's used unless you modify it
              </span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-stone-400 px-1">
                <span className="col-span-4">Ingredient</span>
                <span className="col-span-1">Qty</span>
                <span className="col-span-1">Unit</span>
                <span className="col-span-4 text-center flex items-center justify-center gap-1" title="Calories · Protein · Fiber · whole recipe vs. per serving (click a row's chip to edit)">
                  <Flame size={10} />
                  <Dumbbell size={10} />
                  <Wheat size={10} />
                </span>
                <span
                  className="col-span-2 flex items-center justify-end gap-2"
                  title="Included by default · delete"
                >
                  <Star size={11} />
                </span>
              </div>
              {flexIngredients.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ingredient={ing}
                  library={ingredientLibrary}
                  onChange={(field, value) => updateIngredient(ing.id, field, value)}
                  onRemove={() => removeIngredientRow(ing.id)}
                  disableRemove={false}
                  onSaveNewLibraryIngredient={onSaveLibraryIngredient}
                  isFlexRow
                />
              ))}
            </div>
            <button
              onClick={addFlexIngredientRow}
              className="flex items-center gap-1.5 py-2 sm:py-0 text-base sm:text-sm text-emerald-800 font-medium mb-6 hover:underline"
            >
              <Plus size={16} className="sm:hidden" />
              <Plus size={14} className="hidden sm:block" />
              Add flexible ingredient
            </button>
          </>
        ) : (
          <button
            onClick={addFlexIngredientRow}
            className="flex items-center gap-1.5 text-base sm:text-sm text-stone-500 font-medium mb-6 border border-dashed border-stone-300 rounded-full px-4 py-2.5 sm:px-3.5 sm:py-1.5 hover:border-stone-400 hover:text-stone-700"
          >
            <Plus size={16} className="sm:hidden" />
            <Plus size={14} className="hidden sm:block" />
            Add flexible ingredients
          </button>
        )}

        <label className="text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide">Instructions</label>
        <textarea
          value={recipe.instructions}
          onChange={(e) => updateField("instructions", e.target.value)}
          rows={6}
          placeholder="Step by step…"
          className="mt-1.5 sm:mt-1 w-full px-3.5 py-3 sm:px-3 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <p className="text-[11px] text-stone-400 mt-1.5">
          One step per line. Start a line with <span className="text-stone-500">[CATEGORY]</span> to
          tag it with an ingredient section above — used by Cooking Mode to jump to the right
          ingredients.
        </p>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-5 py-3 sm:px-4 sm:py-2 rounded-full text-base sm:text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!recipe.name.trim()}
            className="px-6 py-3 sm:px-5 sm:py-2 rounded-full text-base sm:text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
          >
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeaderEditRow({
  title,
  onChangeTitle,
  onRemove,
}: {
  title: string;
  onChangeTitle: (title: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="flex-1 border-t border-stone-300" />
      <input
        value={title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder="Section title (optional)"
        className="px-2 py-1.5 text-sm sm:text-xs font-medium text-stone-500 uppercase tracking-wide bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-emerald-700 rounded"
      />
      <div className="flex-1 border-t border-stone-300" />
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 h-9 w-9 flex items-center justify-center text-stone-400 hover:text-orange-700"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function IngredientRow({
  ingredient,
  library,
  onChange,
  onRemove,
  disableRemove,
  onSaveNewLibraryIngredient,
  isFlexRow,
}: {
  ingredient: Ingredient;
  library: LibraryIngredient[];
  onChange: <K extends keyof Ingredient>(field: K, value: Ingredient[K]) => void;
  onRemove: () => void;
  disableRemove: boolean;
  onSaveNewLibraryIngredient: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  isFlexRow?: boolean;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showMacrosEditor, setShowMacrosEditor] = useState(false);
  const [dismissedName, setDismissedName] = useState<string | null>(null);
  const [promptUnit, setPromptUnit] = useState(ingredient.unit);
  const [promptCalories, setPromptCalories] = useState("");
  const [promptProtein, setPromptProtein] = useState("");
  const [promptFiber, setPromptFiber] = useState("");
  const [promptPantryStaple, setPromptPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  // Guards against a stale-closure bug: calling quantityRef.focus() inside
  // selectSuggestion synchronously blurs the name input (still mid-click,
  // before React re-renders with the just-selected values), so handleNameBlur
  // would otherwise run against the OLD ingredient and wrongly show the
  // save-to-library prompt right after a valid pick.
  const justSelectedRef = useRef(false);

  const trimmedName = ingredient.name.trim();
  const exactMatch = library.find((l) => l.name.toLowerCase() === trimmedName.toLowerCase());
  const suggestions = trimmedName
    ? library.filter((l) => l.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 6)
    : [];

  // Copies a library ingredient's unit/macros/pantry flag onto this row and
  // links it — shared by both ways of matching a library ingredient (picking
  // a suggestion, or typing/blurring on an exact name match) so they behave
  // identically.
  function applyLibraryMatch(lib: LibraryIngredient, quantity: string) {
    const qty = parseFloat(quantity) || 1;
    onChange("unit", lib.unit);
    onChange("calories", String(Math.round(lib.caloriesPerUnit * qty * 100) / 100));
    onChange("protein", String(Math.round(lib.proteinPerUnit * qty * 100) / 100));
    onChange("fiber", String(Math.round(lib.fiberPerUnit * qty * 100) / 100));
    onChange("libraryId", lib.id);
  }

  function selectSuggestion(lib: LibraryIngredient) {
    justSelectedRef.current = true;
    onChange("name", lib.name);
    applyLibraryMatch(lib, ingredient.quantity);
    setShowSuggestions(false);
    setShowSavePrompt(false);
    quantityRef.current?.focus();
  }

  function handleQuantityChange(value: string) {
    onChange("quantity", value);
    // Live-rescale macros for a linked ingredient as the amount changes.
    if (ingredient.libraryId) {
      const linked = library.find((l) => l.id === ingredient.libraryId);
      if (linked) applyLibraryMatch(linked, value);
    }
  }

  function handleNameBlur() {
    // Delay so a suggestion/save-prompt click has a chance to register
    // before we evaluate and possibly hide everything on blur.
    setTimeout(() => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }
      setShowSuggestions(false);
      const name = ingredient.name.trim();
      if (!name) return;
      const match = library.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (match) {
        if (ingredient.libraryId !== match.id) applyLibraryMatch(match, ingredient.quantity);
        setShowSavePrompt(false);
        return;
      }
      if (ingredient.libraryId || dismissedName === name) return;
      const qty = parseFloat(ingredient.quantity) || 0;
      const cals = parseFloat(ingredient.calories) || 0;
      const protein = parseFloat(ingredient.protein) || 0;
      const fiber = parseFloat(ingredient.fiber) || 0;
      setPromptUnit(ingredient.unit);
      setPromptCalories(qty > 0 && cals > 0 ? String(Math.round((cals / qty) * 100) / 100) : "");
      setPromptProtein(qty > 0 && protein > 0 ? String(Math.round((protein / qty) * 100) / 100) : "");
      setPromptFiber(qty > 0 && fiber > 0 ? String(Math.round((fiber / qty) * 100) / 100) : "");
      setPromptPantryStaple(false);
      setShowSavePrompt(true);
    }, 150);
  }

  async function confirmSaveToLibrary() {
    const caloriesPerUnit = parseFloat(promptCalories);
    if (!trimmedName || Number.isNaN(caloriesPerUnit)) return;
    setSaving(true);
    const saved = await onSaveNewLibraryIngredient({
      name: trimmedName,
      unit: promptUnit,
      caloriesPerUnit,
      proteinPerUnit: parseFloat(promptProtein) || 0,
      fiberPerUnit: parseFloat(promptFiber) || 0,
      pantryStaple: promptPantryStaple,
    });
    setSaving(false);
    if (saved) {
      onChange("libraryId", saved.id);
      setShowSavePrompt(false);
    }
  }

  function dismissSavePrompt() {
    setDismissedName(trimmedName);
    setShowSavePrompt(false);
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-12 gap-2 items-start">
      <div className={`col-span-4 ${isFlexRow ? "sm:col-span-4" : "sm:col-span-5"} relative`}>
        <input
          value={ingredient.name}
          onChange={(e) => {
            onChange("name", e.target.value);
            if (ingredient.libraryId) onChange("libraryId", null);
            setShowSuggestions(true);
            setShowSavePrompt(false);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleNameBlur}
          placeholder="Ingredient"
          className="w-full px-3.5 py-3 sm:px-2.5 sm:py-2 pr-7 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        {exactMatch && (
          <BookOpen size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="w-full text-left px-3 py-2.5 sm:py-2 text-base sm:text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
              >
                <span className="text-stone-800 truncate">{s.name}</span>
                <span className="text-stone-400 text-xs whitespace-nowrap">
                  {s.caloriesPerUnit} cal/{s.unit}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={quantityRef}
        type="number"
        value={ingredient.quantity}
        onChange={(e) => handleQuantityChange(e.target.value)}
        placeholder="0"
        title="Quantity"
        className="col-span-1 sm:col-span-1 px-2.5 py-3 sm:px-1.5 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <select
        value={ingredient.unit}
        onChange={(e) => onChange("unit", e.target.value)}
        title="Unit"
        className="col-span-1 sm:col-span-1 px-1.5 py-3 sm:px-1 sm:py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <div
        className="col-span-2 sm:col-span-4 relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setShowMacrosEditor(false);
        }}
      >
        <button
          type="button"
          onClick={() => setShowMacrosEditor((v) => !v)}
          title="Edit calories, protein, fiber, and whole recipe vs. per serving"
          className="w-full min-h-11 sm:min-h-9 py-2 sm:py-1 px-1 rounded-lg flex items-center justify-center flex-wrap gap-x-2 sm:gap-x-1.5 gap-y-0.5 text-sm sm:text-xs hover:bg-stone-200/60 transition-colors"
        >
          <span className="flex items-center gap-0.5 text-orange-800 font-medium">
            <Flame size={13} /> {ingredient.calories || 0}
          </span>
          <span className="flex items-center gap-0.5 text-emerald-800 font-medium">
            <Dumbbell size={13} /> {ingredient.protein || 0}
          </span>
          <span className="flex items-center gap-0.5 text-[#7a5230] font-medium">
            <Wheat size={13} /> {ingredient.fiber || 0}
          </span>
        </button>

        {showMacrosEditor && (
          <div className="absolute z-20 right-0 mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg p-3 space-y-2.5">
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Calories</label>
              <input
                type="number"
                autoFocus
                value={ingredient.calories}
                onChange={(e) => onChange("calories", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Protein (g)</label>
              <input
                type="number"
                value={ingredient.protein}
                onChange={(e) => onChange("protein", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="text-[10px] text-stone-400 uppercase tracking-wide">Fiber (g)</label>
              <input
                type="number"
                value={ingredient.fiber}
                onChange={(e) => onChange("fiber", e.target.value)}
                className="mt-0.5 w-full px-2.5 py-2 sm:px-2 sm:py-1.5 rounded border border-stone-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-stone-400 uppercase tracking-wide">
                {ingredient.servingMode === "perServing" ? "Per serving" : "Whole recipe"}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={ingredient.servingMode === "perServing"}
                onClick={() =>
                  onChange("servingMode", ingredient.servingMode === "perServing" ? "whole" : "perServing")
                }
                title={
                  ingredient.servingMode === "perServing"
                    ? "Per serving — click for whole recipe"
                    : "Whole recipe — click for per serving"
                }
              >
                <span
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                    ingredient.servingMode === "perServing" ? "bg-emerald-700" : "bg-stone-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      ingredient.servingMode === "perServing" ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowMacrosEditor(false)}
              className="w-full text-sm sm:text-xs font-medium text-emerald-800 hover:underline pt-1"
            >
              Done
            </button>
          </div>
        )}
      </div>
      <div
        className={`col-span-4 ${isFlexRow ? "sm:col-span-2" : "sm:col-span-1"} flex items-center justify-end gap-2`}
      >
        {isFlexRow && (
          <button
            type="button"
            onClick={() => onChange("flexDefault", !ingredient.flexDefault)}
            title={
              ingredient.flexDefault
                ? "Included by default when scheduled (click to change)"
                : "Include by default when scheduled"
            }
            className="h-11 sm:h-9 px-1 flex items-center justify-center"
          >
            <Star
              size={17}
              className={ingredient.flexDefault ? "text-amber-500 fill-amber-500" : "text-stone-300"}
            />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disableRemove}
          className="h-11 sm:h-9 px-1 flex items-center justify-center text-stone-400 hover:text-orange-700 disabled:opacity-30"
        >
          <Trash2 size={17} className="sm:hidden" />
          <Trash2 size={15} className="hidden sm:block" />
        </button>
      </div>

      {showSavePrompt && (
        <div className="col-span-2 sm:col-span-12 p-3 sm:p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm sm:text-xs space-y-2">
          <p className="text-stone-700">Save “{trimmedName}” to your ingredient library?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-1.5">
            <select
              value={promptUnit}
              onChange={(e) => setPromptUnit(e.target.value)}
              className="px-2 py-2 sm:px-1.5 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={promptCalories}
              onChange={(e) => setPromptCalories(e.target.value)}
              placeholder="Cal/unit"
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
            <input
              type="number"
              value={promptProtein}
              onChange={(e) => setPromptProtein(e.target.value)}
              placeholder="Protein/unit"
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
            <input
              type="number"
              value={promptFiber}
              onChange={(e) => setPromptFiber(e.target.value)}
              placeholder="Fiber/unit"
              className="px-2.5 py-2 sm:px-2 sm:py-1 rounded border border-stone-200 bg-white text-sm sm:text-xs"
            />
          </div>
          <label className="flex items-center gap-1.5 text-stone-600">
            <input
              type="checkbox"
              checked={promptPantryStaple}
              onChange={(e) => setPromptPantryStaple(e.target.checked)}
              className="rounded border-stone-300"
            />
            Pantry staple (skip in shopping list)
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={dismissSavePrompt} className="text-stone-500 hover:underline">
              Not now
            </button>
            <button
              type="button"
              onClick={confirmSaveToLibrary}
              disabled={saving || !promptCalories}
              className="text-emerald-800 font-medium hover:underline disabled:opacity-40"
            >
              Save to library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Meal Plan ---------- */

function MealPlanView({
  days,
  mealPlan,
  recipes,
  dailyExtras,
  dayNutrition,
  activeDayIdx,
  setActiveDayIdx,
  openPicker,
  openExtras,
  openSlotActions,
  onBuildList,
}: {
  days: ReturnType<typeof getNext7Days>;
  mealPlan: MealPlan;
  recipes: Recipe[];
  dailyExtras: DailyExtra[];
  dayNutrition: (date: string) => DayNutrition;
  activeDayIdx: number;
  setActiveDayIdx: (i: number) => void;
  openPicker: (date: string, slot: MealSlot) => void;
  openExtras: (date: string) => void;
  openSlotActions: (date: string, slot: MealSlot) => void;
  onBuildList: () => void;
}) {
  const activeDay = days[activeDayIdx];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-stone-900">Meal plan</h1>
        <button
          onClick={onBuildList}
          className="flex items-center gap-1.5 bg-orange-700 text-amber-50 text-sm font-medium px-3.5 py-2 rounded-full"
        >
          <ShoppingCart size={15} /> Build shopping list
        </button>
      </div>

      {recipes.length === 0 && (
        <p className="text-sm text-stone-500 mb-4 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
          Add a few recipes first so you have something to plan with.
        </p>
      )}

      {/* Desktop grid */}
      <div className="hidden md:block bg-amber-50 border border-stone-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-8 border-b border-stone-200">
          <div className="p-3"></div>
          {days.map((d) => {
            const n = dayNutrition(d.date);
            return (
              <div key={d.date} className={`p-3 text-center ${d.isToday ? "bg-emerald-50" : ""}`}>
                <p className="text-[11px] uppercase tracking-wide text-stone-400">{d.weekday}</p>
                <p className="font-display text-lg text-stone-900">{d.dayNum}</p>
                <p className="flex items-center justify-center gap-1 text-[10px] text-orange-800 font-medium mt-0.5">
                  <Flame size={9} /> {n.calories}
                </p>
                <p className="flex items-center justify-center gap-1 text-[10px] text-emerald-800 font-medium">
                  <Dumbbell size={9} /> {n.protein}g
                </p>
                <p className="flex items-center justify-center gap-1 text-[10px] text-[#7a5230] font-medium">
                  <Wheat size={9} /> {n.fiber}g
                </p>
              </div>
            );
          })}
        </div>
        {MEAL_SLOTS.map((slot) => (
          <div key={slot} className="grid grid-cols-8 border-b border-stone-100 last:border-0">
            <div className="p-3 text-xs font-medium text-stone-500 flex items-center">{SLOT_LABEL[slot]}</div>
            {days.map((d) => {
              const slotValue = (mealPlan[d.date] || {})[slot];
              const name = slotDisplayName(slotValue, recipes);
              const assignedRecipe = slotValue?.recipeId
                ? recipes.find((r) => r.id === slotValue.recipeId)
                : null;
              const isModifiable = Boolean(assignedRecipe && hasFlexIngredients(assignedRecipe));
              return (
                <div key={d.date} className="m-1.5">
                  <button
                    onClick={() =>
                      name ? openSlotActions(d.date, slot) : openPicker(d.date, slot)
                    }
                    className={`w-full min-w-0 p-2 rounded-lg text-xs text-left border transition-colors ${
                      name
                        ? isModifiable
                          ? "bg-amber-700 text-amber-50 border-amber-700"
                          : "bg-emerald-800 text-amber-50 border-emerald-800"
                        : "border-dashed border-stone-300 text-stone-400 hover:border-stone-400"
                    }`}
                  >
                    {name || "+ Add"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        <div className="grid grid-cols-8">
          <div className="p-3 text-xs font-medium text-stone-500 flex items-center">Extras</div>
          {days.map((d) => {
            const extras = dailyExtras.filter((e) => e.date === d.date);
            const total = extras.reduce((sum, e) => sum + e.calories, 0);
            return (
              <button
                key={d.date}
                onClick={() => openExtras(d.date)}
                className="m-1.5 p-2 rounded-lg text-xs text-left border border-dashed border-stone-300 text-stone-400 hover:border-stone-400"
              >
                {extras.length > 0 ? `${extras.length} · ${total} cal` : "+ Add"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile day view */}
      <div className="md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {days.map((d, idx) => (
            <button
              key={d.date}
              onClick={() => setActiveDayIdx(idx)}
              className={`flex flex-col items-center px-3.5 py-2 rounded-xl min-w-[56px] ${
                idx === activeDayIdx ? "bg-emerald-800 text-amber-50" : "bg-amber-50 border border-stone-200 text-stone-600"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide">{d.weekday}</span>
              <span className="font-display text-base">{d.dayNum}</span>
            </button>
          ))}
        </div>

        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <p className="font-display text-lg text-stone-900">
            {activeDay.weekday} {activeDay.month} {activeDay.dayNum}
          </p>
          <NutritionChips nutrition={dayNutrition(activeDay.date)} />
        </div>

        <div className="space-y-2">
          {MEAL_SLOTS.map((slot) => {
            const slotValue = (mealPlan[activeDay.date] || {})[slot];
            const name = slotDisplayName(slotValue, recipes);
            const assignedRecipe = slotValue?.recipeId
              ? recipes.find((r) => r.id === slotValue.recipeId)
              : null;
            const isModifiable = Boolean(assignedRecipe && hasFlexIngredients(assignedRecipe));
            return (
              <button
                key={slot}
                onClick={() =>
                  name ? openSlotActions(activeDay.date, slot) : openPicker(activeDay.date, slot)
                }
                className="w-full flex items-center gap-2 bg-amber-50 border border-stone-200 rounded-xl px-4 py-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">{SLOT_LABEL[slot]}</p>
                  <p
                    className={`text-sm font-medium mt-0.5 truncate flex items-center gap-1.5 ${
                      name ? "text-stone-900" : "text-stone-400"
                    }`}
                  >
                    {name || "Tap to add"}
                    {isModifiable && <span className="w-1.5 h-1.5 rounded-full bg-amber-700 flex-shrink-0" />}
                  </p>
                </div>
                <ChevronRight size={16} className="text-stone-400 flex-shrink-0" />
              </button>
            );
          })}

          {(() => {
            const extras = dailyExtras.filter((e) => e.date === activeDay.date);
            const total = extras.reduce((sum, e) => sum + e.calories, 0);
            return (
              <button
                onClick={() => openExtras(activeDay.date)}
                className="w-full flex items-center justify-between bg-amber-50 border border-dashed border-stone-300 rounded-xl px-4 py-3 text-left"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">Extras</p>
                  <p className={`text-sm font-medium mt-0.5 ${extras.length ? "text-stone-900" : "text-stone-400"}`}>
                    {extras.length > 0
                      ? `${extras.length} item${extras.length === 1 ? "" : "s"} · ${total} cal`
                      : "Add something you ate"}
                  </p>
                </div>
                <Plus size={16} className="text-stone-400" />
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function RecipePickerModal({
  recipes,
  slot,
  current,
  onPick,
  onSaveCustom,
  onClear,
  onClose,
  onAddNew,
}: {
  recipes: Recipe[];
  slot: { date: string; slot: MealSlot };
  current: MealSlotValue | null;
  onPick: (id: string) => void;
  onSaveCustom: (custom: CustomMeal) => void;
  onClear: () => void;
  onClose: () => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  // Default to the slot's own category (e.g. opening a Dinner slot starts
  // filtered to Dinner recipes) — "All" is always one tap away.
  const [category, setCategory] = useState(
    CATEGORIES.includes(SLOT_LABEL[slot.slot]) ? SLOT_LABEL[slot.slot] : "All"
  );
  const [mode, setMode] = useState<"browse" | "custom">(current?.custom ? "custom" : "browse");
  const [customName, setCustomName] = useState(current?.custom?.name ?? "");
  const [customCalories, setCustomCalories] = useState(
    current?.custom ? String(current.custom.calories) : ""
  );
  const [customProtein, setCustomProtein] = useState(
    current?.custom ? String(current.custom.protein) : ""
  );
  const [customFiber, setCustomFiber] = useState(
    current?.custom ? String(current.custom.fiber) : ""
  );

  const filtered = recipes.filter((r) => {
    const matchesQuery = r.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "All" || r.category === category;
    return matchesQuery && matchesCategory;
  });

  function submitCustom() {
    const name = customName.trim();
    const calories = parseFloat(customCalories);
    if (!name || Number.isNaN(calories)) return;
    onSaveCustom({
      name,
      calories,
      protein: parseFloat(customProtein) || 0,
      fiber: parseFloat(customFiber) || 0,
    });
  }

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-amber-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="font-display text-lg text-stone-900">{SLOT_LABEL[slot.slot]}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        {mode === "browse" ? (
          <>
            <div className="p-4 pb-2 space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full pl-8 pr-3 py-2 rounded-full border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                {["All", ...CATEGORIES].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border ${
                      category === c ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {filtered.length === 0 && <p className="text-sm text-stone-500 text-center py-6">No recipes match.</p>}
              {filtered.map((r) => {
                const { perServing } = recipeCalories(r);
                return (
                  <button
                    key={r.id}
                    onClick={() => onPick(r.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left border ${
                      current?.recipeId === r.id
                        ? "border-emerald-700 bg-emerald-50"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-800">{r.name}</p>
                      <p className="text-xs text-stone-400">
                        {r.category} · {perServing} cal
                      </p>
                    </div>
                    {current?.recipeId === r.id && <Check size={16} className="text-emerald-700" />}
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-stone-200 space-y-2">
              {current && (
                <button
                  onClick={onClear}
                  className="w-full px-4 py-2 rounded-full text-sm font-medium text-orange-700 border border-orange-200 hover:bg-orange-50"
                >
                  Clear meal
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onAddNew}
                  className="flex-1 px-4 py-2 rounded-full text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-100"
                >
                  + New recipe
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className="flex-1 px-4 py-2 rounded-full text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-100"
                >
                  Build custom meal
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Meal name</label>
              <input
                autoFocus
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Restaurant burger"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Calories</label>
                <input
                  type="number"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Protein (g)</label>
                <input
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Fiber (g)</label>
                <input
                  type="number"
                  value={customFiber}
                  onChange={(e) => setCustomFiber(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
            <p className="text-xs text-stone-400">
              This is a one-off meal — it won't be saved to your recipe book or ingredient library.
            </p>
            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setMode("browse")} className="text-sm font-medium text-stone-500 hover:underline">
                ← Browse recipes instead
              </button>
              <button
                onClick={submitCustom}
                disabled={!customName.trim() || !customCalories}
                className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
              >
                Save custom meal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtrasModal({
  date,
  extras,
  ingredientLibrary,
  onAdd,
  onDelete,
  onClose,
}: {
  date: string;
  extras: DailyExtra[];
  ingredientLibrary: LibraryIngredient[];
  onAdd: (name: string, calories: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"manual" | "ingredient">("manual");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const trimmedName = name.trim();
  const suggestions = trimmedName
    ? ingredientLibrary.filter((i) => i.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 6)
    : [];
  const total = extras.reduce((sum, e) => sum + e.calories, 0);

  function selectSuggestion(lib: LibraryIngredient) {
    const qty = parseFloat(quantity) || 1;
    setName(lib.name);
    setUnit(lib.unit);
    setCalories(String(Math.round(lib.caloriesPerUnit * qty * 100) / 100));
    setShowSuggestions(false);
  }

  function handleAdd() {
    const cals = parseFloat(calories);
    if (!trimmedName || Number.isNaN(cals)) return;
    onAdd(trimmedName, cals);
    setName("");
    setCalories("");
    setQuantity("");
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-amber-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div>
            <h2 className="font-display text-lg text-stone-900">Extras</h2>
            <p className="text-xs text-stone-400">{dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        {extras.length > 0 && (
          <div className="px-4 pt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {extras.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between bg-white border border-stone-200 rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-sm text-stone-800">{e.name}</p>
                  <p className="text-xs text-orange-800 font-medium flex items-center gap-1">
                    <Flame size={11} /> {e.calories} cal
                  </p>
                </div>
                <button onClick={() => onDelete(e.id)} className="text-stone-400 hover:text-orange-700">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <p className="text-xs text-stone-400 text-right pt-1">Total: {total} cal</p>
          </div>
        )}

        <div className="p-4 space-y-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium border ${
                mode === "manual" ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600"
              }`}
            >
              Manual
            </button>
            <button
              type="button"
              onClick={() => setMode("ingredient")}
              className={`flex-1 px-3 py-1.5 rounded-full text-xs font-medium border ${
                mode === "ingredient" ? "bg-stone-800 text-amber-50 border-stone-800" : "border-stone-200 text-stone-600"
              }`}
            >
              From ingredient
            </button>
          </div>

          {mode === "ingredient" ? (
            <div className="relative">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search ingredients…"
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-stone-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSuggestion(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
                    >
                      <span className="text-stone-800 truncate">{s.name}</span>
                      <span className="text-stone-400 text-xs whitespace-nowrap">
                        {s.caloriesPerUnit} cal/{s.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={`Qty (${unit})`}
                  className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Calories"
                  className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What did you eat?"
                className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="Calories"
                className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!trimmedName || !calories}
            className="w-full px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function FlexModifyModal({
  recipeName,
  flexIngredients,
  selected,
  onSave,
  onClose,
}: {
  recipeName: string;
  flexIngredients: Ingredient[];
  selected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set(selected));

  function toggle(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-amber-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div>
            <h2 className="font-display text-lg text-stone-900">Modify ingredients</h2>
            <p className="text-xs text-stone-400">{recipeName}</p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
          {flexIngredients.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">
              This recipe has no flexible ingredients.
            </p>
          ) : (
            flexIngredients.map((ing) => {
              const checked = checkedIds.has(ing.id);
              return (
                <button
                  key={ing.id}
                  type="button"
                  onClick={() => toggle(ing.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left border ${
                    checked ? "border-emerald-700 bg-emerald-50" : "border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                      checked ? "bg-emerald-800 border-emerald-800" : "border-stone-300"
                    }`}
                  >
                    {checked && <Check size={12} className="text-amber-50" />}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                      {ing.name}
                      {ing.flexDefault && <Star size={11} className="text-amber-500 fill-amber-500" />}
                    </p>
                    <p className="text-xs text-stone-400">
                      {ing.quantity} {ing.unit} · {ing.calories || 0} cal
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={() => onSave(Array.from(checkedIds))}
            className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shopping List ---------- */

function ShoppingListView({
  list,
  onToggle,
  onRebuild,
  onClearChecked,
  onAdd,
}: {
  list: ShoppingItem[];
  onToggle: (id: string) => void;
  onRebuild: () => void;
  onClearChecked: () => void;
  onAdd: (name: string) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const sortedList = useMemo(
    () => [...list].sort((a, b) => Number(a.checked) - Number(b.checked)),
    [list]
  );
  const hasChecked = list.some((item) => item.checked);

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!newItemName.trim()) return;
    onAdd(newItemName.trim());
    setNewItemName("");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-stone-900">Shopping list</h1>
        <div className="flex items-center gap-4">
          {hasChecked && (
            <button onClick={onClearChecked} className="text-sm font-medium text-orange-700 hover:underline">
              Clear checked
            </button>
          )}
          <button onClick={onRebuild} className="text-sm font-medium text-emerald-800 hover:underline">
            Rebuild from plan
          </button>
        </div>
      </div>

      <form onSubmit={submitAdd} className="flex gap-2 mb-4">
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add an item…"
          className="flex-1 px-3 py-2 rounded-full border border-stone-200 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <button
          type="submit"
          disabled={!newItemName.trim()}
          className="flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-4 py-2 rounded-full disabled:opacity-40"
        >
          <Plus size={15} /> Add
        </button>
      </form>

      {list.length === 0 ? (
        <EmptyState title="No shopping list yet" body="Plan some meals for the week, then build your list from there." />
      ) : (
        <div className="bg-amber-50 border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {sortedList.map((item) => (
            <button key={item.id} onClick={() => onToggle(item.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span
                className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  item.checked ? "bg-emerald-800 border-emerald-800" : "border-stone-300"
                }`}
              >
                {item.checked && <Check size={12} className="text-amber-50" />}
              </span>
              <div className="flex-1">
                <p className={`text-sm ${item.checked ? "line-through text-stone-400" : "text-stone-800"}`}>{item.name}</p>
                {item.recipes && item.recipes.length > 0 && (
                  <p className="text-[11px] text-stone-400">for {item.recipes.join(", ")}</p>
                )}
              </div>
              {item.unit && (
                <span className={`text-sm font-medium ${item.checked ? "text-stone-300" : "text-stone-600"}`}>
                  {Math.round(item.quantity * 100) / 100} {item.unit}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Ingredient Library ---------- */

function IngredientLibraryView({
  library,
  onAdd,
  onUpdate,
  onDelete,
  onBack,
}: {
  library: LibraryIngredient[];
  onAdd: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onUpdate: (id: string, input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formUnit, setFormUnit] = useState("g");
  const [formCalories, setFormCalories] = useState("");
  const [formProtein, setFormProtein] = useState("");
  const [formFiber, setFormFiber] = useState("");
  const [formPantryStaple, setFormPantryStaple] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = library.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  const isAdding = editingId === "new";

  function startAdd() {
    setEditingId("new");
    setFormName("");
    setFormUnit("g");
    setFormCalories("");
    setFormProtein("");
    setFormFiber("");
    setFormPantryStaple(false);
  }

  function startEdit(ing: LibraryIngredient) {
    setEditingId(ing.id);
    setFormName(ing.name);
    setFormUnit(ing.unit);
    setFormCalories(String(ing.caloriesPerUnit));
    setFormProtein(String(ing.proteinPerUnit));
    setFormFiber(String(ing.fiberPerUnit));
    setFormPantryStaple(ing.pantryStaple);
  }

  async function submitForm() {
    const name = formName.trim();
    const caloriesPerUnit = parseFloat(formCalories);
    if (!name || Number.isNaN(caloriesPerUnit) || !editingId) return;
    setSaving(true);
    const input: LibraryIngredientInput = {
      name,
      unit: formUnit,
      caloriesPerUnit,
      proteinPerUnit: parseFloat(formProtein) || 0,
      fiberPerUnit: parseFloat(formFiber) || 0,
      pantryStaple: formPantryStaple,
    };
    const result = isAdding ? await onAdd(input) : await onUpdate(editingId, input);
    setSaving(false);
    if (result) setEditingId(null);
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-stone-500 text-sm mb-4 hover:text-stone-800">
        <ChevronLeft size={16} /> Back to recipes
      </button>

      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl text-stone-900">Ingredient library</h1>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 bg-emerald-800 text-amber-50 text-sm font-medium px-3.5 py-2 rounded-full"
        >
          <Plus size={15} /> Add ingredient
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ingredients…"
          className="w-full pl-9 pr-3 py-2 rounded-full border border-stone-200 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>

      {isAdding && (
        <IngredientLibraryForm
          title="New ingredient"
          name={formName}
          setName={setFormName}
          unit={formUnit}
          setUnit={setFormUnit}
          calories={formCalories}
          setCalories={setFormCalories}
          protein={formProtein}
          setProtein={setFormProtein}
          fiber={formFiber}
          setFiber={setFormFiber}
          pantryStaple={formPantryStaple}
          setPantryStaple={setFormPantryStaple}
          onCancel={() => setEditingId(null)}
          onSubmit={submitForm}
          saving={saving}
        />
      )}

      {library.length === 0 ? (
        <EmptyState
          title="No ingredients yet"
          body="Add ingredients here, or save them straight from a recipe as you go."
          actionLabel="Add ingredient"
          onAction={startAdd}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-stone-500 text-center py-10">No ingredients match “{query}”.</p>
      ) : (
        <div className="bg-amber-50 border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {filtered.map((ing) =>
            editingId === ing.id ? (
              <IngredientLibraryForm
                key={ing.id}
                title="Edit ingredient"
                name={formName}
                setName={setFormName}
                unit={formUnit}
                setUnit={setFormUnit}
                calories={formCalories}
                setCalories={setFormCalories}
                protein={formProtein}
                setProtein={setFormProtein}
                fiber={formFiber}
                setFiber={setFormFiber}
                pantryStaple={formPantryStaple}
                setPantryStaple={setFormPantryStaple}
                onCancel={() => setEditingId(null)}
                onSubmit={submitForm}
                saving={saving}
                inline
              />
            ) : (
              <div key={ing.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-800 flex items-center gap-1.5">
                    {ing.name}
                    {ing.pantryStaple && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-normal text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full"
                        title="Pantry staple — skipped in shopping lists by default"
                      >
                        <Package size={9} /> Pantry
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-stone-400">
                    {ing.caloriesPerUnit} cal · {ing.proteinPerUnit}g protein · {ing.fiberPerUnit}g fiber{" "}
                    <span className="text-stone-300">/ {ing.unit}</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => startEdit(ing)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:bg-stone-100"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(ing.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-orange-700 hover:bg-orange-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this ingredient from your library? Recipes that already used it keep their own saved amounts — this only affects future autocomplete and autofill."
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}

function IngredientLibraryForm({
  title,
  name,
  setName,
  unit,
  setUnit,
  calories,
  setCalories,
  protein,
  setProtein,
  fiber,
  setFiber,
  pantryStaple,
  setPantryStaple,
  onCancel,
  onSubmit,
  saving,
  inline,
}: {
  title: string;
  name: string;
  setName: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  calories: string;
  setCalories: (v: string) => void;
  protein: string;
  setProtein: (v: string) => void;
  fiber: string;
  setFiber: (v: string) => void;
  pantryStaple: boolean;
  setPantryStaple: (v: boolean) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  inline?: boolean;
}) {
  return (
    <div className={inline ? "p-4 bg-emerald-50" : "bg-amber-50 border border-stone-200 rounded-2xl p-4 mb-4"}>
      <p className="text-xs font-medium text-stone-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ingredient name"
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input
          type="number"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          placeholder="Cal/unit"
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <input
          type="number"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
          placeholder="Protein/unit (g)"
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
        <input
          type="number"
          value={fiber}
          onChange={(e) => setFiber(e.target.value)}
          placeholder="Fiber/unit (g)"
          className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>
      <label className="flex items-center gap-1.5 text-sm text-stone-600 mb-3">
        <input
          type="checkbox"
          checked={pantryStaple}
          onChange={(e) => setPantryStaple(e.target.checked)}
          className="rounded border-stone-300"
        />
        Pantry staple (skip in shopping list by default)
      </label>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={saving || !name.trim() || !calories}
          className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ---------- Shared ---------- */

function ConfirmModal({
  message,
  confirmLabel = "Delete",
  onCancel,
  onConfirm,
}: {
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-amber-50 rounded-2xl w-full max-w-sm p-5">
        <p className="text-sm text-stone-700 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-full text-sm font-medium bg-orange-700 text-amber-50">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Meal slot action dialog ---------- */

function MealSlotActionModal({
  name,
  canModify,
  canCook,
  onRemove,
  onModify,
  onCook,
  onClose,
}: {
  name: string;
  canModify: boolean;
  canCook: boolean;
  onRemove: () => void;
  onModify: () => void;
  onCook: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-amber-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="font-display text-lg text-stone-900 truncate pr-2">{name}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-2">
          <button
            onClick={onCook}
            disabled={!canCook}
            title={canCook ? undefined : "Custom meals have no recipe to cook from"}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-amber-700 text-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChefHat size={16} /> Cook meal
          </button>
          <button
            onClick={onModify}
            disabled={!canModify}
            title={canModify ? undefined : "This meal has no flexible ingredients"}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <SlidersHorizontal size={16} /> Modify ingredients
          </button>
          <button
            onClick={onRemove}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border border-orange-200 text-orange-700 hover:bg-orange-50"
          >
            <Trash2 size={16} /> Remove meal
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Cooking Mode ---------- */

function loadCookingState(key: string): { checked: string[]; step: number | null } {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { checked: [], step: null };
    const parsed = JSON.parse(raw);
    return {
      checked: Array.isArray(parsed.checked) ? parsed.checked : [],
      step: typeof parsed.step === "number" ? parsed.step : null,
    };
  } catch {
    return { checked: [], step: null };
  }
}

function saveCookingState(key: string, state: { checked: string[]; step: number | null }) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — cooking still works,
    // it just won't survive an accidental reload.
  }
}

function CookingModeView({
  recipe,
  flexIds,
  servingMultiplier,
  sessionKey,
  onClose,
}: {
  recipe: Recipe;
  flexIds: string[];
  servingMultiplier: number;
  sessionKey: string;
  onClose: () => void;
}) {
  const steps = useMemo(() => parseInstructionSteps(recipe.instructions), [recipe.instructions]);
  const sections = useMemo(() => {
    const groups = groupIngredientsBySection(recipe.ingredients.filter((i) => !i.isFlex));
    const activeFlex = recipe.ingredients.filter((i) => i.isFlex && flexIds.includes(i.id));
    if (activeFlex.length > 0) {
      groups.push({ key: "__flex", title: "Flexible ingredients", items: activeFlex });
    }
    return groups;
  }, [recipe.ingredients, flexIds]);

  const initial = useMemo(() => loadCookingState(sessionKey), [sessionKey]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial.checked));
  const [activeStep, setActiveStep] = useState<number | null>(initial.step);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [mobileTab, setMobileTab] = useState<"ingredients" | "instructions">("ingredients");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    saveCookingState(sessionKey, { checked: Array.from(checked), step: activeStep });
  }, [checked, activeStep, sessionKey]);

  useEffect(() => {
    if (activeStep === null) return;
    const step = steps[activeStep];
    if (!step || step.categories.length === 0) return;
    const match = sections.find((s) => s.title && step.categories.includes(s.title.toUpperCase()));
    if (match) {
      sectionRefs.current[match.key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeStep, steps, sections]);

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmExit() {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      // ignore
    }
    onClose();
  }

  const activeCategories = activeStep !== null ? steps[activeStep]?.categories ?? [] : [];

  return (
    <div className="fixed inset-0 bg-stone-100 z-50 flex flex-col overscroll-none">
      <div className="md:hidden flex border-b border-stone-200 bg-amber-50 flex-shrink-0">
        <button
          onClick={() => setMobileTab("ingredients")}
          className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 ${
            mobileTab === "ingredients"
              ? "text-emerald-800 border-emerald-800"
              : "text-stone-400 border-transparent"
          }`}
        >
          Ingredients
        </button>
        <button
          onClick={() => setMobileTab("instructions")}
          className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 ${
            mobileTab === "instructions"
              ? "text-emerald-800 border-emerald-800"
              : "text-stone-400 border-transparent"
          }`}
        >
          Instructions
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div
          className={`${
            mobileTab === "ingredients" ? "flex" : "hidden"
          } md:flex flex-col flex-1 min-h-0 md:flex-none md:w-1/3 md:border-r border-stone-200 overflow-y-auto p-4 space-y-4`}
        >
          {sections.map((section) => {
            const isActiveMatch =
              activeCategories.length > 0 &&
              section.title !== null &&
              activeCategories.includes(section.title.toUpperCase());
            return (
              <div
                key={section.key}
                ref={(el) => {
                  sectionRefs.current[section.key] = el;
                }}
                className={`rounded-xl transition-shadow ${isActiveMatch ? "ring-2 ring-amber-400" : ""}`}
              >
                {section.title && (
                  <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wide mb-1.5 px-1">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1.5">
                  {section.items.map((ing) => {
                    const isChecked = checked.has(ing.id);
                    return (
                      <button
                        key={ing.id}
                        onClick={() => toggleChecked(ing.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left border ${
                          isChecked ? "border-stone-200 bg-stone-100" : "border-stone-200 bg-white hover:bg-stone-50"
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                            isChecked ? "bg-emerald-800 border-emerald-800" : "border-stone-300"
                          }`}
                        >
                          {isChecked && <Check size={12} className="text-amber-50" />}
                        </span>
                        <span
                          className={`flex-1 text-sm ${isChecked ? "line-through text-stone-400" : "text-stone-800"}`}
                        >
                          {ing.name} — {scaleQuantityDisplay(ing.quantity, servingMultiplier)} {ing.unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`${
            mobileTab === "instructions" ? "block" : "hidden"
          } md:block flex-1 min-h-0 overflow-y-auto p-4 md:p-6`}
        >
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex flex-wrap gap-1.5">
              {steps.length > 0 && (
                <>
                  <button
                    onClick={() => setActiveStep(null)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      activeStep === null ? "bg-emerald-800 text-amber-50" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                    }`}
                  >
                    All steps
                  </button>
                  {steps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveStep(idx)}
                      className={`w-8 h-8 rounded-full text-xs font-medium ${
                        activeStep === idx ? "bg-emerald-800 text-amber-50" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </>
              )}
            </div>
            <button
              onClick={() => setConfirmingExit(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 bg-amber-50 text-stone-500 hover:bg-stone-100"
            >
              <X size={18} />
            </button>
          </div>

          {steps.length === 0 ? (
            <p className="text-sm text-stone-500">No instructions added.</p>
          ) : (
            <>
              {activeStep === null ? (
                <ol className="space-y-4">
                  {steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="font-display text-lg text-stone-400 flex-shrink-0 w-6">{idx + 1}</span>
                      <div>
                        {step.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {step.categories.map((c) => (
                              <span
                                key={c}
                                className="text-[10px] font-medium uppercase tracking-wide bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-stone-800 leading-relaxed">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div>
                  {steps[activeStep].categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {steps[activeStep].categories.map((c) => (
                        <span
                          key={c}
                          className="text-[11px] font-medium uppercase tracking-wide bg-stone-200 text-stone-600 px-2 py-1 rounded"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="font-serif text-2xl md:text-3xl text-stone-900 leading-snug">
                    {steps[activeStep].text}
                  </p>
                  <div className="flex items-center justify-between mt-8">
                    <button
                      onClick={() => setActiveStep((s) => (s !== null && s > 0 ? s - 1 : s))}
                      disabled={activeStep === 0}
                      className="px-4 py-2 rounded-full text-sm font-medium border border-stone-200 text-stone-600 disabled:opacity-30"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-stone-400">
                      Step {activeStep + 1} of {steps.length}
                    </span>
                    <button
                      onClick={() =>
                        setActiveStep((s) => (s !== null && s < steps.length - 1 ? s + 1 : s))
                      }
                      disabled={activeStep === steps.length - 1}
                      className="px-4 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-30"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirmingExit && (
        <ConfirmModal
          message="Exit cooking mode? Your checklist progress will be cleared."
          confirmLabel="Exit"
          onCancel={() => setConfirmingExit(false)}
          onConfirm={confirmExit}
        />
      )}
    </div>
  );
}
