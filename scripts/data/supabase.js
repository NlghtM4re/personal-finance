/* ============================================================
   supabase.js — Supabase client + auth helpers
   Must be loaded after the Supabase CDN script
   ============================================================ */

const SUPABASE_URL = 'https://imnlobgrlrzsduzvwlvm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bjSU9Pn7R7DE_RIPmlYrXw_sEWE6YBl';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const SupaAuth = {
  /* Redirect to login if not authenticated. Call at top of each page init. */
  async requireAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const loginUrl = window.location.pathname.includes('/pages/')
        ? '../login.html'
        : 'login.html';
      window.location.replace(loginUrl);
      return null;
    }
    return session.user;
  },

  async getUser() {
    const { data: { session } } = await sb.auth.getSession();
    return session?.user || null;
  },

  async signOut() {
    await sb.auth.signOut();
    const loginUrl = window.location.pathname.includes('/pages/')
      ? '../login.html'
      : 'login.html';
    window.location.replace(loginUrl);
  },
};
