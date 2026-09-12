import LarderApp from "@/components/LarderApp";
import { getAppData } from "@/lib/server/get-app-data";

// See app/page.tsx for why this is required.
export const dynamic = "force-dynamic";

// A dedicated URL that opens straight to the shopping list — meant to be
// bookmarked or saved to a phone's home screen for one-tap access, without
// landing on Home first.
export default async function ListPage() {
  const data = await getAppData();
  return <LarderApp {...data} initialView="shoppingList" />;
}
