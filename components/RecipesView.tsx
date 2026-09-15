"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, Dumbbell, Flame, Plus, Search, Upload, Wheat } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { CATEGORIES, CATEGORY_INK, CATEGORY_RAIL } from "@/lib/constants";
import { recipeCalories, recipeFiber, recipeProtein } from "@/lib/helpers";
import type { Recipe } from "@/lib/types";

type SortMode = "name" | "ingredients";

export function RecipesView({
  recipes,
  allRecipesCount,
  query,
  setQuery,
  category,
  setCategory,
  onOpen,
  onAdd,
  onImport,
  onManageIngredients,
}: {
  recipes: Recipe[];
  allRecipesCount: number;
  query: string;
  setQuery: (q: string) => void;
  category: string;
  setCategory: (c: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onManageIngredients: () => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("name");

  const sorted = useMemo(() => {
    const copy = [...recipes];
    if (sortMode === "ingredients") {
      copy.sort((a, b) => b.ingredients.length - a.ingredients.length);
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    return copy;
  }, [recipes, sortMode]);

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Recipes</h1>
          <p className="text-[13px] text-black/45 mt-1">{allRecipesCount} saved</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={onManageIngredients}
            title="Manage ingredients"
            className="flex items-center justify-center gap-1.5 bg-white border border-black/[0.09] text-black/65 text-[13px] font-medium rounded-full hover:bg-black/[0.03] w-9 h-9 md:w-auto md:px-4 md:py-[11px]"
          >
            <BookOpen size={15} />
            <span className="hidden md:inline">Manage ingredients</span>
          </button>
          <button
            onClick={onImport}
            title="Import recipe from JSON"
            className="flex items-center justify-center gap-1.5 bg-white border border-black/[0.09] text-black/65 text-[13px] font-medium rounded-full hover:bg-black/[0.03] w-9 h-9 md:w-auto md:px-4 md:py-[11px]"
          >
            <Upload size={15} />
            <span className="hidden md:inline">Import</span>
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-[#b0430c] text-white text-[13.5px] font-semibold px-5 py-3 rounded-full"
          >
            <Plus size={15} /> Add recipe
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-[420px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full h-11 pl-9 pr-3 rounded-full bg-white border border-black/[0.09] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {["All", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`whitespace-nowrap px-[15px] py-2.5 rounded-full text-[12.5px] font-medium ${
                category === c
                  ? "bg-[#0f4a35] text-white"
                  : "bg-white border border-black/[0.09] text-black/60"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="appearance-none text-[12.5px] text-black/45 bg-transparent pr-5 focus:outline-none cursor-pointer"
          >
            <option value="name">Sort: name (A–Z)</option>
            <option value="ingredients">Sort: most ingredients</option>
          </select>
          <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" />
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No recipes match that"
          body="Try a different search or category."
          actionLabel="Clear filters"
          onAction={() => {
            setQuery("");
            setCategory("All");
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((r) => {
              const { perServing } = recipeCalories(r);
              const { perServing: proteinPerServing } = recipeProtein(r);
              const { perServing: fiberPerServing } = recipeFiber(r);
              const rail = CATEGORY_RAIL[r.category] ?? "#8a9bb0";
              const ink = CATEGORY_INK[r.category] ?? "#46505c";
              return (
                <button
                  key={r.id}
                  onClick={() => onOpen(r.id)}
                  className="text-left flex bg-[#fdf9ec] border border-[#f0dd9c] rounded-[14px] overflow-hidden hover:border-[#e6cf7d] hover:bg-[#fffdf4] transition-colors"
                >
                  <span className="w-1.5 flex-none" style={{ background: rail }} />
                  <div className="flex-1 p-[18px] min-w-0">
                    <div className="flex items-baseline gap-2.5 mb-2.5">
                      <span
                        className="text-[10px] tracking-[.13em] uppercase font-bold"
                        style={{ color: ink }}
                      >
                        {r.category}
                      </span>
                      <span className="ml-auto text-[11.5px] text-black/40 whitespace-nowrap">
                        {r.ingredients.length} ingredients
                      </span>
                    </div>
                    <div className="font-display text-[19px] font-semibold leading-[1.25] tracking-tight text-stone-900">
                      {r.name || "Untitled recipe"}
                    </div>
                    <div className="flex items-center gap-4 mt-3.5">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-[#b0430c]">
                        <Flame size={13} /> {perServing} cal
                      </span>
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-[#0f4a35]">
                        <Dumbbell size={13} /> {proteinPerServing}g
                      </span>
                      <span className="flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-[#8a6a10]">
                        <Wheat size={13} /> {fiberPerServing}g
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-[12.5px] text-black/40">
            Showing {sorted.length} of {allRecipesCount}
          </div>
        </>
      )}
    </div>
  );
}
