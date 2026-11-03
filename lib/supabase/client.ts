import { createBrowserClient } from "@supabase/ssr";

// Anon key is intentionally browser-safe (read Supabase docs on anon/public keys).
// The actual data security is enforced by RLS policies on the server, not by hiding this key.
// Never place the service_role key here.

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required."
    );
  }

  client = createBrowserClient(url, key);
  return client;
}

export function getOptionalClient() {
  try {
    return createClient();
  } catch {
    return null;
  }
}
