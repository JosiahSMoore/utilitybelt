"use client";

import { Dumbbell, Flame, Wheat } from "lucide-react";
import type { DayNutrition } from "@/lib/types";

export function NutritionChips({
  nutrition,
  size = "sm",
}: {
  nutrition: DayNutrition;
  size?: "sm" | "xs";
}) {
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
