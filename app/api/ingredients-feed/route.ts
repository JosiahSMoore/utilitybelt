import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Read-only feed of the ingredient library, for the recipe-import Claude
// Skill to fetch before writing a recipe — lets it match against existing
// ingredients (and know their unit-conversion data) instead of guessing
// blind from a separate copy-pasted list. Deliberately excluded from the
// site-wide login gate (see proxy.ts) since Claude Chat can't click
// through a password form; a long random token in the URL is the only
// protection, checked here rather than via the session cookie.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || token !== process.env.INGREDIENTS_FEED_TOKEN) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ingredients").select("*").order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ingredients = (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    baseUnit: row.base_unit,
    caloriesPerBaseUnit: Number(row.calories_per_base_unit) || 0,
    proteinPerBaseUnit: Number(row.protein_per_base_unit) || 0,
    fiberPerBaseUnit: Number(row.fiber_per_base_unit) || 0,
    referenceUnit: row.reference_unit,
    gramsPerReferenceUnit:
      row.grams_per_reference_unit === null ? null : Number(row.grams_per_reference_unit),
    pantryStaple: Boolean(row.pantry_staple),
  }));

  return NextResponse.json(
    { ingredients },
    { headers: { "Cache-Control": "no-store" } }
  );
}
