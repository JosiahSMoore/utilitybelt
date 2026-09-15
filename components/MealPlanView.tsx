"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChefHat,
  ChevronRight,
  Flame,
  Plus,
  Search,
  Shuffle,
  ShoppingCart,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { NutritionChips } from "@/components/NutritionChips";
import { CATEGORIES, MEAL_SLOTS, SLOT_LABEL } from "@/lib/constants";
import {
  defaultUnitForLibraryIngredient,
  getWeek,
  hasFlexIngredients,
  isConvertibleUnit,
  libraryIngredientMacros,
  libraryIngredientSummary,
  recipeCalories,
  slotDisplayName,
} from "@/lib/helpers";
import type {
  CustomMeal,
  DailyExtra,
  DayNutrition,
  Ingredient,
  LibraryIngredient,
  MealPlan,
  MealSlot,
  MealSlotValue,
  Recipe,
} from "@/lib/types";

type CellRef = { date: string; slot: MealSlot };

function cellKey(date: string, slot: MealSlot) {
  return `${date}:${slot}`;
}

function formatRange(days: ReturnType<typeof getWeek>): string {
  const first = new Date(days[0].date + "T00:00:00");
  const last = new Date(days[6].date + "T00:00:00");
  const firstLabel = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastLabel = last.toLocaleDateString("en-US", { day: "numeric" });
  return `${firstLabel} – ${lastLabel}`;
}

export function MealPlanView({
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
  onMoveMeal,
  onEnsureRange,
  cookingCell,
}: {
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
  onMoveMeal: (from: CellRef, to: CellRef) => void;
  onEnsureRange: (start: string, end: string) => void;
  cookingCell: CellRef | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const weekParam = searchParams.get("week");
  const weekAnchor = useMemo(() => {
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      return new Date(weekParam + "T00:00:00");
    }
    return new Date();
  }, [weekParam]);

  const days = useMemo(() => getWeek(weekAnchor), [weekAnchor]);
  const isCurrentWeek = days.some((d) => d.isToday) && days[0].date === getWeek()[0].date;

  useEffect(() => {
    onEnsureRange(days[0].date, days[6].date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0].date, days[6].date]);

  function pushWeek(anchorIso: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (anchorIso) params.set("week", anchorIso);
    else params.delete("week");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function shiftWeek(deltaDays: number) {
    const next = new Date(days[0].date + "T00:00:00");
    next.setDate(next.getDate() + deltaDays);
    pushWeek(next.toISOString().slice(0, 10));
  }

  function goThisWeek() {
    pushWeek(null);
  }

  // Week-paging arrow keys only act when focus isn't inside the grid — the
  // grid's own keydown handler (below) claims Left/Right for cell-to-cell
  // navigation and stops the event from ever reaching this listener.
  const gridRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (gridRef.current?.contains(document.activeElement)) return;
      if (e.key === "ArrowLeft") shiftWeek(-7);
      else if (e.key === "ArrowRight") shiftWeek(7);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  /* ---------- Drag to move/swap (pointer-based; the same md+ grid iPad renders) ---------- */

  const cellNodeRefs = useRef<Record<string, HTMLElement | null>>({});
  const [drag, setDrag] = useState<{
    from: CellRef;
    label: string;
    active: boolean;
    x: number;
    y: number;
    grabX: number;
    grabY: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<CellRef | null>(null);
  const [keyboardFrom, setKeyboardFrom] = useState<CellRef | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingRef = useRef<{
    from: CellRef;
    label: string;
    pointerId: number;
    startX: number;
    startY: number;
    grabX: number;
    grabY: number;
    width: number;
    height: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  // A completed drag still fires a native "click" on its source element
  // right after pointerup (pointer capture doesn't redirect that legacy
  // event) — this flag, set only for a real drag and cleared by the very
  // next click, tells the cell's onClick to swallow that one spurious click
  // instead of also opening the slot-actions modal.
  const justDraggedRef = useRef(false);

  function hitTestCell(x: number, y: number): CellRef | null {
    const el = document.elementFromPoint(x, y);
    const target = el?.closest("[data-cell-key]") as HTMLElement | null;
    if (!target) return null;
    const [date, slot] = (target.dataset.cellKey || "").split("|");
    if (!date || !slot) return null;
    return { date, slot: slot as MealSlot };
  }

  function beginPossibleDrag(e: ReactPointerEvent, from: CellRef, label: string) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const timer = setTimeout(() => promoteToActiveDrag(), 120);
    pendingRef.current = {
      from,
      label,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX,
      grabY,
      width: rect.width,
      height: rect.height,
      timer,
    };
  }

  function promoteToActiveDrag() {
    const p = pendingRef.current;
    if (!p || drag) return;
    clearTimeout(p.timer);
    setDrag({
      from: p.from,
      label: p.label,
      active: true,
      x: p.startX,
      y: p.startY,
      grabX: p.grabX,
      grabY: p.grabY,
      width: p.width,
      height: p.height,
    });
    setAnnouncement(`Moving ${p.label}. Drop on another slot, or press Escape to cancel.`);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const p = pendingRef.current;
    if (p && !drag) {
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (Math.sqrt(dx * dx + dy * dy) > 4) promoteToActiveDrag();
    }
    if (!drag) return;
    setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : prev));
    setHoverTarget(hitTestCell(e.clientX, e.clientY));
  }

  function handlePointerUp(e: ReactPointerEvent) {
    const p = pendingRef.current;
    if (p) {
      clearTimeout(p.timer);
      pendingRef.current = null;
    }
    if (!drag) return;
    if (drag.active) justDraggedRef.current = true;
    const target = hitTestCell(e.clientX, e.clientY);
    if (drag.active && target && (target.date !== drag.from.date || target.slot !== drag.from.slot)) {
      onMoveMeal(drag.from, target);
      setAnnouncement(`Moved ${drag.label}.`);
    }
    setDrag(null);
    setHoverTarget(null);
  }

  function cancelPointerDrag() {
    const p = pendingRef.current;
    if (p) {
      clearTimeout(p.timer);
      pendingRef.current = null;
    }
    if (drag) setAnnouncement("Move cancelled.");
    setDrag(null);
    setHoverTarget(null);
  }

  useEffect(() => {
    if (!drag) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelPointerDrag();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  /* ---------- Keyboard equivalent: focus a cell, Space picks up / drops ---------- */

  function focusCell(date: string, slot: MealSlot) {
    cellNodeRefs.current[cellKey(date, slot)]?.focus();
  }

  function handleGridKeyDown(e: ReactKeyboardEvent) {
    const target = (e.target as HTMLElement).closest("[data-cell-key]") as HTMLElement | null;
    if (!target) return;
    const [date, slot] = (target.dataset.cellKey || "").split("|") as [string, MealSlot];
    const dayIdx = days.findIndex((d) => d.date === date);
    const slotIdx = MEAL_SLOTS.indexOf(slot);
    if (dayIdx === -1 || slotIdx === -1) return;

    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      let nextDayIdx = dayIdx;
      let nextSlotIdx = slotIdx;
      if (e.key === "ArrowLeft") nextDayIdx = Math.max(0, dayIdx - 1);
      if (e.key === "ArrowRight") nextDayIdx = Math.min(days.length - 1, dayIdx + 1);
      if (e.key === "ArrowUp") nextSlotIdx = Math.max(0, slotIdx - 1);
      if (e.key === "ArrowDown") nextSlotIdx = Math.min(MEAL_SLOTS.length - 1, slotIdx + 1);
      focusCell(days[nextDayIdx].date, MEAL_SLOTS[nextSlotIdx]);
      return;
    }

    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      e.stopPropagation();
      const here = { date, slot };
      const name = slotDisplayName((mealPlan[date] || {})[slot], recipes);
      if (keyboardFrom) {
        if (keyboardFrom.date === date && keyboardFrom.slot === slot) {
          setKeyboardFrom(null);
          setAnnouncement("Cancelled.");
        } else {
          onMoveMeal(keyboardFrom, here);
          setAnnouncement(`Moved to ${SLOT_LABEL[slot]}.`);
          setKeyboardFrom(null);
        }
      } else if (name) {
        setKeyboardFrom(here);
        setAnnouncement(`Picked up ${name}. Use arrow keys to choose a new spot, Space to drop, Escape to cancel.`);
      }
      return;
    }

    if (e.key === "Escape" && keyboardFrom) {
      e.preventDefault();
      e.stopPropagation();
      setKeyboardFrom(null);
      setAnnouncement("Cancelled.");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-[32px] font-semibold tracking-tight text-stone-900">Meal plan</h1>
          <p className="text-[13px] text-black/45 mt-1">{formatRange(days)}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => shiftWeek(-7)}
            className="w-10 h-10 rounded-full bg-white border border-black/[0.09] text-black/45 flex items-center justify-center"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            onClick={goThisWeek}
            className="text-[13px] font-medium px-4 py-[11px] rounded-full bg-white border border-black/[0.09] text-black/65"
          >
            {isCurrentWeek ? "This week" : formatRange(days)}
          </button>
          <button
            onClick={() => shiftWeek(7)}
            className="w-10 h-10 rounded-full bg-white border border-black/[0.09] text-black/45 flex items-center justify-center"
            aria-label="Next week"
          >
            ›
          </button>
          <button
            onClick={onBuildList}
            className="flex items-center gap-1.5 bg-[#b0430c] text-white text-[13.5px] font-semibold px-5 py-3 rounded-full ml-1.5"
          >
            <ShoppingCart size={15} /> Build shopping list
          </button>
        </div>
      </div>

      {recipes.length === 0 && (
        <p className="text-sm text-stone-500 mb-4 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
          Add a few recipes first so you have something to plan with.
        </p>
      )}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Desktop/iPad grid */}
      <div
        ref={gridRef}
        onKeyDown={handleGridKeyDown}
        className={`hidden md:block bg-white border border-black/[0.07] rounded-2xl overflow-hidden select-none ${
          !isCurrentWeek ? "opacity-[0.92]" : ""
        }`}
      >
        <div className="grid grid-cols-8">
          <div className="border-b border-black/[0.07]" />
          {days.map((d) => {
            const n = dayNutrition(d.date);
            return (
              <div
                key={d.date}
                className={`p-3.5 text-center border-b ${
                  d.isToday
                    ? "bg-[#fdf9ec] border-l border-r border-[#f0dd9c] border-b-[#f0dd9c]"
                    : "border-black/[0.07]"
                }`}
              >
                <p
                  className={`text-[10px] tracking-[.13em] uppercase font-bold ${
                    d.isToday ? "text-[#8a6a10]" : "font-semibold text-black/40"
                  }`}
                >
                  {d.weekday}
                  {d.isToday ? " · today" : ""}
                </p>
                <p className={`font-display text-[22px] font-semibold my-0.5 ${d.isToday ? "" : "text-black/55"}`}>
                  {d.dayNum}
                </p>
                {n.calories > 0 ? (
                  <>
                    <p className="text-[11.5px] tabular-nums text-black/55">{n.calories.toLocaleString()} cal</p>
                    <p className="text-[11.5px] tabular-nums text-black/40">
                      {n.protein}P · {n.fiber}F
                    </p>
                  </>
                ) : (
                  <p className="text-[11.5px] text-black/30">—</p>
                )}
              </div>
            );
          })}
        </div>

        {MEAL_SLOTS.map((slot) => (
          <div key={slot} className="grid grid-cols-8">
            <div className="p-4 text-xs uppercase tracking-wide font-semibold text-black/45 flex items-center border-b border-black/[0.05]">
              {SLOT_LABEL[slot]}
            </div>
            {days.map((d) => {
              const key = cellKey(d.date, slot);
              const slotValue = (mealPlan[d.date] || {})[slot];
              const name = slotDisplayName(slotValue, recipes);
              const isCooking = Boolean(cookingCell && cookingCell.date === d.date && cookingCell.slot === slot);
              const isDragSource = Boolean(drag && drag.from.date === d.date && drag.from.slot === slot);
              const isKeyboardSource = Boolean(
                keyboardFrom && keyboardFrom.date === d.date && keyboardFrom.slot === slot
              );
              const isHoverTarget = Boolean(
                hoverTarget && hoverTarget.date === d.date && hoverTarget.slot === slot && !isDragSource
              );
              return (
                <div
                  key={key}
                  data-cell-key={`${d.date}|${slot}`}
                  ref={(el) => {
                    cellNodeRefs.current[key] = el;
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={name ? `${name}, ${SLOT_LABEL[slot]}, ${d.weekday} ${d.dayNum}` : `Empty ${SLOT_LABEL[slot]} slot, ${d.weekday} ${d.dayNum}`}
                  onPointerDown={name ? (e) => beginPossibleDrag(e, { date: d.date, slot }, name) : undefined}
                  onPointerMove={name ? handlePointerMove : undefined}
                  onPointerUp={name ? handlePointerUp : undefined}
                  onPointerCancel={name ? cancelPointerDrag : undefined}
                  onClick={() => {
                    if (justDraggedRef.current) {
                      justDraggedRef.current = false;
                      return;
                    }
                    name ? openSlotActions(d.date, slot) : openPicker(d.date, slot);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !keyboardFrom) {
                      name ? openSlotActions(d.date, slot) : openPicker(d.date, slot);
                    }
                  }}
                  className={`m-[7px] rounded-[9px] text-[13px] text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#0f4a35] ${
                    name ? "touch-none" : ""
                  } ${isDragSource ? "opacity-0" : ""}`}
                  style={{ minHeight: 48 }}
                >
                  {isCooking ? (
                    <div className="p-[10px_11px] rounded-[9px] bg-[#0f4a35] text-white">
                      <div className="font-semibold leading-tight">{name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,.65)" }}>
                        cooking
                      </div>
                    </div>
                  ) : name ? (
                    <div
                      className={`p-[10px_11px] rounded-[9px] transition-colors ${
                        isKeyboardSource
                          ? "bg-[#0f4a35]/10 border border-[#0f4a35]"
                          : d.isToday
                            ? "bg-white border border-[#f0dd9c]"
                            : "bg-[#f7f6f3]"
                      } ${isHoverTarget ? "ring-2 ring-[#0f4a35]" : ""}`}
                    >
                      <div className="font-semibold leading-tight text-stone-900">{name}</div>
                    </div>
                  ) : (
                    <div
                      className={`flex items-center justify-center rounded-[9px] border border-dashed ${
                        isHoverTarget
                          ? "border-[#0f4a35] bg-[#0f4a35]/[0.06]"
                          : d.isToday
                            ? "border-[#e6cf7d] text-[#8a6a10]"
                            : "border-black/[0.14] text-black/25"
                      }`}
                      style={{ minHeight: 48 }}
                    >
                      <Plus size={14} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="grid grid-cols-8">
          <div className="p-4 text-xs uppercase tracking-wide font-semibold text-black/45 flex items-center">
            Extras
          </div>
          {days.map((d) => {
            const extras = dailyExtras.filter((e) => e.date === d.date);
            const total = extras.reduce((sum, e) => sum + e.calories, 0);
            return (
              <div key={d.date} className="m-[7px]">
                <button
                  onClick={() => openExtras(d.date)}
                  className={`w-full flex items-center justify-center gap-1.5 rounded-[9px] border border-dashed text-[12.5px] ${
                    d.isToday ? "border-[#e6cf7d] text-[#8a6a10]" : "border-black/[0.14] text-black/28"
                  }`}
                  style={{ minHeight: 48 }}
                >
                  {extras.length > 0 ? `${extras.length} · ${total} cal` : <Plus size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="hidden md:block mt-3.5 text-[12.5px] text-black/40">
        Drag a meal to move it · click a card to swap the recipe
      </p>

      {/* Pointer drag preview */}
      {drag && drag.active && (
        <div
          className="fixed z-[60] pointer-events-none rounded-[9px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] border border-black/10 px-[11px] py-[10px] text-[13px] font-semibold text-stone-900"
          style={{
            left: drag.x - drag.grabX,
            top: drag.y - drag.grabY,
            width: drag.width,
            transform: "scale(1.03) rotate(2deg)",
          }}
        >
          {drag.label}
        </div>
      )}

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

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftWeek(-7)} className="text-sm text-stone-500 px-2">‹ Week</button>
          <button onClick={goThisWeek} className="text-xs font-medium text-emerald-800">
            {isCurrentWeek ? "This week" : formatRange(days)}
          </button>
          <button onClick={() => shiftWeek(7)} className="text-sm text-stone-500 px-2">Week ›</button>
        </div>

        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <p className="font-display text-lg text-stone-900">
            {days[activeDayIdx].weekday} {days[activeDayIdx].month} {days[activeDayIdx].dayNum}
          </p>
          <NutritionChips nutrition={dayNutrition(days[activeDayIdx].date)} />
        </div>

        <div className="space-y-2">
          {MEAL_SLOTS.map((slot) => {
            const activeDay = days[activeDayIdx];
            const slotValue = (mealPlan[activeDay.date] || {})[slot];
            const name = slotDisplayName(slotValue, recipes);
            const assignedRecipe = slotValue?.recipeId
              ? recipes.find((r) => r.id === slotValue.recipeId)
              : null;
            const isModifiable = Boolean(assignedRecipe && hasFlexIngredients(assignedRecipe));
            return (
              <button
                key={slot}
                onClick={() => (name ? openSlotActions(activeDay.date, slot) : openPicker(activeDay.date, slot))}
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
            const activeDay = days[activeDayIdx];
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

/* ---------- Recipe picker (empty cell, or "Swap recipe" on a filled one) ---------- */

export function RecipePickerModal({
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
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Restaurant burger"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Protein (g)</label>
                <input
                  type="number"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Fiber (g)</label>
                <input
                  type="number"
                  value={customFiber}
                  onChange={(e) => setCustomFiber(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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

/* ---------- Extras ---------- */

export function ExtrasModal({
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
    const targetUnit = isConvertibleUnit(lib, unit) ? unit : defaultUnitForLibraryIngredient(lib);
    const qty = parseFloat(quantity) || 1;
    setName(lib.name);
    setUnit(targetUnit);
    const macros = libraryIngredientMacros(lib, qty, targetUnit);
    if (macros) setCalories(String(Math.round(macros.calories * 100) / 100));
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
                className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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
                        {libraryIngredientSummary(s)}
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
                  className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="Calories"
                  className="px-2.5 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What did you eat?"
                className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <input
                type="number"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder="Calories"
                className="px-3 py-2 rounded-lg border border-stone-200 bg-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
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

/* ---------- Flex modify ---------- */

export function FlexModifyModal({
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

/* ---------- Meal slot action dialog ---------- */

export function MealSlotActionModal({
  name,
  canModify,
  canCook,
  onRemove,
  onModify,
  onCook,
  onSwap,
  onClose,
}: {
  name: string;
  canModify: boolean;
  canCook: boolean;
  onRemove: () => void;
  onModify: () => void;
  onCook: () => void;
  onSwap: () => void;
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
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChefHat size={16} /> Cook meal
          </button>
          <button
            onClick={onSwap}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border border-stone-200 text-stone-700 hover:bg-stone-100"
          >
            <Search size={16} /> Swap recipe
          </button>
          <button
            onClick={onModify}
            disabled={!canModify}
            title={canModify ? undefined : "This meal has no flexible ingredients"}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-amber-700 text-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Shuffle size={16} /> Modify ingredients
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
