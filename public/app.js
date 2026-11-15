const APPLIANCES = [
  { id: 'router', name: 'Роутер і оптичний термінал', watts: 20, duty: 1, surge: 1, qty: 1, icon: 'wifi' },
  { id: 'lights', name: 'LED-освітлення, 5 ламп', watts: 50, duty: 1, surge: 1, qty: 1, icon: 'bulb' },
  // surge = start-up power / running power. A fridge compressor starts at about 1.5 kW (150 W × 10).
  { id: 'fridge', name: 'Холодильник', watts: 150, duty: 0.4, surge: 10, qty: 1, icon: 'fridge' },
  { id: 'laptop', name: 'Ноутбук', watts: 65, duty: 1, surge: 1, qty: 1, icon: 'laptop' },
  { id: 'phones', name: 'Зарядка телефонів', watts: 20, duty: 0.5, surge: 1, qty: 1, icon: 'phone' },
  { id: 'tv', name: 'Телевізор', watts: 100, duty: 1, surge: 1, qty: 0, icon: 'tv' },
  { id: 'boiler', name: 'Газовий котел з насосом', watts: 120, duty: 1, surge: 2, qty: 0, icon: 'flame' },
  { id: 'pc', name: 'Комп\'ютер з монітором', watts: 300, duty: 1, surge: 1, qty: 0, icon: 'monitor' },
  { id: 'microwave', name: 'Мікрохвильовка', watts: 1200, duty: 0.05, surge: 1, qty: 0, icon: 'microwave' },
  { id: 'kettle', name: 'Електрочайник', watts: 2000, duty: 0.03, surge: 1, qty: 0, icon: 'kettle' },
  { id: 'washer', name: 'Пральна машина', watts: 2000, duty: 0.15, surge: 1.5, qty: 0, icon: 'washer' },
  { id: 'well-pump', name: 'Насос свердловини', watts: 1100, duty: 0.1, surge: 3, qty: 0, icon: 'drop' },
  { id: 'water-heater', name: 'Бойлер', watts: 2000, duty: 0.3, surge: 1, qty: 0, icon: 'heater' },
  { id: 'ac', name: 'Кондиціонер / тепловий насос', watts: 1200, duty: 0.5, surge: 2, qty: 0, icon: 'snow' },
];

const ICONS = {
  wifi: '<path d="M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  fridge: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  phone: '<rect x="8" y="2.5" width="8" height="19" rx="2"/><path d="M11 18h2"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1.5 2 1.5 3 1.5-1.5 1.5-5 1.5-8z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
  microwave: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="6" y="8" width="9" height="8" rx="1"/><path d="M18 9v1M18 13v1"/>',
  kettle: '<path d="M6 20h11l-1.5-10h-8zM8 10a4 4 0 0 1 7 0M17 12h2.5v4H16"/>',
  washer: '<rect x="4" y="2.5" width="16" height="19" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7 6h2"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  heater: '<rect x="7" y="2.5" width="10" height="19" rx="5"/><path d="M10 9h4M10 13h4"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
};

const INVERTER_HEADROOM = 1.25;
const INVERTER_SURGE_FACTOR = 2;
const BATTERY_USABLE_SHARE = 0.9;
const INVERTER_EFFICIENCY = 0.92;
const MAX_BATTERIES = 16;
const MAX_QUANTITY = 9;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const numberFormatter = new Intl.NumberFormat('uk-UA');
const formatPrice = (value) => `${numberFormatter.format(value)} грн`;
const formatKw = (value) => `${value.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} кВт`;
const formatKwh = (value) => `${value.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} кВт·год`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function readJson(selector, fallback) {
  const node = $(selector);
  return node ? JSON.parse(node.textContent) : fallback;
}

const calc = {
  products: readJson('#products-data', []),
  pricing: readJson('#pricing-data', { mountingKit: { single: 0, three: 0 }, installation: 0, minHomeInverterKw: 0 }),
  quantities: Object.fromEntries(APPLIANCES.map((a) => [a.id, a.qty])),
  hours: 4,
  phases: 1,
  twoZone: false,
  batteryPlace: 'heated',
  option: 'recommended',
  withInstallation: true,
};

const OPTION_LABELS = { recommended: 'Рекомендований', budget: 'Бюджетний' };

function selectedAppliances() {
  return APPLIANCES.filter((a) => calc.quantities[a.id] > 0).map((a) => ({ ...a, qty: calc.quantities[a.id] }));
}

function calculateNeeds() {
  const selected = selectedAppliances();
  const runningW = selected.reduce((sum, a) => sum + a.watts * a.qty, 0);
  const surgeExtraW = selected.reduce((max, a) => Math.max(max, a.watts * (a.surge - 1)), 0);
  const peakW = runningW + surgeExtraW;
  const averageW = selected.reduce((sum, a) => sum + a.watts * a.qty * a.duty, 0);
  const loadKw = Math.max(runningW * INVERTER_HEADROOM, peakW / INVERTER_SURGE_FACTOR) / 1000;
  const requiredKw = calc.phases === 1 ? Math.max(loadKw, calc.pricing.minHomeInverterKw) : loadKw;
  const batteryKwh = (averageW * calc.hours) / (BATTERY_USABLE_SHARE * INVERTER_EFFICIENCY) / 1000;
  return { selected, runningW, peakW, averageW, requiredKw, batteryKwh };
}

function availableOptions() {
  return calc.twoZone ? ['recommended'] : ['recommended', 'budget'];
}

function pickInverter(tier, requiredKw) {
  return calc.products
    .filter((p) => p.category === 'inverter' && p.tier === tier && p.phases === 1 && p.powerKw >= requiredKw)
    .sort((a, b) => a.price - b.price)[0];
}

function pickBatteries(inverter, batteryKwh) {
  const options = calc.products
    .filter((p) => p.category === 'battery' && p.batteryVoltage === 48)
    .map((battery) => {
      const count = Math.max(1, Math.ceil(batteryKwh / battery.capacityKwh));
      return { battery, count, total: battery.price * count };
    })
    .filter((option) => option.count <= MAX_BATTERIES);
  const sameBrand = options.filter((option) => option.battery.brand === inverter.brand);
  return (sameBrand.length ? sameBrand : options).sort((a, b) => a.total - b.total)[0];
}

function recommendSystem(needs) {
  if (calc.phases !== 1) return null;
  const tier = availableOptions().includes(calc.option) ? calc.option : 'recommended';
  const inverter = pickInverter(tier, needs.requiredKw);
  if (!inverter) return null;
  const batteryOption = pickBatteries(inverter, needs.batteryKwh);
  if (!batteryOption) return null;
  const capacityKwh = batteryOption.battery.capacityKwh * batteryOption.count;
  const runtimeHours = needs.averageW > 0 ? (capacityKwh * 1000 * BATTERY_USABLE_SHARE * INVERTER_EFFICIENCY) / needs.averageW : 0;
  const mountingKit = calc.pricing.mountingKit.single;
  const installation = calc.withInstallation ? calc.pricing.installation : 0;
  const price = inverter.price + batteryOption.total + mountingKit + installation;
  return { tier, inverter, ...batteryOption, capacityKwh, runtimeHours, mountingKit, installation, price };
}

function conditionsLine() {
  return [
    `${calc.hours} год відключення`,
    `${calc.phases} ф.`,
    calc.twoZone ? 'двозонний лічильник' : 'без двозонного лічильника',
    calc.batteryPlace === 'unheated' ? 'батарея в неопалюваному приміщенні' : 'батарея в теплі',
  ].join(', ');
}

function calcSummary(needs, system) {
  const appliances = needs.selected.map((a) => (a.qty > 1 ? `${a.name} ×${a.qty}` : a.name)).join(', ');
  const lines = [
    `Розрахунок з калькулятора: ${conditionsLine()}`,
    `Прилади: ${appliances}`,
    `Потрібно: інвертор від ${formatKw(needs.requiredKw)}, АКБ від ${formatKwh(needs.batteryKwh)}`,
  ];
  if (system) {
    lines.push(`Варіант: ${OPTION_LABELS[system.tier]}. ${system.inverter.name} + ${system.count} × ${system.battery.name}`);
    lines.push(`Монтажний набір: ${formatPrice(system.mountingKit)}`);
    lines.push(system.installation ? `Монтаж: ${formatPrice(system.installation)}` : 'Монтаж: не потрібен');
    lines.push(`Разом ≈ ${formatPrice(system.price)}`);
  } else if (calc.phases === 3) {
    lines.push(`Трифазна система: монтажний набір ${formatPrice(calc.pricing.mountingKit.three)}, монтаж від ${formatPrice(calc.pricing.installation)}`);
  }
  return lines.join('\n');
}

function applianceIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function renderAppliances() {
  $('#appliances').innerHTML = APPLIANCES.map((a) => {
    const qty = calc.quantities[a.id];
    return `
      <div class="appliance${qty > 0 ? ' is-on' : ''}">
        <button type="button" class="appliance__toggle" data-toggle="${a.id}" aria-pressed="${qty > 0}">
          <span class="appliance__icon">${applianceIcon(a.icon)}</span>
          <span class="appliance__text">
            <span class="appliance__name">${escapeHtml(a.name)}</span>
            <span class="appliance__watts">${a.watts} Вт</span>
          </span>
        </button>
        <div class="stepper">
          <button type="button" data-step="-1" data-appliance="${a.id}" aria-label="Менше: ${escapeHtml(a.name)}" ${qty === 0 ? 'disabled' : ''}>−</button>
          <output>${qty}</output>
          <button type="button" data-step="1" data-appliance="${a.id}" aria-label="Більше: ${escapeHtml(a.name)}" ${qty >= MAX_QUANTITY ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
  }).join('');
}

function optionSwitch(activeTier) {
  const options = availableOptions();
  if (options.length < 2) return '';
  return `<div class="options" role="group" aria-label="Варіант системи">${options.map((tier) => `<button type="button" data-option="${tier}" class="${tier === activeTier ? 'is-active' : ''}" aria-pressed="${tier === activeTier}">${OPTION_LABELS[tier]}</button>`).join('')}</div>`;
}

function systemHtml(system) {
  const note = system.tier === 'budget'
    ? 'Простий інвертор: тримає резерв, але не заряджає батарею за нічним тарифом.'
    : 'Заряджає батарею за розкладом: з двозонним лічильником резерв дешевшає.';
  const runtimeShare = Math.min(100, Math.round((calc.hours / system.runtimeHours) * 100));
  return `
    <div class="recommend">
      ${optionSwitch(system.tier)}
      <p class="recommend__note">${note}</p>
      <a class="recommend__item" href="${system.inverter.url}">
        <span>${escapeHtml(system.inverter.name)}</span><span>${formatPrice(system.inverter.price)}</span>
      </a>
      <a class="recommend__item" href="${system.battery.url}">
        <span>${system.count} × ${escapeHtml(system.battery.name)}</span><span>${formatPrice(system.total)}</span>
      </a>
      <div class="recommend__item recommend__item--service">
        <span>Монтажний набір: перемикач, реле напруги, автомати, кабель</span><span>${formatPrice(system.mountingKit)}</span>
      </div>
      ${system.installation ? `
      <div class="recommend__item recommend__item--service">
        <span>Монтаж і налаштування, квартира</span><span>${formatPrice(system.installation)}</span>
      </div>` : ''}
      <div class="recommend__total"><span>Разом, орієнтовно</span><strong>${formatPrice(system.price)}</strong></div>
      <div class="runtime">
        <div class="runtime__bar"><span style="--share: ${runtimeShare}%"></span></div>
        <p>${formatKwh(system.capacityKwh)} вистачить приблизно на <strong>${Math.floor(system.runtimeHours)} год</strong> при вашому споживанні.</p>
      </div>
    </div>`;
}

function threePhaseHtml() {
  return `
    <div class="recommend">
      <p class="recommend__note">Трифазні системи підбираємо індивідуально: інженер врахує навантаження по фазах і пускові струми.</p>
      <div class="recommend__item recommend__item--service">
        <span>Трифазний монтажний набір: контактори, реле контролю фаз, індикатори, кабель</span><span>${formatPrice(calc.pricing.mountingKit.three)}</span>
      </div>
      ${calc.withInstallation ? `
      <div class="recommend__item recommend__item--service">
        <span>Монтаж і налаштування</span><span>від ${formatPrice(calc.pricing.installation)}</span>
      </div>` : ''}
      <p class="recommend__note">Для ліфтів ОСББ дивіться <a href="/dlya-liftiv/">інвертори 20–30 кВт</a>.</p>
    </div>`;
}

function renderCalcResult() {
  const result = $('#calc-result');
  const needs = calculateNeeds();
  if (needs.selected.length === 0) {
    result.innerHTML = '<p class="calc__eyebrow">Ваша система</p><p class="calc__empty">Додайте хоча б один прилад, щоб побачити розрахунок.</p>';
    return;
  }
  const system = recommendSystem(needs);
  const warning = calc.batteryPlace === 'unheated'
    ? '<p class="calc__warning">У неопалюваному приміщенні потрібна батарея з підігрівом: LiFePO4 не можна заряджати на морозі. Інженер підбере модель, ціна може відрізнятися.</p>'
    : '';
  let recommendation;
  if (system) recommendation = systemHtml(system);
  else if (calc.phases === 3) recommendation = threePhaseHtml();
  else recommendation = '<div class="recommend"><p class="recommend__note">Таке навантаження потребує потужнішої або паралельної системи. Інженер підбере конфігурацію індивідуально.</p></div>';
  result.innerHTML = `
    <p class="calc__eyebrow">Ваша система</p>
    <div class="metrics">
      <div class="metric metric--main"><strong>${formatKw(needs.requiredKw)}</strong><span>потужність інвертора, від</span></div>
      <div class="metric metric--main"><strong>${formatKwh(needs.batteryKwh)}</strong><span>ємність акумулятора, від</span></div>
      <div class="metric"><strong>${numberFormatter.format(needs.runningW)} Вт</strong><span>якщо все увімкнути разом</span></div>
      <div class="metric"><strong>${numberFormatter.format(Math.round(needs.peakW))} Вт</strong><span>пік на пуску двигунів</span></div>
    </div>
    ${warning}
    ${recommendation}
    <a class="btn btn--primary btn--block btn--lg" href="#contact" data-consult="${escapeHtml(calcSummary(needs, system))}">Отримати точний розрахунок</a>`;
}

function initCalculator() {
  if (!$('#appliances')) return;
  renderAppliances();
  renderCalcResult();

  $('#appliances').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    const step = event.target.closest('[data-step]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      calc.quantities[id] = calc.quantities[id] > 0 ? 0 : 1;
    } else if (step) {
      const id = step.dataset.appliance;
      calc.quantities[id] = Math.min(MAX_QUANTITY, Math.max(0, calc.quantities[id] + Number(step.dataset.step)));
    } else {
      return;
    }
    renderAppliances();
    renderCalcResult();
  });

  $('#calc-result').addEventListener('click', (event) => {
    const option = event.target.closest('[data-option]');
    if (!option) return;
    calc.option = option.dataset.option;
    renderCalcResult();
  });

  $('#hours').addEventListener('input', (event) => {
    calc.hours = Number(event.target.value);
    $('#hours-value').textContent = `${calc.hours} год`;
    renderCalcResult();
  });

  const onChange = (selector, apply) => $(selector).addEventListener('change', (event) => {
    apply(event.target);
    renderCalcResult();
  });
  onChange('#phases', (el) => { calc.phases = Number(el.value); });
  onChange('#two-zone', (el) => { calc.twoZone = el.value === 'yes'; });
  onChange('#battery-place', (el) => { calc.batteryPlace = el.value; });
  onChange('#with-installation', (el) => { calc.withInstallation = el.checked; });
}

function initCatalogFilters() {
  const grid = $('#products');
  if (!grid || !$('.tabs')) return;
  const filters = { category: 'all', tier: '', sort: 'popular' };
  const cards = $$('.product', grid);

  function apply() {
    let visibleCount = 0;
    cards.forEach((card) => {
      const matchesCategory = filters.category === 'all' || card.dataset.category === filters.category;
      const matchesTier = !filters.tier || card.dataset.category !== 'inverter' || card.dataset.tier === filters.tier;
      card.hidden = !(matchesCategory && matchesTier);
      if (!card.hidden) visibleCount += 1;
    });
    const sortKey = filters.sort === 'popular' ? 'order' : 'price';
    const direction = filters.sort === 'price-desc' ? -1 : 1;
    const sortValue = (card) => (card.dataset[sortKey] === '' ? Infinity * direction : Number(card.dataset[sortKey]));
    [...cards]
      .sort((a, b) => (sortValue(a) - sortValue(b)) * direction)
      .forEach((card) => grid.appendChild(card));
    $('#products-empty').hidden = visibleCount > 0;
  }

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    filters.category = tab.dataset.category;
    $$('.tab').forEach((t) => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-pressed', String(t === tab));
    });
    apply();
  }));
  $('#filter-tier').addEventListener('change', (event) => {
    filters.tier = event.target.value;
    apply();
  });
  $('#sort').addEventListener('change', (event) => {
    filters.sort = event.target.value;
    apply();
  });
}

function setFormContext(text) {
  const context = $('#form-context');
  if (!context) return;
  $('#form-context-text').textContent = text;
  context.hidden = !text;
}

function initConsultLinks() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-consult]');
    if (!link || !$('#lead-form')) return;
    event.preventDefault();
    setFormContext(link.dataset.consult);
    $('#contact').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('#lead-form [name="name"]').focus({ preventScroll: true }), 600);
  });
}

function showFieldErrors(form, errors) {
  $$('[data-error-for]', form).forEach((el) => {
    el.textContent = errors[el.dataset.errorFor] || '';
  });
}

async function submitLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $('#form-status');
  const submitButton = $('button[type="submit"]', form);
  const data = Object.fromEntries(new FormData(form));
  data.context = $('#form-context').hidden ? '' : $('#form-context-text').textContent;

  const clientErrors = {};
  if (data.name.trim().length < 2) clientErrors.name = 'Вкажіть ім\'я';
  if (data.phone.replace(/\D/g, '').length < 10) clientErrors.phone = 'Вкажіть номер у форматі 0XX XXX XX XX';
  showFieldErrors(form, clientErrors);
  if (Object.keys(clientErrors).length > 0) return;

  submitButton.disabled = true;
  status.className = 'form__status';
  status.textContent = 'Надсилаємо…';
  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const body = await response.json();
    if (!response.ok) {
      showFieldErrors(form, body.fields || {});
      throw new Error(body.error || 'Не вдалося надіслати');
    }
    form.reset();
    setFormContext('');
    status.className = 'form__status is-ok';
    status.textContent = 'Дякуємо! Ми зв\'яжемося з вами найближчим часом.';
  } catch (error) {
    status.className = 'form__status is-error';
    status.textContent = `${error.message}. Або зателефонуйте: ${document.body.dataset.phoneLabel}`;
  } finally {
    submitButton.disabled = false;
  }
}

function initLeadForm() {
  const form = $('#lead-form');
  if (!form) return;
  form.addEventListener('submit', submitLead);
  $('#form-context-clear').addEventListener('click', () => setFormContext(''));
}

function initProjectFilters() {
  const grid = $('#projects-grid');
  const tabs = $$('[data-project-type]');
  if (!grid || !tabs.length) return;
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const type = tab.dataset.projectType;
    tabs.forEach((t) => {
      t.classList.toggle('is-active', t === tab);
      t.setAttribute('aria-pressed', String(t === tab));
    });
    $$('.project-card', grid).forEach((card) => {
      card.hidden = type !== 'all' && card.dataset.type !== type;
    });
  }));
}

function initLightbox() {
  const lightbox = $('#lightbox');
  if (!lightbox) return;
  const image = $('img', lightbox);
  document.addEventListener('click', (event) => {
    const item = event.target.closest('[data-gallery-src]');
    if (!item) return;
    image.src = item.dataset.gallerySrc;
    image.alt = $('img', item)?.alt || '';
    lightbox.showModal();
  });
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target.closest('[data-lightbox-close]')) lightbox.close();
  });
}

function initMenu() {
  const topbar = document.querySelector('.topbar');
  const toggle = topbar?.querySelector('.menu-toggle');
  if (!toggle) return;
  const setOpen = (open) => {
    topbar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
  };
  toggle.addEventListener('click', () => setOpen(!topbar.classList.contains('is-open')));
  topbar.querySelectorAll('.nav a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
  document.addEventListener('click', (event) => { if (!topbar.contains(event.target)) setOpen(false); });
}

// Promo video: plays silently only while on screen (saves mobile data), sound on request
function initPromoVideo() {
  const video = $('.promo__video');
  if (!video) return;
  const sound = $('.promo__sound');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) video.controls = true;

  if ('IntersectionObserver' in window && !reduceMotion) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }, { threshold: 0.4 }).observe(video);
  }

  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    sound.setAttribute('aria-pressed', String(!video.muted));
    sound.setAttribute('aria-label', video.muted ? 'Увімкнути звук' : 'Вимкнути звук');
  });
}

initMenu();
initPromoVideo();
initCalculator();
initCatalogFilters();
initProjectFilters();
initLightbox();
initConsultLinks();
initLeadForm();
