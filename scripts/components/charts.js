/* ============================================================
   charts.js — Canvas charts with hover tooltips
   ============================================================ */

const Charts = {

  COLORS: [
    '#94a3b8','#10b981','#f59e0b','#ef4444','#cbd5e1',
    '#06b6d4','#f97316','#84cc16','#ec4899','#64748b',
  ],

  _state: {},

  /* First draw: set pixel buffer from layout size. Subsequent redraws: only clearRect. */
  _setup(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth;
    const h   = canvas.offsetHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h, canvas };
  },

  _clear(s) {
    s._ctx.clearRect(0, 0, s._w, s._h);
    return { ctx: s._ctx, w: s._w, h: s._h, canvas: s._canvas };
  },

  _textColor()  { return '#64748b'; },
  _textLight()  { return '#94a3b8'; },
  _gridColor()  { return 'rgba(148,163,184,0.10)'; },

  _currencySymbol() {
    const c = localStorage.getItem('pf_currency') || 'USD';
    try { return (0).toLocaleString('en', { style: 'currency', currency: c, minimumFractionDigits: 0 }).replace(/[\d,.\s]/g, '').trim() || '$'; }
    catch { return '$'; }
  },

  _fmt(val) {
    const sym = this._currencySymbol();
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${sym}${(val / 1000000).toFixed(1)}M`;
    if (abs >= 1000)    return `${sym}${(val / 1000).toFixed(1)}k`;
    return `${sym}${Math.round(val)}`;
  },

  _fmtFull(val) {
    const currency = localStorage.getItem('pf_currency') || 'USD';
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(val); }
    catch { return `$${Math.abs(val).toFixed(2)}`; }
  },

  /* ── LINE CHART ──────────────────────────────────────────── */
  drawLineChart(canvasId, points, _redraw) {
    if (!_redraw) {
      const r = this._setup(canvasId);
      if (!r) return;
      this._state[canvasId] = { type: 'line', data: points, hoverIdx: -1,
        _ctx: r.ctx, _w: r.w, _h: r.h, _canvas: r.canvas };
    }
    const s = this._state[canvasId];
    if (!s || !s._ctx) return;
    const { ctx, w, h } = _redraw ? this._clear(s) : { ctx: s._ctx, w: s._w, h: s._h };
    if (!_redraw) ctx.clearRect(0, 0, w, h);

    if (!points.length) return;

    const pad = { top: 28, right: 20, bottom: 44, left: 68 };
    const cw  = w - pad.left - pad.right;
    const ch  = h - pad.top  - pad.bottom;

    const values  = points.map(p => p.balance);
    const minVal  = Math.min(...values);
    const maxVal  = Math.max(...values);
    const rawRange = maxVal - minVal || Math.abs(maxVal) || 1;
    const lo    = minVal - rawRange * 0.12;
    const hiVal = maxVal + rawRange * 0.12;
    const range = hiVal - lo;

    const toX = i => pad.left + (i / Math.max(points.length - 1, 1)) * cw;
    const toY = v => pad.top + ch - ((v - lo) / range) * ch;

    /* Grid + Y labels */
    const gridCount = 4;
    for (let g = 0; g <= gridCount; g++) {
      const v = lo + (g / gridCount) * range;
      const y = toY(v);
      ctx.strokeStyle = this._gridColor();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = this._textColor();
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(this._fmt(v), pad.left - 8, y);
    }

    /* X labels — step based on available width so they never overlap */
    const maxLabels = Math.max(2, Math.floor(cw / 42));
    const labelStep = Math.max(1, Math.ceil(points.length / maxLabels));
    ctx.fillStyle = this._textColor();
    ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    points.forEach((p, i) => {
      if (i % labelStep !== 0 && i !== points.length - 1) return;
      ctx.fillText(p.label, toX(i), pad.top + ch + 10);
    });

    /* Gradient fill */
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(226,232,240,0.12)');
    grad.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.lineTo(toX(points.length - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    /* Line */
    ctx.beginPath();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.moveTo(toX(0), toY(values[0]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(toX(i), toY(values[i]));
    ctx.stroke();

    /* Hover */
    const hi = s.hoverIdx;
    if (hi >= 0 && hi < points.length) {
      const hx = toX(hi), hy = toY(values[hi]);

      ctx.strokeStyle = 'rgba(226,232,240,0.25)'; ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hx, pad.top); ctx.lineTo(hx, pad.top + ch); ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();

      const t1 = points[hi].label;
      const t2 = this._fmtFull(values[hi]);
      ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
      const bw = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 24;
      const bh = 46;
      let bx = hx + 12, by = hy - bh / 2;
      if (bx + bw > w - 4) bx = hx - bw - 12;
      if (by < pad.top)    by = pad.top;
      if (by + bh > h - 4) by = h - bh - 4;

      ctx.fillStyle = 'rgba(10,10,10,0.92)';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(226,232,240,0.20)'; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = this._textLight();
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(t1, bx + 12, by + 9);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px "IBM Plex Sans", sans-serif';
      ctx.fillText(t2, bx + 12, by + 26);
    } else {
      const lx = toX(points.length - 1), ly = toY(values[values.length - 1]);
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#e2e8f0'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    }

    if (!_redraw) {
      const canvas = s._canvas;
      canvas.style.cursor = 'crosshair';
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let closest = 0, minDist = Infinity;
        points.forEach((_, i) => {
          const d = Math.abs(toX(i) - mx);
          if (d < minDist) { minDist = d; closest = i; }
        });
        if (s.hoverIdx !== closest) {
          s.hoverIdx = closest;
          this.drawLineChart(canvasId, points, true);
        }
      };
      canvas.onmouseleave = () => {
        if (s.hoverIdx !== -1) { s.hoverIdx = -1; this.drawLineChart(canvasId, points, true); }
      };
    }
  },

  /* ── DONUT CHART ─────────────────────────────────────────── */
  drawDonutChart(canvasId, slices, _redraw) {
    if (!_redraw) {
      const r = this._setup(canvasId);
      if (!r) return;
      this._state[canvasId] = { type: 'donut', data: slices, hoverIdx: -1,
        _ctx: r.ctx, _w: r.w, _h: r.h, _canvas: r.canvas };
    }
    const s = this._state[canvasId];
    if (!s || !s._ctx) return;
    const { ctx, w, h } = _redraw ? this._clear(s) : { ctx: s._ctx, w: s._w, h: s._h };
    if (!_redraw) ctx.clearRect(0, 0, w, h);

    if (!slices.length) return;

    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(w, h) / 2 - 10;
    const innerR = outerR * 0.60;
    const total  = slices.reduce((acc, sl) => acc + sl.value, 0);

    let angle = -Math.PI / 2;
    const segAngles = [];

    slices.forEach((sl, i) => {
      const sweep   = (sl.value / total) * Math.PI * 2;
      const hovered = s.hoverIdx === i;
      const r2      = hovered ? outerR + 7 : outerR;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r2, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = this.COLORS[i % this.COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();

      segAngles.push({ start: angle, end: angle + sweep });
      angle += sweep;
    });

    /* Hole */
    ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#000'; ctx.fill();

    /* Center label */
    ctx.textAlign = 'center';
    if (s.hoverIdx >= 0 && s.hoverIdx < slices.length) {
      const sl  = slices[s.hoverIdx];
      const pct = Math.round((sl.value / total) * 100);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this._fmtFull(sl.value), cx, cy + 2);
      ctx.fillStyle = this._textLight();
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`${pct}% · ${sl.label}`, cx, cy + 6);
    } else {
      ctx.fillStyle = this._textColor();
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Total spent', cx, cy + 1);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(this._fmt(total), cx, cy + 5);
    }

    if (!_redraw) {
      const canvas = s._canvas;
      canvas.style.cursor = 'pointer';
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left - cx;
        const my = e.clientY - rect.top  - cy;
        const dist = Math.sqrt(mx * mx + my * my);
        if (dist < innerR || dist > outerR + 12) {
          if (s.hoverIdx !== -1) { s.hoverIdx = -1; this.drawDonutChart(canvasId, slices, true); }
          return;
        }
        /* Normalize to [-PI/2, 3*PI/2] to match segment angle range */
        let a = Math.atan2(my, mx);
        if (a < -Math.PI / 2) a += Math.PI * 2;
        let found = -1;
        segAngles.forEach(({ start, end }, i) => { if (a >= start && a < end) found = i; });
        if (s.hoverIdx !== found) { s.hoverIdx = found; this.drawDonutChart(canvasId, slices, true); }
      };
      canvas.onmouseleave = () => {
        if (s.hoverIdx !== -1) { s.hoverIdx = -1; this.drawDonutChart(canvasId, slices, true); }
      };
    }
  },

  /* ── BAR CHART ───────────────────────────────────────────── */
  drawBarChart(canvasId, months, _redraw) {
    if (!_redraw) {
      const r = this._setup(canvasId);
      if (!r) return;
      this._state[canvasId] = { type: 'bar', data: months, hoverIdx: -1,
        _ctx: r.ctx, _w: r.w, _h: r.h, _canvas: r.canvas };
    }
    const s = this._state[canvasId];
    if (!s || !s._ctx) return;
    const { ctx, w, h } = _redraw ? this._clear(s) : { ctx: s._ctx, w: s._w, h: s._h };
    if (!_redraw) ctx.clearRect(0, 0, w, h);

    const pad = { top: 24, right: 16, bottom: 44, left: 68 };
    const cw  = w - pad.left - pad.right;
    const ch  = h - pad.top  - pad.bottom;

    const maxVal    = Math.max(...months.flatMap(m => [m.income, m.expense]), 1);
    const barGroupW = cw / months.length;
    const gap       = Math.max(6, barGroupW * 0.12);
    const barW      = Math.max(4, (barGroupW - gap * 3) / 2);
    const curMonth  = new Date().getMonth();

    /* Grid */
    for (let g = 0; g <= 4; g++) {
      const v = maxVal * (1 - g / 4);
      const y = pad.top + (g / 4) * ch;
      ctx.strokeStyle = this._gridColor(); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
      ctx.fillStyle = this._textColor();
      ctx.font = '11px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(this._fmt(v), pad.left - 8, y);
    }

    /* Store hit areas relative to w so hover detection stays consistent */
    const hitAreas = [];

    months.forEach((m, i) => {
      const groupX = pad.left + i * barGroupW + gap;
      const isCur  = i === curMonth;
      const isHov  = s.hoverIdx === i;

      const ih = m.income  > 0 ? Math.max(3, (m.income  / maxVal) * ch) : 0;
      const eh = m.expense > 0 ? Math.max(3, (m.expense / maxVal) * ch) : 0;

      /* Income bar */
      ctx.fillStyle = isHov ? '#34d399' : (isCur ? '#10b981' : 'rgba(16,185,129,0.55)');
      if (ih > 0) {
        ctx.beginPath();
        ctx.roundRect(groupX, pad.top + ch - ih, barW, ih, [3, 3, 0, 0]);
        ctx.fill();
      }

      /* Expense bar */
      ctx.fillStyle = isHov ? '#f87171' : (isCur ? '#ef4444' : 'rgba(239,68,68,0.55)');
      if (eh > 0) {
        ctx.beginPath();
        ctx.roundRect(groupX + barW + gap, pad.top + ch - eh, barW, eh, [3, 3, 0, 0]);
        ctx.fill();
      }

      /* Month label — skip every other on narrow canvases */
      const barLabelStep = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor(cw / 28))));
      if (i % barLabelStep === 0) {
        ctx.fillStyle    = isCur ? '#e2e8f0' : this._textColor();
        ctx.font         = isCur ? 'bold 11px "IBM Plex Sans", sans-serif' : '11px "IBM Plex Sans", sans-serif';
        ctx.textAlign    = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(m.label, groupX + barW + gap / 2, pad.top + ch + 10);
      }

      hitAreas.push({ x: groupX - gap / 2, width: barGroupW });

      /* Tooltip */
      if (isHov) {
        const net   = m.income - m.expense;
        const lines = [
          { text: m.label,                                                       color: this._textLight(), bold: false },
          { text: `In   ${this._fmtFull(m.income)}`,                             color: '#10b981',         bold: true  },
          { text: `Out  ${this._fmtFull(m.expense)}`,                            color: '#ef4444',         bold: true  },
          { text: `Net  ${net >= 0 ? '+' : ''}${this._fmtFull(net)}`,            color: net >= 0 ? '#10b981' : '#ef4444', bold: true },
        ];

        ctx.font = '12px "IBM Plex Sans", sans-serif';
        const maxTW = Math.max(...lines.map(l => ctx.measureText(l.text).width));
        const bw = maxTW + 24;
        const bh = lines.length * 18 + 14;

        let bx = groupX + barW - bw / 2;
        let by = pad.top + ch - Math.max(ih, eh, 1) - bh - 10;
        if (bx < pad.left)     bx = pad.left;
        if (bx + bw > w - 4)  bx = w - bw - 4;
        if (by < pad.top + 2) by = pad.top + 2;

        ctx.fillStyle = 'rgba(10,10,10,0.92)';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(226,232,240,0.18)'; ctx.lineWidth = 1; ctx.stroke();

        lines.forEach((l, li) => {
          ctx.fillStyle = l.color;
          ctx.font = l.bold ? 'bold 12px "IBM Plex Sans", sans-serif' : '11px "IBM Plex Sans", sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(l.text, bx + 12, by + 8 + li * 18);
        });
      }
    });

    /* Legend */
    ctx.textBaseline = 'bottom'; ctx.font = '11px "IBM Plex Sans", sans-serif';
    ctx.fillStyle = 'rgba(16,185,129,0.75)';
    ctx.fillRect(w - 110, h - 10 - 8, 8, 8);
    ctx.fillStyle = this._textColor(); ctx.textAlign = 'left';
    ctx.fillText('Income', w - 99, h - 10);
    ctx.fillStyle = 'rgba(239,68,68,0.75)';
    ctx.fillRect(w - 52, h - 10 - 8, 8, 8);
    ctx.fillStyle = this._textColor();
    ctx.fillText('Exp', w - 41, h - 10);

    if (!_redraw) {
      const canvas = s._canvas;
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let found = -1;
        hitAreas.forEach((a, i) => { if (mx >= a.x && mx < a.x + a.width) found = i; });
        if (s.hoverIdx !== found) { s.hoverIdx = found; this.drawBarChart(canvasId, months, true); }
      };
      canvas.onmouseleave = () => {
        if (s.hoverIdx !== -1) { s.hoverIdx = -1; this.drawBarChart(canvasId, months, true); }
      };
    }
  },
};
