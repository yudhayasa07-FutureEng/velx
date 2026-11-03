import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Use in Server Components, Server Actions, and Route Handlers only. */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables.");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(values) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; the auth proxy handles refreshes. */ }
      },
    },
  });
}
