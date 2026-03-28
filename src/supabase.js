import { createClient } from '@supabase/supabase-js';

// ── Replace these two values after you create your Supabase project ──────────
// Go to: supabase.com → your project → Settings → API
const SUPABASE_URL = 'https://nzlzcrfsyjqshfmyhqwc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bHpjcmZzeWpxc2hmbXlocXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTAzMDgsImV4cCI6MjA5MDI4NjMwOH0.4DGBQ93kR3zoWEYbGZ6nojugUsmOSN58w-n5GotWR-c';
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Cloud storage adapter ─────────────────────────────────────────────────────
// Same get/set/delete/list API as window.storage but backed by Supabase.
// Falls back to localStorage if user is offline or not logged in.
export function createCloudStorage(userId) {
  const local = {
    get: async (key) => {
      const value = localStorage.getItem(key);
      if (value === null) throw new Error('not found');
      return { key, value };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { key, value };
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    list: async (prefix = '') => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys };
    },
  };

  // If no userId, just use localStorage
  if (!userId) return local;

  const syncToCloud = async (key, value) => {
    try {
      await supabase.from('user_progress').upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' }
      );
    } catch (e) {
      // Silent fail — local save already happened
    }
  };

  return {
    get: async (key) => {
      // Try cloud first, fall back to local
      try {
        const { data, error } = await supabase
          .from('user_progress')
          .select('value')
          .eq('user_id', userId)
          .eq('key', key)
          .single();
        if (error || !data) throw new Error('not found');
        // Keep local in sync
        localStorage.setItem(key, data.value);
        return { key, value: data.value };
      } catch (e) {
        // Fall back to localStorage if offline
        const value = localStorage.getItem(key);
        if (value === null) throw new Error('not found');
        return { key, value };
      }
    },

    set: async (key, value) => {
      // Always write local immediately (instant UI)
      localStorage.setItem(key, value);
      // Then sync to cloud in background
      syncToCloud(key, value);
      return { key, value };
    },

    delete: async (key) => {
      localStorage.removeItem(key);
      try {
        await supabase.from('user_progress')
          .delete()
          .eq('user_id', userId)
          .eq('key', key);
      } catch (e) {}
      return { key, deleted: true };
    },

    list: async (prefix = '') => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys };
    },
  };
}
