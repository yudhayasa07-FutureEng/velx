import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let lastUrl = "";
let lastKey = "";

export function getSupabaseCredentials() {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let storedUrl = "";
  let storedKey = "";

  if (typeof window !== "undefined") {
    storedUrl = localStorage.getItem("velx_supabase_url") || "";
    storedKey = localStorage.getItem("velx_supabase_key") || "";
  }

  const url = envUrl || storedUrl;
  const key = envKey || storedKey;

  return {
    url,
    key,
    isFromEnv: Boolean(envUrl && envKey),
    isConfigured: Boolean(url && key),
  };
}

export function saveSupabaseCredentials(url: string, key: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("velx_supabase_url", url.trim());
    localStorage.setItem("velx_supabase_key", key.trim());
    cachedClient = null;
  }
}

export function clearSupabaseCredentials() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("velx_supabase_url");
    localStorage.removeItem("velx_supabase_key");
    cachedClient = null;
  }
}

/**
 * Creates or retrieves a Supabase browser client.
 * Returns null if credentials are not configured yet, preventing runtime crashes.
 */
export function getBrowserClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();
  const targetUrl = (customUrl || url).trim();
  const targetKey = (customKey || key).trim();

  if (!targetUrl || !targetKey) {
    return null;
  }

  if (cachedClient && lastUrl === targetUrl && lastKey === targetKey) {
    return cachedClient;
  }

  lastUrl = targetUrl;
  lastKey = targetKey;
  cachedClient = createBrowserClient(targetUrl, targetKey);
  return cachedClient;
}

export function createClient() {
  const client = getBrowserClient();
  if (!client) {
    throw new Error("Missing Supabase browser environment variables.");
  }
  return client;
}
