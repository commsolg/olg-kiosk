/*
 * OLG Pledge Widget: <olg-pledge-widget>
 * Embeds on any page (eCatholic, etc.). Records a pledge in MinistryPlatform
 * and sends the donor to Square's secure checkout for their first gift.
 *
 *   <script src="https://YOUR-SERVER/widget.js" defer></script>
 *   <olg-pledge-widget api="https://YOUR-SERVER" campaign="8" lang="auto"></olg-pledge-widget>
 *
 * Optional attributes (defaults match the Building Faith Together II pledge card):
 *   weekly-amounts="20,15,10,5"  monthly-amounts="80,60,40,20"  once-amounts="80,60,40,20"
 *   frequencies="weekly,monthly,once"  default-frequency="weekly"
 *   end-date="2027-10-31" (defaults to the campaign's end date)
 *   primary-color="#a08868"  ink-color="#3b3b3b"  hide-progress
 */
(() => {
  if (customElements.get('olg-pledge-widget')) return;

  const T = {
    en: {
      headline: 'How many futures will your generosity help build?',
      goal: 'Goal', pledged: 'Pledged', received: 'Received', of: 'of goal received',
      weekly: 'Weekly', monthly: 'Monthly', once: 'One-time gift',
      choose: 'Choose your gift', own: 'Or, choose your own gift', ownPh: 'Other amount',
      perWeek: '/week', perMonth: '/month',
      planOnce: 'One gift of {amt}',
      plan: '{per} {freq} × {n} gifts = {total}',
      planDates: '{start} through {end}', change: 'Change dates', start: 'First gift', end: 'Last gift',
      freqWord: { weekly: 'weekly', monthly: 'monthly' },
      aboutYou: 'Your information', names: 'Name(s)', namesHelp: 'First and last name (add a spouse, e.g. “Juan & Maria Garcia”)',
      first: 'First name', last: 'Last name', email: 'Email', phone: 'Phone (optional)',
      address: 'Address (optional)', city: 'City, State, Zip (optional)',
      emailHelp: 'Use the email the parish has on file so your gifts are credited to you.',
      payNow: 'How would you like to give?', payFirst: 'Credit card: give my first gift now ({amt})', payFull: 'Credit card: pay my full pledge now ({amt})',
      payLater: 'Cash or check: I’ll give at the office or in the collection basket',
      submitPay: 'Continue to secure payment', submit: 'Make my pledge',
      secure: 'Card payments are processed securely by Square. Your card details never touch our website.',
      working: 'Saving your pledge…', redirect: 'Taking you to secure checkout…',
      thanks: 'Thank you,', thanksSub: 'know and love Christ.',
      thanksPaid: 'Your gift was received. Square will email your receipt.',
      thanksBody: 'We’ve recorded your pledge of {total}.',
      thanksLater: 'Checks are payable to Our Lady of Guadalupe Parish. Bring your gift to the office or drop it in the collection basket.',
      payUnavailable: 'We couldn’t open the card payment page just now, but your pledge is saved. You can give your first gift later online, at the office, or in the collection basket.',
      another: 'Make another pledge', closed: 'Online pledges for this campaign are closed. Please contact the parish office.',
      err: { required: 'Required', invalid_email: 'Enter a valid email', invalid_amount: 'Choose or enter an amount of at least $1', invalid_date: 'Check this date', too_far: 'Choose an end date within 10 years', generic: 'Something went wrong. Please try again, or call the parish office.', too_many_requests: 'Too many attempts. Please try again later.', not_accepting: 'Online pledges for this campaign are closed.' },
      lang: 'Español',
    },
    es: {
      headline: '¿Cuántos futuros ayudará a construir su generosidad?',
      goal: 'Meta', pledged: 'Prometido', received: 'Recibido', of: 'de la meta recibido',
      weekly: 'Semanal', monthly: 'Mensual', once: 'Una vez',
      choose: 'Elija su donativo', own: 'O elija su propio donativo', ownPh: 'Otra cantidad',
      perWeek: '/semana', perMonth: '/mes',
      planOnce: 'Un donativo de {amt}',
      plan: '{per} {freq} × {n} donativos = {total}',
      planDates: 'del {start} al {end}', change: 'Cambiar fechas', start: 'Primer donativo', end: 'Último donativo',
      freqWord: { weekly: 'semanal', monthly: 'mensual' },
      aboutYou: 'Sus datos', names: 'Nombre(s)', namesHelp: 'Nombre y apellido',
      first: 'Nombre', last: 'Apellido', email: 'Correo electrónico', phone: 'Teléfono (opcional)',
      address: 'Dirección (opcional)', city: 'Ciudad, estado, código postal (opcional)',
      emailHelp: 'Use el correo que la parroquia tiene registrado para acreditar sus donativos.',
      payNow: '¿Cómo desea donar?', payFirst: 'Tarjeta: dar mi primer donativo ahora ({amt})', payFull: 'Tarjeta: pagar mi promesa completa ahora ({amt})',
      payLater: 'Efectivo o cheque: lo entregaré en la oficina o en la canasta de la colecta',
      submitPay: 'Continuar al pago seguro', submit: 'Hacer mi promesa',
      secure: 'Los pagos con tarjeta se procesan de forma segura con Square. Los datos de su tarjeta nunca pasan por nuestro sitio.',
      working: 'Guardando su promesa…', redirect: 'Llevándole al pago seguro…',
      thanks: 'Gracias,', thanksSub: 'conocer y amar a Cristo.',
      thanksPaid: 'Recibimos su donativo. Square le enviará el recibo por correo.',
      thanksBody: 'Registramos su promesa de {total}.',
      thanksLater: 'Los cheques se hacen a nombre de Our Lady of Guadalupe Parish. Entregue su donativo en la oficina o en la canasta de la colecta.',
      payUnavailable: 'No pudimos abrir la página de pago con tarjeta en este momento, pero su promesa quedó registrada. Puede dar su primer donativo más tarde en línea, en la oficina o en la canasta de la colecta.',
      another: 'Hacer otra promesa', closed: 'Las promesas en línea para esta campaña están cerradas. Comuníquese con la oficina parroquial.',
      err: { required: 'Obligatorio', invalid_email: 'Escriba un correo válido', invalid_amount: 'Elija o escriba una cantidad de al menos $1', invalid_date: 'Revise esta fecha', too_far: 'Elija una fecha final dentro de 10 años', generic: 'Algo salió mal. Inténtelo de nuevo o llame a la oficina parroquial.', too_many_requests: 'Demasiados intentos. Inténtelo más tarde.', not_accepting: 'Las promesas en línea para esta campaña están cerradas.' },
      lang: 'English',
    },
  };

  // ---- schedule math (mirrors the server) ----
  const toD = s => new Date(`${s}T12:00:00Z`);
  const fmtD = d => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fmtD(d); };
  const addMonths = (s, n) => { const d = toD(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return fmtD(d); };
  const STEP = { weekly: d => addDays(d, 7), monthly: d => addMonths(d, 1), quarterly: d => addMonths(d, 3), annually: d => addMonths(d, 12) };
  const count = (f, a, b) => { if (!STEP[f] || !a || !b || b < a) return 1; let n = 0; for (let d = a; d <= b && n < 1000; d = STEP[f](d)) n++; return Math.max(n, 1); };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nums = (s, d) => (s || d).split(',').map(Number).filter(n => n > 0).slice(0, 6);
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

  const CSS = `
  :host{--p:var(--olg-primary,#a08868);--ink:var(--olg-ink,#3b3b3b);--muted:#6b6b6b;--line:#e2dccf;--soft:#f8f5ef;--bad:#b42318;
    display:block;font-family:'Montserrat',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--ink);line-height:1.45;max-width:680px;margin:0 auto}
  *{box-sizing:border-box}
  .card{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}
  header{padding:24px 24px 18px;text-align:center;border-bottom:1px solid var(--line);background:var(--soft);position:relative}
  .title{font-family:'Times New Roman',Georgia,serif;font-size:2rem;margin:0;letter-spacing:-.5px;line-height:1.15}
  .title em{color:var(--p)}
  .headline{margin:10px 0 0;font-weight:800;font-size:1.08rem;text-transform:uppercase;letter-spacing:.2px;line-height:1.3}
  .desc{margin:8px 0 0;color:var(--muted);font-size:.93rem}
  .langbtn{position:absolute;top:12px;right:12px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.8rem;color:var(--ink);cursor:pointer}
  .bar{height:8px;border-radius:999px;background:#ebe5d9;margin:16px 0 8px;overflow:hidden;text-align:left}
  .bar>span{display:block;height:100%;background:var(--p);border-radius:999px;transition:width .6s}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:.8rem;color:var(--muted)}
  .stats b{display:block;color:var(--ink);font-size:1rem}
  form,.done{padding:22px 24px}
  fieldset{border:0;margin:0 0 22px;padding:0}
  legend,.lbl{font-weight:700;margin-bottom:8px;display:block;font-size:.95rem}
  .sect{font-weight:800;text-transform:uppercase;color:var(--p);letter-spacing:.4px;font-size:.9rem;margin-bottom:10px;display:block}
  .tabs{display:grid;grid-template-columns:repeat(var(--n,3),1fr);gap:8px;margin-bottom:14px}
  .tab,.chip{position:relative}
  .tab input,.chip input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer;width:100%;height:100%}
  .tab span{display:block;text-align:center;padding:10px 6px;border-radius:10px;border:1.5px solid var(--line);font-weight:800;text-transform:uppercase;font-size:.85rem;letter-spacing:.3px;color:var(--p)}
  .tab input:checked+span{background:var(--p);border-color:var(--p);color:#fff}
  .chips{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .chip span{display:block;border:1.5px solid var(--line);border-radius:10px;padding:12px 4px;text-align:center;font-weight:800;font-size:1.35rem;background:#fff}
  .chip small{font-size:.72rem;font-weight:600;color:var(--muted)}
  .chip input:checked+span{border-color:var(--p);background:color-mix(in srgb,var(--p) 12%,#fff)}
  .chip input:focus-visible+span,.tab input:focus-visible+span{outline:3px solid color-mix(in srgb,var(--p) 45%,transparent);outline-offset:2px}
  .own{margin-top:14px}
  .money{position:relative}
  .money:before{content:'$';position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--p);font-weight:800;font-size:1.1rem}
  .money input[type=number]{padding-left:28px}
  input[type=text],input[type=email],input[type=tel],input[type=date],input[type=number]{width:100%;font:inherit;padding:11px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink)}
  input:focus{outline:none;border-color:var(--p)}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .field{display:block}.field small{display:block;color:var(--muted);margin-top:4px;font-size:.8rem}
  .e{color:var(--bad);font-size:.8rem;margin-top:4px;display:block}
  .invalid{border-color:var(--bad)!important}
  .plan{background:var(--soft);border-radius:10px;padding:12px 14px;margin-top:14px}
  .plan b{display:block;font-size:1.02rem}
  .plan span{color:var(--muted);font-size:.85rem}
  .link{background:none;border:0;color:var(--p);font:inherit;font-size:.85rem;text-decoration:underline;cursor:pointer;padding:0;margin-left:6px}
  .dates{margin-top:12px}
  .radio{display:flex;gap:10px;align-items:flex-start;padding:9px 0;cursor:pointer}
  .radio input{margin-top:3px;accent-color:var(--p);width:18px;height:18px;flex:none}
  button.go{width:100%;font:inherit;font-weight:800;font-size:1.02rem;letter-spacing:.3px;padding:14px;border:0;border-radius:10px;background:var(--ink);color:#fff;cursor:pointer}
  button.go:disabled{opacity:.6;cursor:wait}
  .secure{display:flex;gap:8px;align-items:center;justify-content:center;color:var(--muted);font-size:.8rem;margin:12px 0 0;text-align:center}
  .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
  .alert{background:#fef3f2;color:var(--bad);border-radius:10px;padding:10px 12px;margin-bottom:14px}
  .done{text-align:center;padding:36px 24px}
  .thanks{font-family:'Times New Roman',Georgia,serif;font-style:italic;font-weight:700;color:var(--p);font-size:3rem;line-height:1;margin:0}
  .thanksSub{font-family:'Times New Roman',Georgia,serif;font-style:italic;font-size:1.3rem;margin:6px 0 18px}
  .done p{color:var(--muted);margin:0 0 10px}
  @media (max-width:520px){.grid{grid-template-columns:1fr}.chips{grid-template-columns:repeat(2,1fr)}header,form{padding:18px 16px}.title{font-size:1.6rem}.headline{font-size:.95rem}.langbtn{position:static;margin-bottom:10px}.tab span{font-size:.75rem}}
  `;

  class OlgPledgeWidget extends HTMLElement {
    connectedCallback() {
      this.root = this.attachShadow({ mode: 'open' });
      const l = (this.getAttribute('lang') || 'auto').toLowerCase();
      // auto: Spanish if the page OR the visitor's phone/browser is set to Spanish
      const auto = /^es/i.test(document.documentElement.lang || '') || (navigator.languages || [navigator.language]).some(x => /^es/i.test(x || ''));
      this.lang = l === 'es' || (l === 'auto' && auto) ? 'es' : 'en';
      this.api = (this.getAttribute('api') || '').replace(/\/$/, '');
      this.campaignId = Number(this.getAttribute('campaign'));
      this.amounts = {
        weekly: nums(this.getAttribute('weekly-amounts'), '20,15,10,5'),
        monthly: nums(this.getAttribute('monthly-amounts'), '80,60,40,20'),
        once: nums(this.getAttribute('once-amounts'), '80,60,40,20'),
      };
      this.freqs = (this.getAttribute('frequencies') || 'weekly,monthly,once').split(',').map(s => s.trim()).filter(f => f in this.amounts);
      const p = this.getAttribute('primary-color'); if (p) this.style.setProperty('--olg-primary', p);
      const ink = this.getAttribute('ink-color'); if (ink) this.style.setProperty('--olg-ink', ink);
      const freq = this.freqs.includes(this.getAttribute('default-frequency')) ? this.getAttribute('default-frequency') : this.freqs[0];
      this.endAttr = isDate(this.getAttribute('end-date')) ? this.getAttribute('end-date') : null;
      this.state = {
        frequency: freq, amount: this.amounts[freq][0], other: '',
        start: today(), end: this.endAttr || addMonths(today(), 11), showDates: false,
        payNow: 'first', names: '', first: '', last: '', email: '', phone: '', address: '', city: '',
      };
      const status = new URLSearchParams(location.search).get('olg_pledge');
      this.view = status === 'paid' ? 'paid' : 'form';
      this.render();
      this.load();
    }

    t(k) { return T[this.lang][k]; }
    money(n) { return new Intl.NumberFormat(this.lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0); }
    date(s) { return new Intl.DateTimeFormat(this.lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(toD(s)); }
    fill(s, o) { return s.replace(/\{(\w+)\}/g, (_, k) => o[k]); }

    async load() {
      try {
        const r = await fetch(`${this.api}/api/campaign/${this.campaignId}`);
        if (!r.ok) throw new Error(r.status);
        this.campaign = await r.json();
        // plan runs through the campaign's end date unless the page says otherwise
        if (!this.endAttr && this.campaign.endDate && this.campaign.endDate > this.state.start) this.state.end = this.campaign.endDate;
      } catch { this.campaign = null; this.loadError = true; }
      this.render();
    }

    plan() {
      const s = this.state;
      const per = Number(s.other) > 0 ? Number(s.other) : Number(s.amount);
      const n = s.frequency === 'once' ? 1 : count(s.frequency, s.start, s.end);
      return { per, n, total: Math.round(per * n * 100) / 100 };
    }

    planHtml() {
      const p = this.plan(); const s = this.state;
      if (!(p.per > 0)) return '';
      if (s.frequency === 'once') return `<b>${esc(this.fill(this.t('planOnce'), { amt: this.money(p.total) }))}</b>`;
      return `<b>${esc(this.fill(this.t('plan'), { per: this.money(p.per), freq: this.t('freqWord')[s.frequency], n: p.n, total: this.money(p.total) }))}</b>
        <span>${esc(this.fill(this.t('planDates'), { start: this.date(s.start), end: this.date(s.end) }))}</span>${s.showDates ? '' : `<button type="button" class="link" data-act="dates">${this.t('change')}</button>`}`;
    }

    titleHtml(name) {
      // "Building Faith Together II" -> Faith / Fe in italic accent, like the pledge card
      return esc(name).replace(/\b(Faith|Fe)\b/, '<em>$1</em>');
    }

    header() {
      const c = this.campaign;
      const lang = `<button type="button" class="langbtn" data-act="lang" lang="${this.lang === 'en' ? 'es' : 'en'}">${this.t('lang')}</button>`;
      if (!c) return `<header>${lang}<h2 class="title">${this.loadError ? '' : '…'}</h2><p class="headline">${this.t('headline')}</p></header>`;
      const pct = c.goal ? Math.min(100, Math.round(c.received / c.goal * 100)) : 0;
      const desc = c.description && !/put a good description/i.test(c.description) ? c.description : '';
      const progress = this.hasAttribute('hide-progress') ? '' : `
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct}% ${esc(this.t('of'))}"><span style="width:${pct}%"></span></div>
        <div class="stats"><div><b>${this.money(c.goal)}</b>${this.t('goal')}</div><div><b>${this.money(c.pledged)}</b>${this.t('pledged')}</div><div><b>${this.money(c.received)}</b>${this.t('received')}</div></div>`;
      return `<header>${lang}<h2 class="title">${this.titleHtml(c.name)}</h2><p class="headline">${this.t('headline')}</p>${desc ? `<p class="desc">${esc(desc)}</p>` : ''}${progress}</header>`;
    }

    form() {
      const s = this.state; const p = this.plan(); const e = this.errors || {};
      const err = k => e[k] ? `<span class="e" id="e-${k}">${esc(this.t('err')[e[k]] || this.t('err').generic)}</span>` : '';
      const inv = k => e[k] ? `class="invalid" aria-invalid="true" aria-describedby="e-${k}"` : '';
      const unit = s.frequency === 'weekly' ? this.t('perWeek') : s.frequency === 'monthly' ? this.t('perMonth') : '';
      const tabs = this.freqs.map(f => `<label class="tab"><input type="radio" name="frequency" value="${f}" ${s.frequency === f ? 'checked' : ''}><span>${this.t(f)}</span></label>`).join('');
      const chips = this.amounts[s.frequency].map(v => `<label class="chip"><input type="radio" name="amount" value="${v}" ${!s.other && Number(s.amount) === v ? 'checked' : ''} aria-label="${this.money(v)}${unit}"><span>${this.money(v)}${unit ? `<small>${unit}</small>` : ''}</span></label>`).join('');
      const recurring = s.frequency !== 'once';
      return `<form novalidate>
        ${this.alert ? `<div class="alert" role="alert">${esc(this.alert)}</div>` : ''}
        <fieldset><legend class="sect">${this.t('choose')}</legend>
          <div class="tabs" role="radiogroup" style="--n:${this.freqs.length}">${tabs}</div>
          <div class="chips">${chips}</div>
          <label class="field own"><span class="lbl">${this.t('own')}</span><span class="money" style="display:block"><input type="number" name="other" inputmode="decimal" min="1" step="1" placeholder="${this.t('ownPh')}" value="${esc(s.other)}" ${inv('amount')}></span></label>${err('amount')}
          <div class="plan" aria-live="polite" data-plan>${this.planHtml()}</div>
          ${recurring && s.showDates ? `<div class="grid dates">
            <label class="field"><span class="lbl">${this.t('start')}</span><input type="date" name="start" value="${s.start}" min="${today()}" ${inv('startDate')}>${err('startDate')}</label>
            <label class="field"><span class="lbl">${this.t('end')}</span><input type="date" name="end" value="${s.end}" min="${s.start}" ${inv('endDate')}>${err('endDate')}</label></div>` : ''}
        </fieldset>
        <fieldset><legend class="sect">${this.t('aboutYou')}</legend>
          <div class="grid">
            <label class="field"><span class="lbl">${this.t('first')}</span><input type="text" name="first" autocomplete="given-name" value="${esc(s.first)}" ${inv('firstName')}>${err('firstName')}</label>
            <label class="field"><span class="lbl">${this.t('last')}</span><input type="text" name="last" autocomplete="family-name" value="${esc(s.last)}" ${inv('lastName')}>${err('lastName')}</label>
          </div>
          <label class="field" style="margin-top:12px"><span class="lbl">${this.t('email')}</span><input type="email" name="email" autocomplete="email" value="${esc(s.email)}" ${inv('email')}><small>${this.t('emailHelp')}</small>${err('email')}</label>
          <label class="field" style="margin-top:12px"><span class="lbl">${this.t('phone')}</span><input type="tel" name="phone" autocomplete="tel" value="${esc(s.phone)}"></label>
          <div class="grid" style="margin-top:12px">
            <label class="field"><span class="lbl">${this.t('address')}</span><input type="text" name="address" autocomplete="street-address" value="${esc(s.address)}"></label>
            <label class="field"><span class="lbl">${this.t('city')}</span><input type="text" name="city" autocomplete="address-level2" value="${esc(s.city)}"></label>
          </div>
          <div class="hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
        </fieldset>
        <fieldset><legend class="sect">${this.t('payNow')}</legend>
          ${recurring ? `<label class="radio"><input type="radio" name="payNow" value="first" ${s.payNow === 'first' ? 'checked' : ''}><span data-payfirst>${esc(this.fill(this.t('payFirst'), { amt: this.money(p.per) }))}</span></label>` : ''}
          <label class="radio"><input type="radio" name="payNow" value="full" ${s.payNow === 'full' || (!recurring && s.payNow === 'first') ? 'checked' : ''}><span data-payfull>${esc(this.fill(this.t('payFull'), { amt: this.money(p.total) }))}</span></label>
          <label class="radio"><input type="radio" name="payNow" value="none" ${s.payNow === 'none' ? 'checked' : ''}><span>${this.t('payLater')}</span></label>
        </fieldset>
        <button class="go" type="submit" ${this.busy ? 'disabled' : ''}>${this.busy ? this.t(this.busy) : this.t(s.payNow === 'none' ? 'submit' : 'submitPay')}</button>
        <p class="secure"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1a5 5 0 0 0-5 5v3H5v14h14V9h-2V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 0 1 6 0v3H9z"/></svg>${this.t('secure')}</p>
      </form>`;
    }

    done() {
      const paid = this.view === 'paid';
      const r = this.result || {};
      const name = `${this.state.first} ${this.state.last}`.trim();
      const msg = r.thankYouMessage && !/put a thank you message/i.test(r.thankYouMessage) ? r.thankYouMessage.replace(/\[display_name\]/g, name) : '';
      const later = !paid && this.state.payNow === 'none';
      return `<div class="done" role="status">
        <p class="thanks">${this.t('thanks')}</p><p class="thanksSub">${this.t('thanksSub')}</p>
        ${msg ? `<p>${esc(msg)}</p>` : ''}
        ${paid ? `<p>${this.t('thanksPaid')}</p>` : ''}
        ${r.total ? `<p>${esc(this.fill(this.t('thanksBody'), { total: this.money(r.total) }))}</p>` : ''}
        ${r.paymentUnavailable ? `<p>${this.t('payUnavailable')}</p>` : ''}
        ${later || r.paymentUnavailable ? `<p>${this.t('thanksLater')}</p>` : ''}
        <button class="link" data-act="again">${this.t('another')}</button></div>`;
    }

    render() {
      const closed = this.campaign && !this.campaign.acceptingPledges;
      const body = this.view === 'form' ? (closed ? `<div class="done"><p>${this.t('closed')}</p></div>` : this.form()) : this.done();
      this.root.innerHTML = `<style>${CSS}</style><div class="card" lang="${this.lang}">${this.header()}${body}</div>`;
      this.bind();
    }

    update() {
      const pl = this.root.querySelector('[data-plan]'); if (pl) { pl.innerHTML = this.planHtml(); this.bindDates(); }
      const p = this.plan();
      const f = this.root.querySelector('[data-payfirst]'); if (f) f.textContent = this.fill(this.t('payFirst'), { amt: this.money(p.per) });
      const u = this.root.querySelector('[data-payfull]'); if (u) u.textContent = this.fill(this.t('payFull'), { amt: this.money(p.total) });
      const b = this.root.querySelector('button.go'); if (b && !this.busy) b.textContent = this.t(this.state.payNow === 'none' ? 'submit' : 'submitPay');
    }

    bindDates() { this.root.querySelector('[data-act=dates]')?.addEventListener('click', () => { this.state.showDates = true; this.render(); }); }

    bind() {
      const r = this.root;
      r.querySelector('[data-act=lang]')?.addEventListener('click', () => { this.lang = this.lang === 'en' ? 'es' : 'en'; this.render(); });
      r.querySelector('[data-act=again]')?.addEventListener('click', () => { this.view = 'form'; this.result = null; history.replaceState(null, '', location.pathname); this.render(); });
      this.bindDates();
      const form = r.querySelector('form'); if (!form) return;
      form.addEventListener('input', e => {
        const { name, value } = e.target; const s = this.state;
        if (name === 'frequency') {
          s.frequency = value; s.amount = this.amounts[value][0];
          if (value === 'once' && s.payNow === 'first') s.payNow = 'full';
          if (value !== 'once' && s.payNow === 'full') s.payNow = 'first';
          this.render(); return;
        }
        if (name === 'other') { s.other = value; form.querySelectorAll('input[name=amount]').forEach(i => { i.checked = false; }); }
        else if (name === 'amount') { s.amount = Number(value); s.other = ''; form.querySelector('input[name=other]').value = ''; }
        else if (['first', 'last', 'email', 'phone', 'address', 'city'].includes(name)) s[name] = value;
        else if (name === 'start') { s.start = value; if (s.end < value) s.end = value; }
        else if (name === 'end') s.end = value;
        else if (name === 'payNow') s.payNow = value;
        this.update();
      });
      form.addEventListener('submit', e => { e.preventDefault(); this.submit(form); });
    }

    async submit(form) {
      const s = this.state; const p = this.plan();
      this.errors = {}; this.alert = '';
      if (!s.first.trim()) this.errors.firstName = 'required';
      if (!s.last.trim()) this.errors.lastName = 'required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim())) this.errors.email = 'invalid_email';
      if (!(p.per >= 1)) this.errors.amount = 'invalid_amount';
      if (Object.keys(this.errors).length) { this.render(); this.root.querySelector('[aria-invalid=true]')?.focus(); return; }
      this.busy = 'working'; this.render();
      try {
        const once = s.frequency === 'once';
        const res = await fetch(`${this.api}/api/pledge`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: this.campaignId, firstName: s.first, lastName: s.last, email: s.email, phone: s.phone,
            address: s.address, city: s.city, language: this.lang,
            amountMode: once ? 'total' : 'installment', amount: p.per, frequency: s.frequency,
            startDate: once ? today() : s.start, endDate: once ? null : s.end,
            payNow: once && s.payNow === 'first' ? 'full' : s.payNow,
            returnUrl: location.href.split('#')[0], website: form.querySelector('[name=website]').value,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 422) {
          this.errors = json.fields || {}; this.busy = null;
          if (this.errors.startDate || this.errors.endDate) s.showDates = true;
          if (this.errors.campaignId) this.alert = this.t('err').not_accepting;
          this.render(); this.root.querySelector('[aria-invalid=true]')?.focus(); return;
        }
        if (!res.ok) throw new Error(json.error || 'generic');
        this.result = json;
        if (json.checkoutUrl) { this.busy = 'redirect'; this.render(); location.assign(json.checkoutUrl); return; }
        this.busy = null; this.view = 'thanks'; this.render();
      } catch (err) {
        this.busy = null; this.alert = this.t('err')[err.message] || this.t('err').generic; this.render();
      }
    }
  }
  customElements.define('olg-pledge-widget', OlgPledgeWidget);
})();
