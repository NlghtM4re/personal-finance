/* ============================================================
   charts.js — Canvas-based charts (no external library needed)
   ============================================================ */

const Charts = {

  COLORS: [
    '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
  ],

  _getCtx(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    return { ctx, w: canvas.offsetWidth, h: canvas.offsetHeight };
  },

  _isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  },

  _textColor()   { return this._isDark() ? '#94a3b8' : '#64748b'; },
  _gridColor()   { return this._isDark() ? '#334155' : '#e2e8f0'; },
  _surfaceColor(){ return this._isDark() ? '#1e293b' : '#ffffff'; },

  /* ---- Line chart: balance over time ---- */
  drawLineChart(canvasId, points) {
    const r = this._getCtx(canvasId);
    if (!r || !points.length) return;
    const { ctx, w, h } = r;

    const pad = { top: 20, right: 16, bottom: 40, left: 60 };
    const cw  = w - pad.left - pad.right;
    const ch  = h - pad.top  - pad.bottom;

    const values  = points.map(p => p.balance);
    const minVal  = Math.min(...values);
    const maxVal  = Math.max(...values);
    const range   = maxVal - minVal || 1;

    const toX = i  => pad.left + (i / (points.length - 1)) * cw;
    const toY = v  => pad.top  + ch - ((v - minVal) / range) * ch;

    ctx.clearRect(0, 0, w, h);

    /* Grid lines */
    const gridLines = 4;
    ctx.strokeStyle = this._gridColor();
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (i / gridLines) * ch;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cw, y);
      ctx.stroke();
      const val = maxVal - (i / gridLines) * range;
      ctx.fillStyle   = this._textColor();
      ctx.font        = `11px Inter, sans-serif`;
      ctx.textAlign   = 'right';
      ctx.fillText(this._shortCurrency(val), pad.left - 6, y + 4);
    }
    ctx.setLineDash([]);

    /* Gradient fill */
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0,   'rgba(99,102,241,0.25)');
    grad.addColorStop(1,   'rgba(99,102,241,0)');
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(values[0]));
    points.forEach((p, i) => {
      if (i === 0) return;
      const cp1x = toX(i - 0.5);
      ctx.bezierCurveTo(cp1x, toY(values[i-1]), cp1x, toY(p.balance), toX(i), toY(p.balance));
    });
    ctx.lineTo(toX(points.length - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* Line */
    ctx.beginPath();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.moveTo(toX(0), toY(values[0]));
    points.forEach((p, i) => {
      if (i === 0) return;
      const cp1x = toX(i - 0.5);
      ctx.bezierCurveTo(cp1x, toY(values[i-1]), cp1x, toY(p.balance), toX(i), toY(p.balance));
    });
    ctx.stroke();

    /* X-axis labels (every N points) */
    const labelStep = Math.max(1, Math.floor(points.length / 6));
    ctx.fillStyle  = this._textColor();
    ctx.font       = '11px Inter, sans-serif';
    ctx.textAlign  = 'center';
    points.forEach((p, i) => {
      if (i % labelStep !== 0 && i !== points.length - 1) return;
      ctx.fillText(p.label, toX(i), h - 8);
    });

    /* Dot at last point */
    const lx = toX(points.length - 1);
    const ly = toY(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.strokeStyle = this._surfaceColor();
    ctx.lineWidth   = 2;
    ctx.stroke();
  },

  /* ---- Donut chart: category spending ---- */
  drawDonutChart(canvasId, slices) {
    const r = this._getCtx(canvasId);
    if (!r || !slices.length) return;
    const { ctx, w, h } = r;

    const cx  = w / 2;
    const cy  = h / 2;
    const rad = Math.min(w, h) / 2 - 8;
    const inner = rad * 0.58;

    const total = slices.reduce((s, sl) => s + sl.value, 0);
    let angle   = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);

    slices.forEach((sl, i) => {
      const sweep = (sl.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rad, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = this.COLORS[i % this.COLORS.length];
      ctx.fill();

      /* Gap */
      ctx.strokeStyle = this._surfaceColor();
      ctx.lineWidth   = 2;
      ctx.stroke();

      angle += sweep;
    });

    /* Inner hole */
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = this._surfaceColor();
    ctx.fill();

    /* Center text */
    ctx.fillStyle  = this._textColor();
    ctx.font       = 'bold 14px Inter, sans-serif';
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._shortCurrency(total), cx, cy);
  },

  /* ---- Grouped bar chart: monthly overview ---- */
  drawBarChart(canvasId, months) {
    const r = this._getCtx(canvasId);
    if (!r) return;
    const { ctx, w, h } = r;

    const pad = { top: 20, right: 16, bottom: 36, left: 56 };
    const cw  = w - pad.left - pad.right;
    const ch  = h - pad.top  - pad.bottom;

    const maxVal = Math.max(...months.flatMap(m => [m.income, m.expense]), 1);
    const barGroupW = cw / months.length;
    const barW      = (barGroupW - 8) / 2;

    ctx.clearRect(0, 0, w, h);

    /* Grid */
    ctx.strokeStyle = this._gridColor();
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 4]);
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (i / gridLines) * ch;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cw, y);
      ctx.stroke();
      const val = maxVal * (1 - i / gridLines);
      ctx.fillStyle  = this._textColor();
      ctx.font       = '11px Inter, sans-serif';
      ctx.textAlign  = 'right';
      ctx.fillText(this._shortCurrency(val), pad.left - 6, y + 4);
    }
    ctx.setLineDash([]);

    months.forEach((m, i) => {
      const gx = pad.left + i * barGroupW + 4;

      /* Income bar */
      const ih = (m.income / maxVal) * ch;
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.roundRect(gx, pad.top + ch - ih, barW, ih, [3, 3, 0, 0]);
      ctx.fill();

      /* Expense bar */
      const eh = (m.expense / maxVal) * ch;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(gx + barW + 2, pad.top + ch - eh, barW, eh, [3, 3, 0, 0]);
      ctx.fill();

      /* Month label */
      ctx.fillStyle  = this._textColor();
      ctx.font       = '11px Inter, sans-serif';
      ctx.textAlign  = 'center';
      ctx.fillText(m.label, gx + barW + 1, h - 8);
    });
  },

  _shortCurrency(val) {
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${Math.round(val)}`;
  },
};
