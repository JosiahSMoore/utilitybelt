"use client";

import { useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import {
  assignMealAction,
  clearMealAction,
  deleteLibraryIngredientAction,
  deleteRecipeAction,
  deleteShoppingItemsAction,
  saveLibraryIngredientAction,
  saveRecipeAction,
  syncShoppingListAction,
  toggleShoppingItemAction,
  updateLibraryIngredientAction,
} from "@/app/actions";
import { CATEGORIES, CATEGORY_STYLE, MEAL_SLOTS, SLOT_LABEL, UNITS } from "@/lib/constants";
import {
  emptyIngredient,
  emptyRecipe,
  generateId,
  getNext7Days,
  recipeCalories,
  recipeFiber,
  recipeProtein,
} from "@/lib/helpers";
import type {
  Ingredient,
  LibraryIngredient,
  MealPlan,
  MealSlot,
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
};

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
      <span className="flex items-center gap-1 text-amber-800">
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
}: {
  initialRecipes: Recipe[];
  initialMealPlan: MealPlan;
  initialShoppingList: ShoppingItem[];
  initialIngredientLibrary: LibraryIngredient[];
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(initialRecipes);
  const [mealPlan, setMealPlan] = useState<MealPlan>(initialMealPlan);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(initialShoppingList);
  const [ingredientLibrary, setIngredientLibrary] = useState<LibraryIngredient[]>(
    initialIngredientLibrary
  );

  const [view, setView] = useState<View>("home");
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [pickerSlot, setPickerSlot] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeDayIdx, setActiveDayIdx] = useState(0);

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
          if (cleaned[mt] === id) cleaned[mt] = null;
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
    const prev = mealPlan;
    const next = { ...mealPlan, [date]: { ...(mealPlan[date] || {}), [slot]: recipeId } };
    setMealPlan(next);
    setPickerSlot(null);
    try {
      await assignMealAction(date, slot, recipeId);
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
    return MEAL_SLOTS.reduce(
      (acc, mt) => {
        const r = recipes.find((rc) => rc.id === slots[mt]);
        if (!r) return acc;
        return {
          calories: acc.calories + recipeCalories(r).perServing,
          protein: acc.protein + recipeProtein(r).perServing,
          fiber: acc.fiber + recipeFiber(r).perServing,
        };
      },
      { calories: 0, protein: 0, fiber: 0 }
    );
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
        const recipe = recipes.find((r) => r.id === slots[mt]);
        if (!recipe) return;
        const servings = parseFloat(String(recipe.servings)) || 1;
        (recipe.ingredients || []).forEach((ing) => {
          if (!ing.name || !ing.name.trim()) return;
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
              />
            );
          })()}

        {view === "mealPlan" && (
          <MealPlanView
            days={days}
            mealPlan={mealPlan}
            recipes={recipes}
            dayNutrition={dayNutrition}
            activeDayIdx={activeDayIdx}
            setActiveDayIdx={setActiveDayIdx}
            openPicker={(date, slot) => setPickerSlot({ date, slot })}
            onBuildList={buildShoppingList}
          />
        )}

        {view === "shoppingList" && (
          <ShoppingListView
            list={shoppingList}
            onToggle={toggleShoppingItem}
            onRebuild={buildShoppingList}
            onClearChecked={clearCheckedItems}
          />
        )}
      </main>

      {pickerSlot && (
        <RecipePickerModal
          recipes={recipes}
          slot={pickerSlot}
          current={(mealPlan[pickerSlot.date] || {})[pickerSlot.slot]}
          onPick={(id) => assignMeal(pickerSlot.date, pickerSlot.slot, id)}
          onClear={() => clearMeal(pickerSlot.date, pickerSlot.slot)}
          onClose={() => setPickerSlot(null)}
          onAddNew={() => {
            setPickerSlot(null);
            setEditingRecipe(null);
            setView("addRecipe");
          }}
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
}: {
  recipes: Recipe[];
  days: ReturnType<typeof getNext7Days>;
  todaysPlan: MealPlan[string];
  dayNutrition: (date: string) => DayNutrition;
  setView: (v: View) => void;
  setEditingRecipe: (r: Recipe | null) => void;
}) {
  const today = days[0];

  function recipeName(id: string | null | undefined) {
    const r = recipes.find((rc) => rc.id === id);
    return r ? r.name : null;
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
            const name = recipeName(todaysPlan[slot]);
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <span className="flex items-center gap-1 text-amber-800 font-medium">
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
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrint: () => void;
}) {
  const { total, perServing } = recipeCalories(recipe);
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
            <p className="text-stone-500 text-sm mt-1">
              {recipe.servings} servings · {perServing} cal/serving · {total} cal total
            </p>
          </div>
          <div className="flex gap-2">
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

        <div className="grid md:grid-cols-2 gap-8 mt-6">
          <div>
            <h2 className="font-display text-lg text-stone-900 mb-3">Ingredients</h2>
            <table className="w-full text-sm">
              <tbody>
                {recipe.ingredients.map((ing) => (
                  <tr key={ing.id} className="border-b border-stone-200 last:border-0">
                    <td className="py-2 text-stone-800">
                      {ing.name}
                      {ing.servingMode === "perServing" && (
                        <span className="text-[10px] text-stone-400 ml-1.5">/serving</span>
                      )}
                    </td>
                    <td className="py-2 text-stone-500 text-right whitespace-nowrap">
                      {ing.quantity} {ing.unit}
                    </td>
                    <td className="py-2 text-stone-400 text-right w-16">{ing.calories || 0} cal</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 className="font-display text-lg text-stone-900 mb-3">Instructions</h2>
            <p className="text-stone-700 text-sm whitespace-pre-wrap leading-relaxed">
              {recipe.instructions || "No instructions added."}
            </p>
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

  function removeIngredientRow(id: string) {
    setRecipe((r) => ({ ...r, ingredients: r.ingredients.filter((ing) => ing.id !== id) }));
  }

  function handleSave() {
    if (!recipe.name.trim()) return;
    const cleaned = {
      ...recipe,
      ingredients: recipe.ingredients.filter((i) => i.name.trim()),
    };
    if (cleaned.ingredients.length === 0) cleaned.ingredients = [emptyIngredient()];
    onSave(cleaned);
  }

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
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Recipe name</label>
            <input
              value={recipe.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g. Weeknight Chili"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Category</label>
            <select
              value={recipe.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Servings</label>
            <input
              type="number"
              min="1"
              value={recipe.servings}
              onChange={(e) => updateField("servings", e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
            <span className="flex items-center gap-1 text-amber-800">
              <Wheat size={12} /> {fiberPerServing}g fiber
            </span>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] text-stone-400 px-1">
            <span className="col-span-5">Ingredient</span>
            <span className="col-span-1">Qty</span>
            <span className="col-span-1">Unit</span>
            <span className="col-span-1 text-center" title="Calories">
              <Flame size={11} className="inline" />
            </span>
            <span className="col-span-1 text-center" title="Protein (g)">
              <Dumbbell size={11} className="inline" />
            </span>
            <span className="col-span-1 text-center" title="Fiber (g)">
              <Wheat size={11} className="inline" />
            </span>
            <span className="col-span-1 text-center" title="Whole recipe vs. per serving">
              Per svg
            </span>
            <span className="col-span-1"></span>
          </div>
          {recipe.ingredients.map((ing) => (
            <IngredientRow
              key={ing.id}
              ingredient={ing}
              library={ingredientLibrary}
              onChange={(field, value) => updateIngredient(ing.id, field, value)}
              onRemove={() => removeIngredientRow(ing.id)}
              disableRemove={recipe.ingredients.length === 1}
              onSaveNewLibraryIngredient={onSaveLibraryIngredient}
            />
          ))}
        </div>

        <button onClick={addIngredientRow} className="flex items-center gap-1 text-sm text-emerald-800 font-medium mb-6 hover:underline">
          <Plus size={14} /> Add ingredient
        </button>

        <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Instructions</label>
        <textarea
          value={recipe.instructions}
          onChange={(e) => updateField("instructions", e.target.value)}
          rows={6}
          placeholder="Step by step…"
          className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium text-stone-600 hover:bg-stone-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!recipe.name.trim()}
            className="px-5 py-2 rounded-full text-sm font-medium bg-emerald-800 text-amber-50 disabled:opacity-40"
          >
            Save recipe
          </button>
        </div>
      </div>
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
}: {
  ingredient: Ingredient;
  library: LibraryIngredient[];
  onChange: <K extends keyof Ingredient>(field: K, value: Ingredient[K]) => void;
  onRemove: () => void;
  disableRemove: boolean;
  onSaveNewLibraryIngredient: (input: LibraryIngredientInput) => Promise<LibraryIngredient | null>;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [dismissedName, setDismissedName] = useState<string | null>(null);
  const [promptUnit, setPromptUnit] = useState(ingredient.unit);
  const [promptCalories, setPromptCalories] = useState("");
  const [promptProtein, setPromptProtein] = useState("");
  const [promptFiber, setPromptFiber] = useState("");
  const [saving, setSaving] = useState(false);
  const quantityRef = useRef<HTMLInputElement>(null);

  const trimmedName = ingredient.name.trim();
  const exactMatch = library.find((l) => l.name.toLowerCase() === trimmedName.toLowerCase());
  const suggestions = trimmedName
    ? library.filter((l) => l.name.toLowerCase().includes(trimmedName.toLowerCase())).slice(0, 6)
    : [];

  function selectSuggestion(lib: LibraryIngredient) {
    const qty = parseFloat(ingredient.quantity) || 1;
    onChange("name", lib.name);
    onChange("unit", lib.unit);
    onChange("calories", String(Math.round(lib.caloriesPerUnit * qty * 100) / 100));
    onChange("protein", String(Math.round(lib.proteinPerUnit * qty * 100) / 100));
    onChange("fiber", String(Math.round(lib.fiberPerUnit * qty * 100) / 100));
    onChange("libraryId", lib.id);
    setShowSuggestions(false);
    setShowSavePrompt(false);
    quantityRef.current?.focus();
  }

  function handleNameBlur() {
    // Delay so a suggestion/save-prompt click has a chance to register
    // before we evaluate and possibly hide everything on blur.
    setTimeout(() => {
      setShowSuggestions(false);
      const name = ingredient.name.trim();
      if (!name) return;
      const match = library.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (match) {
        if (ingredient.libraryId !== match.id) onChange("libraryId", match.id);
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
    <div className="grid grid-cols-12 gap-2 items-start">
      <div className="col-span-5 relative">
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
          className="w-full px-2.5 py-2 pr-7 rounded-lg border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
      </div>

      <input
        ref={quantityRef}
        type="number"
        value={ingredient.quantity}
        onChange={(e) => onChange("quantity", e.target.value)}
        placeholder="0"
        title="Quantity"
        className="col-span-1 px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <select
        value={ingredient.unit}
        onChange={(e) => onChange("unit", e.target.value)}
        title="Unit"
        className="col-span-1 px-1 py-2 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={ingredient.calories}
        onChange={(e) => onChange("calories", e.target.value)}
        placeholder="0"
        title="Calories"
        className="col-span-1 px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <input
        type="number"
        value={ingredient.protein}
        onChange={(e) => onChange("protein", e.target.value)}
        placeholder="0"
        title="Protein (g)"
        className="col-span-1 px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
      <input
        type="number"
        value={ingredient.fiber}
        onChange={(e) => onChange("fiber", e.target.value)}
        placeholder="0"
        title="Fiber (g)"
        className="col-span-1 px-1.5 py-2 rounded-lg border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700"
      />
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
        className="col-span-1 h-9 flex items-center justify-center"
      >
        <span
          className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors ${
            ingredient.servingMode === "perServing" ? "bg-emerald-700" : "bg-stone-300"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              ingredient.servingMode === "perServing" ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disableRemove}
        className="col-span-1 h-9 flex items-center justify-center text-stone-400 hover:text-orange-700 disabled:opacity-30"
      >
        <Trash2 size={15} />
      </button>

      {showSavePrompt && (
        <div className="col-span-12 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs space-y-2">
          <p className="text-stone-700">Save “{trimmedName}” to your ingredient library?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <select
              value={promptUnit}
              onChange={(e) => setPromptUnit(e.target.value)}
              className="px-1.5 py-1 rounded border border-stone-200 bg-white text-xs"
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
              className="px-2 py-1 rounded border border-stone-200 bg-white text-xs"
            />
            <input
              type="number"
              value={promptProtein}
              onChange={(e) => setPromptProtein(e.target.value)}
              placeholder="Protein/unit"
              className="px-2 py-1 rounded border border-stone-200 bg-white text-xs"
            />
            <input
              type="number"
              value={promptFiber}
              onChange={(e) => setPromptFiber(e.target.value)}
              placeholder="Fiber/unit"
              className="px-2 py-1 rounded border border-stone-200 bg-white text-xs"
            />
          </div>
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
  dayNutrition,
  activeDayIdx,
  setActiveDayIdx,
  openPicker,
  onBuildList,
}: {
  days: ReturnType<typeof getNext7Days>;
  mealPlan: MealPlan;
  recipes: Recipe[];
  dayNutrition: (date: string) => DayNutrition;
  activeDayIdx: number;
  setActiveDayIdx: (i: number) => void;
  openPicker: (date: string, slot: MealSlot) => void;
  onBuildList: () => void;
}) {
  const activeDay = days[activeDayIdx];

  function recipeName(id: string | null | undefined) {
    const r = recipes.find((rc) => rc.id === id);
    return r ? r.name : null;
  }

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
                <p className="flex items-center justify-center gap-1 text-[10px] text-amber-800 font-medium">
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
              const rid = (mealPlan[d.date] || {})[slot];
              const name = recipeName(rid);
              return (
                <button
                  key={d.date}
                  onClick={() => openPicker(d.date, slot)}
                  className={`m-1.5 p-2 rounded-lg text-xs text-left border transition-colors ${
                    name
                      ? "bg-emerald-800 text-amber-50 border-emerald-800"
                      : "border-dashed border-stone-300 text-stone-400 hover:border-stone-400"
                  }`}
                >
                  {name || "+ Add"}
                </button>
              );
            })}
          </div>
        ))}
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
            const rid = (mealPlan[activeDay.date] || {})[slot];
            const name = recipeName(rid);
            return (
              <button
                key={slot}
                onClick={() => openPicker(activeDay.date, slot)}
                className="w-full flex items-center justify-between bg-amber-50 border border-stone-200 rounded-xl px-4 py-3 text-left"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-stone-400">{SLOT_LABEL[slot]}</p>
                  <p className={`text-sm font-medium mt-0.5 ${name ? "text-stone-900" : "text-stone-400"}`}>
                    {name || "Tap to add"}
                  </p>
                </div>
                <ChevronRight size={16} className="text-stone-400" />
              </button>
            );
          })}
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
  onClear,
  onClose,
  onAddNew,
}: {
  recipes: Recipe[];
  slot: { date: string; slot: MealSlot };
  current: string | null | undefined;
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = recipes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-stone-900/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-amber-50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="font-display text-lg text-stone-900">{SLOT_LABEL[slot.slot]}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes…"
              className="w-full pl-8 pr-3 py-2 rounded-full border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
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
                  current === r.id ? "border-emerald-700 bg-emerald-50" : "border-stone-200 hover:bg-stone-50"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-stone-800">{r.name}</p>
                  <p className="text-xs text-stone-400">
                    {r.category} · {perServing} cal
                  </p>
                </div>
                {current === r.id && <Check size={16} className="text-emerald-700" />}
              </button>
            );
          })}
        </div>
        <div className="p-4 border-t border-stone-200 flex gap-2">
          {current && (
            <button
              onClick={onClear}
              className="flex-1 px-4 py-2 rounded-full text-sm font-medium text-orange-700 border border-orange-200 hover:bg-orange-50"
            >
              Clear meal
            </button>
          )}
          <button
            onClick={onAddNew}
            className="flex-1 px-4 py-2 rounded-full text-sm font-medium text-stone-600 border border-stone-200 hover:bg-stone-100"
          >
            + New recipe
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
}: {
  list: ShoppingItem[];
  onToggle: (id: string) => void;
  onRebuild: () => void;
  onClearChecked: () => void;
}) {
  const sortedList = useMemo(
    () => [...list].sort((a, b) => Number(a.checked) - Number(b.checked)),
    [list]
  );
  const hasChecked = list.some((item) => item.checked);

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
              <span className={`text-sm font-medium ${item.checked ? "text-stone-300" : "text-stone-600"}`}>
                {Math.round(item.quantity * 100) / 100} {item.unit}
              </span>
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
  }

  function startEdit(ing: LibraryIngredient) {
    setEditingId(ing.id);
    setFormName(ing.name);
    setFormUnit(ing.unit);
    setFormCalories(String(ing.caloriesPerUnit));
    setFormProtein(String(ing.proteinPerUnit));
    setFormFiber(String(ing.fiberPerUnit));
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
                onCancel={() => setEditingId(null)}
                onSubmit={submitForm}
                saving={saving}
                inline
              />
            ) : (
              <div key={ing.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-stone-800">{ing.name}</p>
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
  onCancel,
  onConfirm,
}: {
  message: string;
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
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
