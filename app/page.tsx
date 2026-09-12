import LarderApp from "@/components/LarderApp";
import { getAppData } from "@/lib/server/get-app-data";

// Without this, Next.js has nothing telling it this page depends on request
// time or uncached data, so it prerenders it once at build time and serves
// that frozen snapshot to every visitor forever after.
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getAppData();
  return <LarderApp {...data} />;
}
