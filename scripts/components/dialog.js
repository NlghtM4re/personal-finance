/* ============================================================
   dialog.js — promise-based confirm/prompt modals that match the
   app's styling, replacing blocking native confirm()/prompt().
     await confirmDialog('Delete this?', { danger:true })  -> boolean
     await promptDialog('Name:', 'default')                -> string|null
   Reuses the global .modal-overlay/.modal styles (components.css).
   ============================================================ */
(function () {
  'use strict';

  function build(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay open';
      const isPrompt = !!opts.prompt;
      const val = String(opts.defaultValue || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header"><h3 class="modal-title">${opts.title || 'Confirm'}</h3></div>
          <p style="color:var(--color-text-muted);font-size:.875rem;line-height:1.6;">${opts.message || ''}</p>
          ${isPrompt ? `<input type="text" id="__dlgInput" class="form-control" value="${val}" maxlength="${opts.maxlength || 80}" style="margin-top:12px;" />` : ''}
          <div class="modal-footer">
            <button type="button" class="btn btn--ghost" data-act="cancel">Cancel</button>
            <button type="button" class="btn ${opts.danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">${opts.confirmText || 'OK'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#__dlgInput');

      let settled = false;
      function done(value) {
        if (settled) return; settled = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(value);
      }
      const cancelValue = isPrompt ? null : false;
      const okValue = () => (isPrompt ? (input.value || '') : true);

      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => done(cancelValue));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => done(okValue()));
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) done(cancelValue); });
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); done(cancelValue); }
        else if (e.key === 'Enter' && (isPrompt || document.activeElement === overlay)) { e.preventDefault(); done(okValue()); }
      }
      document.addEventListener('keydown', onKey, true);

      if (input) { input.focus(); input.select(); }
      else overlay.querySelector('[data-act="ok"]').focus();
    });
  }

  window.confirmDialog = (message, opts = {}) => build({
    message, title: opts.title || 'Are you sure?',
    confirmText: opts.confirmText || 'Confirm', danger: opts.danger !== false,
  });
  window.promptDialog = (message, defaultValue = '', opts = {}) => build({
    prompt: true, message, defaultValue, maxlength: opts.maxlength,
    title: opts.title || '', confirmText: opts.confirmText || 'Save',
  });
})();
