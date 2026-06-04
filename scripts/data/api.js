/* ============================================================
   api.js — Thin fetch wrapper for the FinTrack backend
   All pages load this before store.js
   ============================================================ */

const API = (() => {
  /* Set FINTRACK_API in localStorage to point at your backend:
     localStorage.setItem('FINTRACK_API', 'https://your-app.railway.app')
     Or it falls back to same-origin /api (if backend serves frontend too) */
  function baseUrl() {
    return localStorage.getItem('FINTRACK_API') || '/api';
  }

  function apiKey() {
    return localStorage.getItem('FINTRACK_KEY') || '';
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const key = apiKey();
    if (key) headers['x-api-key'] = key;

    const res = await fetch(baseUrl() + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return {
    get:    (path)         => request('GET',    path),
    post:   (path, body)   => request('POST',   path, body),
    put:    (path, body)   => request('PUT',    path, body),
    delete: (path)         => request('DELETE', path),
    isConfigured() {
      return !!localStorage.getItem('FINTRACK_API');
    },
  };
})();
