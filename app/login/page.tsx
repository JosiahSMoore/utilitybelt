import { safeNextPath } from "@/lib/site-auth";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = safeNextPath(
    typeof searchParams.next === "string" ? searchParams.next : undefined
  );
  const wrongPassword = searchParams.error === "1";

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4">
      <form
        action="/api/login"
        method="POST"
        className="w-full max-w-sm bg-amber-50 border border-stone-200 rounded-2xl p-6"
      >
        <h1 className="font-display text-2xl text-stone-900 mb-1">The Larder</h1>
        <p className="text-stone-500 text-sm mb-4">Enter the password to continue.</p>

        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          autoFocus
          placeholder="Password"
          className="w-full px-3 py-2.5 rounded-lg border border-stone-200 bg-white text-base mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />

        {wrongPassword && (
          <p className="text-sm text-orange-700 mb-3">Wrong password — try again.</p>
        )}

        <button
          type="submit"
          className="w-full py-2.5 rounded-full bg-emerald-800 text-amber-50 font-medium"
        >
          Enter
        </button>
      </form>
    </div>
  );
}
