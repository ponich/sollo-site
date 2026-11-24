const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const site = require('./site');
const { CATEGORIES, FAQ } = require('./content');

const numberFormatter = new Intl.NumberFormat('uk-UA');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const formatNumber = (value) => numberFormatter.format(value);
const formatPrice = (value) => `${formatNumber(value)} грн`;
const formatKw = (value) => `${value.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} кВт`;
const formatKwh = (value) => `${value.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} кВт·год`;

const absoluteUrl = (path) => `${site.url}${path}`;
const PROJECTS_PATH = '/nashi-roboty/';
const SERVICES_PATH = '/posluhy/';
const projectPath = (project) => `${PROJECTS_PATH}${project.slug}/`;
const categoryPath = (category) => `/${CATEGORIES[category].slug}/`;
const productPath = (product) => `${categoryPath(product.category)}${product.slug}/`;
const unsplashUrl = (photoId, width) => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=70`;
const productPhotoId = (product) => product.image || CATEGORIES[product.category].image;
const brandOf = (product) => product.brand || site.name;
const stockLabel = (product) => (product.stock === 'in_stock' ? 'В наявності' : 'Під замовлення');

const isLocalImage = (photoId) => photoId.startsWith('/');

// Our own pictures get ?v=<hash of the file> in their address. Cloudflare tells browsers to keep
// pictures for hours, so without this a replaced picture kept showing the old version.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const versionCache = new Map();
function versioned(localPath) {
  if (!versionCache.has(localPath)) {
    let version = '';
    try {
      version = crypto.createHash('md5').update(fs.readFileSync(path.join(PUBLIC_DIR, localPath))).digest('hex').slice(0, 8);
    } catch {
      // missing file: leave the address as it is
    }
    versionCache.set(localPath, version ? `${localPath}?v=${version}` : localPath);
  }
  return versionCache.get(localPath);
}
const imageUrl = (photoId, width) => (isLocalImage(photoId) ? versioned(photoId) : unsplashUrl(photoId, width));

function picture({ photoId, alt = '', widths = [640, 1024, 1600], sizes = '100vw', className = '', eager = false, width, height }) {
  if (isLocalImage(photoId)) {
    return `<img${className ? ` class="${className}"` : ''} src="${versioned(photoId)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  const srcset = widths.map((w) => `${unsplashUrl(photoId, w)} ${w}w`).join(', ');
  const attrs = [
    className && `class="${className}"`,
    `src="${unsplashUrl(photoId, widths[Math.floor(widths.length / 2)])}"`,
    `srcset="${srcset}"`,
    `sizes="${sizes}"`,
    `alt="${esc(alt)}"`,
    width && `width="${width}"`,
    height && `height="${height}"`,
    eager ? 'fetchpriority="high"' : 'loading="lazy"',
    'decoding="async"',
  ].filter(Boolean);
  return `<img ${attrs.join(' ')}>`;
}

const SERVICE_ICON = (path) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const SERVICES = [
  {
    title: 'Професійне встановлення',
    text: 'Змонтуємо будь-яке ваше обладнання — куплене у нас чи деінде.',
    points: ['Інвертори, акумулятори, сонячні панелі', 'Окрема резервна лінія і автомати захисту', 'Акуратний монтаж за 1–2 дні', `Монтажний набір — від ${formatPrice(site.pricing.mountingKit.single)}`],
    priceFrom: site.pricing.installation,
    icon: SERVICE_ICON('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  },
  {
    title: 'Налаштування обладнання',
    text: 'Налаштуємо систему, щоб вона працювала надійно і вигідно.',
    points: ['Режими роботи і двозонний тариф', 'Підключення застосунку на телефоні', 'Перевірка вже встановленої системи'],
    icon: SERVICE_ICON('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  },
  {
    title: 'Сервісне обслуговування',
    text: 'Доглядаємо за системою після монтажу, щоб вона не підвела у відключення.',
    points: ['Планові огляди і перевірка акумуляторів', 'Оновлення прошивки', 'Виїзд при несправності'],
    icon: SERVICE_ICON('<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  },
];

const KIT_MOUNTING_LABELS = {
  single: 'Монтажний набір: перемикач вводу, реле напруги, автомати, кабель',
  three: 'Трифазний монтажний набір: контактори, реле контролю фаз, індикатори, кабель',
};

function prepareCatalog(rawProducts) {
  const byId = new Map(rawProducts.map((p) => [p.id, p]));
  return rawProducts.map((product) => {
    if (product.category !== 'kit') return product;
    const parts = product.components.map((c) => ({ product: byId.get(c.id), qty: c.qty }));
    const missing = parts.find((part) => !part.product);
    if (missing) throw new Error(`Kit ${product.id}: unknown component`);
    const inverter = parts.find((part) => part.product.category !== 'battery').product;
    const batteries = parts.filter((part) => part.product.category === 'battery');
    const mountingKitPrice = site.pricing.mountingKit[product.mountingKit];
    const priced = parts.every((part) => part.product.price !== null);
    return {
      ...product,
      brand: inverter.brand,
      powerKw: inverter.powerKw,
      phases: inverter.phases,
      twoZone: inverter.twoZone,
      capacityKwh: batteries.reduce((sum, part) => sum + part.product.capacityKwh * part.qty, 0),
      warrantyYears: null,
      mountingKitPrice,
      price: priced ? parts.reduce((sum, part) => sum + part.product.price * part.qty, 0) + mountingKitPrice : null,
      parts: parts.map((part) => ({ qty: part.qty, name: part.product.name, path: productPath(part.product) })),
    };
  });
}

function priceText(product) {
  if (product.price === null) return 'Ціна за запитом';
  return `${product.priceFrom ? 'від ' : ''}${formatPrice(product.price)}`;
}

function priceHtml(product, className = 'price') {
  if (product.price === null) return `<span class="${className} price--request">Ціна за запитом</span>`;
  return `<span class="${className}">${product.priceFrom ? '<small>від</small> ' : ''}${formatPrice(product.price)}</span>`;
}

function specList(product) {
  const specs = [];
  if (product.powerKw) specs.push(formatKw(product.powerKw));
  if (product.phases) specs.push(product.phases === 3 ? '3 фази' : '1 фаза');
  if (product.capacityKwh) specs.push(formatKwh(product.capacityKwh));
  if (product.voltageClass === 'HV') specs.push(`АКБ ${product.batteryVoltageLabel}`);
  if (product.category !== 'battery' && product.category !== 'kit' && product.pvMaxW) specs.push(`СЕС до ${formatKw(product.pvMaxW / 1000)}`);
  if (product.category === 'battery' && product.batteryVoltage) specs.push(`${product.batteryVoltage} В`);
  if (product.cycles) specs.push(`${formatNumber(product.cycles)} циклів`);
  return specs;
}

function productDescription(product) {
  const specs = specList(product).join(', ');
  const warranty = product.warrantyYears ? ` Гарантія ${product.warrantyYears} р.` : '';
  const text = `${product.name} — ${product.tagline.toLowerCase()}. ${specs}. ${priceText(product)}.${warranty} Доставка по Україні, монтаж під ключ.`;
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

function headlineSpec(product) {
  if (product.category === 'battery') return { value: product.capacityKwh.toLocaleString('uk-UA', { maximumFractionDigits: 2 }), unit: 'кВт·год' };
  return { value: product.powerKw.toLocaleString('uk-UA', { maximumFractionDigits: 1 }), unit: 'кВт' };
}

function productIllustration(product) {
  if (product.category === 'battery') {
    return `<svg viewBox="0 0 120 150" aria-hidden="true" focusable="false">
      <rect x="10" y="8" width="100" height="134" rx="10" fill="#2a2620"/>
      <rect x="16" y="14" width="88" height="122" rx="7" fill="#3a352d"/>
      <rect x="30" y="34" width="60" height="12" rx="3" fill="#f2a93b"/>
      <rect x="30" y="52" width="60" height="12" rx="3" fill="#f2a93b"/>
      <rect x="30" y="70" width="60" height="12" rx="3" fill="#f2a93b"/>
      <rect x="30" y="88" width="60" height="12" rx="3" fill="#f2a93b" opacity="0.35"/>
      <circle cx="40" cy="120" r="4" fill="#7fc28d"/>
      <rect x="54" y="117" width="36" height="6" rx="3" fill="#57514a"/>
    </svg>`;
  }
  const wide = product.category === 'lift';
  return `<svg viewBox="0 0 ${wide ? 150 : 120} 150" aria-hidden="true" focusable="false">
    <rect x="10" y="8" width="${wide ? 130 : 100}" height="134" rx="12" fill="#f7f4ee"/>
    <rect x="10" y="8" width="${wide ? 130 : 100}" height="134" rx="12" fill="none" stroke="#cfc6b6" stroke-width="2"/>
    <rect x="${wide ? 45 : 30}" y="30" width="60" height="34" rx="5" fill="#1f1c18"/>
    <path d="M${wide ? 78 : 63} 36 ${wide ? 66 : 51} 50h8l-3 9 11-13h-8z" fill="#f2a93b"/>
    <circle cx="${wide ? 55 : 40}" cy="80" r="3" fill="#7fc28d"/>
    <circle cx="${wide ? 67 : 52}" cy="80" r="3" fill="#f2a93b"/>
    <circle cx="${wide ? 79 : 64}" cy="80" r="3" fill="#cfc6b6"/>
    <rect x="28" y="96" width="${wide ? 94 : 64}" height="4" rx="2" fill="#e2dacb"/>
    <rect x="28" y="106" width="${wide ? 94 : 64}" height="4" rx="2" fill="#e2dacb"/>
    <rect x="28" y="116" width="${wide ? 94 : 64}" height="4" rx="2" fill="#e2dacb"/>
  </svg>`;
}

const chips = (items) => items.map((item) => `<span class="chip">${esc(item)}</span>`).join('');
const stockChip = (product) => `<span class="chip ${product.stock === 'in_stock' ? 'chip--ok' : 'chip--wait'}">${stockLabel(product)}</span>`;

function tierChip(product) {
  if (product.twoZone === true) return '<span class="chip chip--feature" title="Заряд від мережі за розкладом, економія з нічним тарифом">Двозонний тариф</span>';
  if (product.twoZone === false) return '<span class="chip chip--muted" title="Тримає резерв, але не заряджає батарею за нічним тарифом">Бюджетний</span>';
  return '';
}

function productCard(product, index = 0) {
  const spec = headlineSpec(product);
  const url = productPath(product);
  const hasPhoto = Boolean(product.image && isLocalImage(product.image));
  const visualClass = hasPhoto ? 'product__visual--photo' : `product__visual--${product.category}`;
  return `
    <article class="product" data-category="${product.category}" data-tier="${product.tier || ''}" data-price="${product.price ?? ''}" data-order="${index}">
      <a class="product__visual ${visualClass}" href="${url}" tabindex="-1" aria-hidden="true">
        <span class="product__spec"><strong>${spec.value}</strong>${spec.unit}</span>
        ${hasPhoto ? picture({ photoId: product.image, alt: product.name }) : productIllustration(product)}
      </a>
      <div class="product__body">
        <div class="product__brand">${esc(product.brand)} · ${CATEGORIES[product.category].label}</div>
        <h3 class="product__name"><a href="${url}">${esc(product.name)}</a></h3>
        <p class="product__tagline">${esc(product.tagline)}</p>
        <div class="chips">${tierChip(product)}${chips(specList(product).slice(0, 3))}${stockChip(product)}</div>
        <div class="product__footer">
          ${priceHtml(product)}
          <a class="btn btn--outline btn--small" href="${url}">Детальніше</a>
        </div>
      </div>
    </article>`;
}

function kitCard(kit, featured) {
  const url = productPath(kit);
  return `
    <article class="kit${featured ? ' kit--featured' : ''}">
      ${featured ? '<span class="kit__ribbon">Найчастіше обирають</span>' : ''}
      <a class="kit__photo" href="${url}" tabindex="-1" aria-hidden="true">
        ${picture({ photoId: kit.image, widths: [480, 800, 1200], sizes: '(max-width: 760px) 100vw, 25vw' })}
      </a>
      <div class="kit__body">
        <h3><a href="${url}">${esc(kit.name)}</a></h3>
        <p class="kit__tagline">${esc(kit.tagline)}</p>
        <dl class="kit__stats">
          <div><dt>Потужність</dt><dd>${formatKw(kit.powerKw)}</dd></div>
          <div><dt>Ємність</dt><dd>${formatKwh(kit.capacityKwh)}</dd></div>
          <div><dt>Мережа</dt><dd>${kit.phases === 3 ? '3 фази' : '1 фаза'}</dd></div>
        </dl>
        <ul class="kit__components">
          ${kit.parts.map((part) => `<li>${part.qty > 1 ? `${part.qty} × ` : ''}${esc(part.name)}</li>`).join('')}
          <li>${KIT_MOUNTING_LABELS[kit.mountingKit]}</li>
        </ul>
        <div class="kit__footer">
          <div class="kit__price">${priceHtml(kit)}<span class="kit__price-note">обладнання і монтажний набір</span></div>
          <a class="btn ${featured ? 'btn--primary' : 'btn--outline'}" href="${url}">Детальніше</a>
        </div>
      </div>
    </article>`;
}

function contactSection(contextText = '') {
  return `
    <section class="contact" id="contact">
      ${picture({ photoId: 'photo-1759743918954-f373b0d8a891', className: 'contact__bg', widths: [800, 1600, 2200] })}
      <div class="container contact__grid">
        <div class="contact__info">
          <p class="kicker kicker--light">Контакти</p>
          <h2>Наступне відключення зустріньте зі світлом</h2>
          <p>Залиште номер: інженер передзвонить протягом робочого дня, уточнить прилади і надішле розрахунок з цінами. Без нав'язливих продажів.</p>
          <div class="contact__channels">
            <a class="channel" href="tel:${site.phone}">
              <span class="channel__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg></span>
              <span><span class="channel__label">Телефон</span><strong>${esc(site.phoneLabel)}</strong></span>
            </a>
            <a class="channel" href="tel:${site.phone2}">
              <span class="channel__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg></span>
              <span><span class="channel__label">Телефон</span><strong>${esc(site.phone2Label)}</strong></span>
            </a>
            <a class="channel" href="https://t.me/${site.telegram}" target="_blank" rel="noopener">
              <span class="channel__icon channel__icon--tg">${telegramIcon()}</span>
              <span><span class="channel__label">Telegram</span><strong>${esc(site.telegramLabel)}</strong></span>
            </a>
            <a class="channel" href="${viberUrl()}">
              <span class="channel__icon channel__icon--viber">${viberIcon()}</span>
              <span><strong>Viber</strong></span>
            </a>
            <a class="channel" href="${whatsappUrl()}" target="_blank" rel="noopener">
              <span class="channel__icon channel__icon--wa">${whatsappIcon()}</span>
              <span><strong>WhatsApp</strong></span>
            </a>
          </div>
          <p class="contact__hours">Працюємо ${esc(site.workingHours)}</p>
        </div>
        <form class="form" id="lead-form" novalidate>
          <h3 class="form__title">Отримати розрахунок</h3>
          <div class="form__context" id="form-context"${contextText ? '' : ' hidden'}>
            <span class="form__context-title">Вас цікавить</span>
            <pre id="form-context-text">${esc(contextText)}</pre>
            <button type="button" class="link-btn" id="form-context-clear">Прибрати</button>
          </div>
          <div class="form__row">
            <label class="field">
              <span>Ім'я</span>
              <input name="name" autocomplete="name" required maxlength="80">
              <small class="field__error" data-error-for="name"></small>
            </label>
            <label class="field">
              <span>Телефон</span>
              <input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="0XX XXX XX XX" required maxlength="30">
              <small class="field__error" data-error-for="phone"></small>
            </label>
          </div>
          <label class="field">
            <span>Місто</span>
            <input name="city" autocomplete="address-level2" maxlength="80">
          </label>
          <fieldset class="field field--radios">
            <legend>Як зручніше зв'язатися</legend>
            <label class="radio-pill"><input type="radio" name="contactVia" value="phone" checked><span>Дзвінок</span></label>
            <label class="radio-pill"><input type="radio" name="contactVia" value="telegram"><span>Telegram</span></label>
            <label class="radio-pill"><input type="radio" name="contactVia" value="viber"><span>Viber</span></label>
            <label class="radio-pill"><input type="radio" name="contactVia" value="whatsapp"><span>WhatsApp</span></label>
          </fieldset>
          <label class="field">
            <span>Коментар</span>
            <textarea name="message" rows="3" maxlength="1500" placeholder="Наприклад: приватний будинок, газовий котел, насос свердловини"></textarea>
          </label>
          <input class="form__trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <button type="submit" class="btn btn--primary btn--block btn--lg">Надіслати заявку</button>
          <p class="form__status" id="form-status" role="status"></p>
        </form>
      </div>
    </section>`;
}

const viberUrl = () => `viber://chat?number=%2B${site.messengerPhone}`;
const whatsappUrl = () => `https://wa.me/${site.messengerPhone}`;

function viberIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.4 2C7.6 2 4 3 3.4 7.6c-.4 3-.3 5.8.6 8.4.5 1.4 1.6 2.4 3 2.9v2.6c0 .5.6.7.9.3l2.4-2.6c.6 0 1.2.1 1.8 0 3.9-.1 7.4-1.3 8-5.4.4-2.8.4-5.6-.4-8.1C18.7 2.6 15 2 11.4 2Zm4.9 13c-.4.6-1 1.1-1.7 1-2.6-.6-4.9-2-6.6-4.2-.8-1-1.4-2.1-1.6-3.4-.1-.8.6-1.6 1.4-1.8.3-.1.6 0 .8.3l1 1.5c.2.3.2.8-.1 1l-.5.4c-.2.2-.2.4-.1.6.7 1.4 1.8 2.5 3.2 3.1.2.1.4 0 .6-.1l.5-.5c.3-.3.7-.3 1-.1l1.4 1c.3.3.4.7.2 1.1ZM12.6 6c2.6.2 4.4 2 4.6 4.6 0 .3-.2.5-.4.5s-.5-.2-.5-.4c-.2-2.1-1.6-3.6-3.7-3.8-.3 0-.5-.2-.4-.5 0-.2.2-.4.4-.4Zm.2 1.7c1.6.2 2.6 1.2 2.8 2.8 0 .3-.2.5-.4.5-.3 0-.5-.1-.5-.4-.2-1.1-.8-1.8-2-2-.2 0-.4-.3-.4-.5.1-.3.3-.4.5-.4Z" fill="currentColor"/></svg>';
}

function whatsappIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.7 4.3 3.8 1.6.7 2.2.8 3 .6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" fill="currentColor"/></svg>';
}

function telegramIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.5 2.8 10.7c-1 .4-1 1.6.1 1.9l4.6 1.4 1.8 5.6c.3.8 1.3 1 1.9.4l2.6-2.4 4.7 3.5c.7.5 1.7.1 1.9-.7L23 4.8c.2-1-.6-1.7-1.5-1.3ZM9.6 14.3l-.4 3.6-1.4-4.4L18.5 7z" fill="currentColor"/></svg>';
}

function logo() {
  return `<a href="/" class="logo">
    <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#1c1a17"/><g fill="none" stroke="#e8b45a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 25A23 23 0 0 1 53.9 25"/><path d="M53.9 39A23 23 0 0 1 10.1 39"/><path d="M4 32h5l2.5-5 3 10 2.5-5H22"/><path d="M42 32h5l2.5-5 3 10 2.5-5H60"/><rect x="23" y="19" width="18" height="27" rx="3"/><path d="M28 19v-2.5h2.5V19M33.5 19v-2.5H36V19"/></g><g fill="#e8b45a" opacity="0.3"><rect x="26" y="22.5" width="12" height="5.5" rx="1"/><rect x="26" y="30" width="12" height="5.5" rx="1"/><rect x="26" y="37.5" width="12" height="5.5" rx="1"/></g><path d="M34.5 21.5 27.5 33.5h5l-2.5 10L37 30.5h-5z" fill="#f7c873" stroke="#1c1a17" stroke-width="1.2" stroke-linejoin="round"/></svg>
    <span>${site.name}</span>
  </a>`;
}

function header() {
  return `
  <header class="topbar">
    <div class="container topbar__inner">
      ${logo()}
      <nav class="nav" id="site-nav" aria-label="Головне меню">
        <a href="/#calculator">Калькулятор</a>
        <a href="${categoryPath('kit')}">Комплекти</a>
        <a href="${categoryPath('inverter')}">Інвертори</a>
        <a href="${categoryPath('battery')}">Акумулятори</a>
        <a href="${categoryPath('lift')}">Ліфти ОСББ</a>
        <a href="${SERVICES_PATH}">Послуги</a>
        <a href="${PROJECTS_PATH}">Наші роботи</a>
      </nav>
      <div class="topbar__contacts">
        <div class="topbar__phones">
          <a class="topbar__phone" href="tel:${site.phone}"><svg class="topbar__phone-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg>${esc(site.phoneLabel)}</a>
          <a class="topbar__phone" href="tel:${site.phone2}"><svg class="topbar__phone-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg>${esc(site.phone2Label)}</a>
        </div>
        <a class="btn btn--small btn--tg" href="https://t.me/${site.telegram}" target="_blank" rel="noopener">Telegram</a>
      </div>
      <button type="button" class="menu-toggle" aria-controls="site-nav" aria-expanded="false" aria-label="Відкрити меню">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>`;
}

function footer() {
  return `
  <footer class="footer">
    <div class="container footer__grid">
      <div class="footer__about">
        ${logo()}
        <p>Гібридні інвертори, акумулятори і монтаж резервного живлення для квартир, будинків і бізнесу. ${esc(site.city)} та вся Україна.</p>
      </div>
      <nav class="footer__nav" aria-label="Каталог">
        <span class="footer__title">Каталог</span>
        <a href="${categoryPath('kit')}">Комплекти</a>
        <a href="${categoryPath('inverter')}">Гібридні інвертори</a>
        <a href="${categoryPath('battery')}">Акумулятори LiFePO4</a>
        <a href="${categoryPath('lift')}">Резервне живлення ліфтів</a>
        <a href="${SERVICES_PATH}">Монтаж і сервіс</a>
        <a href="${PROJECTS_PATH}">Наші роботи</a>
        <a href="/#calculator">Калькулятор підбору</a>
      </nav>
      <div class="footer__nav">
        <span class="footer__title">Контакти</span>
        <a href="tel:${site.phone}">${esc(site.phoneLabel)}</a>
        <a href="tel:${site.phone2}">${esc(site.phone2Label)}</a>
        <a href="https://t.me/${site.telegram}" target="_blank" rel="noopener">Telegram ${esc(site.telegramLabel)}</a>
        <a href="${viberUrl()}">Viber</a>
        <a href="${whatsappUrl()}" target="_blank" rel="noopener">WhatsApp</a>
        <span>${esc(site.workingHours)}</span>
      </div>
    </div>
    <div class="container footer__bottom">
      <span>© ${new Date().getFullYear()} ${site.name}</span>
      <span>Фото: <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a></span>
    </div>
  </footer>
  <a class="fab" href="https://t.me/${site.telegram}" target="_blank" rel="noopener" aria-label="Написати в Telegram">${telegramIcon()}</a>`;
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Навігація">
    <ol>${items.map((item, i) => (i < items.length - 1
      ? `<li><a href="${item.path}">${esc(item.name)}</a></li>`
      : `<li aria-current="page">${esc(item.name)}</li>`)).join('')}</ol>
  </nav>`;
}

const storeId = () => absoluteUrl('/#store');

function storeSchema() {
  return {
    '@type': 'Store',
    '@id': storeId(),
    name: site.name,
    url: absoluteUrl('/'),
    image: unsplashUrl(site.defaultImage, 1200),
    telephone: site.phone,
    contactPoint: [site.phone, site.phone2].map((telephone) => ({ '@type': 'ContactPoint', telephone, contactType: 'sales', areaServed: 'UA', availableLanguage: ['uk'] })),
    priceRange: site.priceRange,
    address: { '@type': 'PostalAddress', addressLocality: site.city, addressRegion: site.region, addressCountry: site.country },
    areaServed: { '@type': 'Country', name: 'Україна' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: site.openingHours.days, opens: site.openingHours.opens, closes: site.openingHours.closes }],
    sameAs: [`https://t.me/${site.telegram}`],
  };
}

function websiteSchema() {
  return { '@type': 'WebSite', '@id': absoluteUrl('/#website'), url: absoluteUrl('/'), name: site.name, inLanguage: 'uk-UA', publisher: { '@id': storeId() } };
}

function faqSchema() {
  return {
    '@type': 'FAQPage',
    mainEntity: FAQ.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  };
}

function breadcrumbSchema(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

function productSchema(product) {
  return {
    '@type': 'Product',
    '@id': absoluteUrl(`${productPath(product)}#product`),
    name: product.name,
    sku: product.id,
    description: productDescription(product),
    image: [isLocalImage(productPhotoId(product)) ? absoluteUrl(productPhotoId(product)) : unsplashUrl(productPhotoId(product), 1200)],
    brand: { '@type': 'Brand', name: brandOf(product) },
    category: CATEGORIES[product.category].h1,
    ...(product.price === null ? {} : {
      offers: {
        '@type': 'Offer',
        url: absoluteUrl(productPath(product)),
        priceCurrency: 'UAH',
        price: product.price,
        availability: product.stock === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/BackOrder',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@id': storeId() },
      },
    }),
  };
}

function itemListSchema(products) {
  return {
    '@type': 'ItemList',
    itemListElement: products.map((product, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(productPath(product)), name: product.name })),
  };
}

function jsonLd(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function layout({ title, description, path, body, graph = [], ogType = 'website', ogImage = site.defaultImage, extraMeta = '', noindex = false, assetVersion }) {
  const canonical = absoluteUrl(path);
  const image = isLocalImage(ogImage) ? absoluteUrl(ogImage) : unsplashUrl(ogImage, 1200);
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${site.noindexAll ? 'noindex, nofollow' : noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
  ${noindex ? '' : `<link rel="canonical" href="${canonical}">
  <link rel="alternate" hreflang="uk" href="${canonical}">
  <link rel="alternate" hreflang="x-default" href="${canonical}">`}
  <meta name="theme-color" content="#171512">
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:locale" content="uk_UA">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="800">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${image}">
  ${extraMeta}
  <link rel="preconnect" href="https://images.unsplash.com">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Rubik:wght@400;500;600&family=Unbounded:wght@400;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${graph.length ? jsonLd(graph) : ''}
</head>
<body data-phone-label="${esc(site.phoneLabel)}">
  <a class="skip-link" href="#main">Перейти до вмісту</a>
  ${header()}
  <main id="main">
${body}
  </main>
  ${footer()}
  <script src="/app.js?v=${assetVersion}" defer></script>
</body>
</html>
`;
}

function calculatorData(products) {
  const fields = ['id', 'category', 'brand', 'name', 'tier', 'twoZone', 'powerKw', 'phases', 'batteryVoltage', 'capacityKwh', 'price'];
  const data = products
    .filter((p) => (p.category === 'inverter' || p.category === 'battery') && p.price !== null)
    .map((p) => ({ ...Object.fromEntries(fields.filter((f) => p[f] !== undefined).map((f) => [f, p[f]])), url: productPath(p) }));
  return `<script type="application/json" id="products-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
      <script type="application/json" id="pricing-data">${JSON.stringify({ ...site.pricing, minHomeInverterKw: site.minHomeInverterKw })}</script>`;
}

function homePage(products, projects, assetVersion) {
  const kits = products.filter((p) => p.category === 'kit');
  const catalog = products.filter((p) => p.category === 'inverter' || p.category === 'battery');
  const lifts = products.filter((p) => p.category === 'lift');
  const body = `
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__content">
          <p class="eyebrow"><span class="pulse"></span>Графіки відключень — не ваша проблема</p>
          <h1>Гібридні інвертори: світло вдома, навіть коли його <em>вимкнули</em></h1>
          <p class="hero__lead">Інвертор з акумулятором перемикає квартиру чи будинок на резерв за мілісекунди. Роутер не перезавантажується, холодильник працює, котел гріє. Тихо, без генератора і бензину.</p>
          <div class="hero__actions">
            <a href="#calculator" class="btn btn--primary btn--lg">Порахувати свою систему</a>
            <a href="${categoryPath('kit')}" class="btn btn--ghost btn--lg">Готові комплекти</a>
          </div>
        </div>
        <div class="hero__visual">
          <div class="hero__art" role="img" aria-label="Лампочка світиться: світло увімкнене">
            <svg viewBox="0 0 400 360" aria-hidden="true">
              <defs>
                <radialGradient id="bulb-glass" cx="45%" cy="38%" r="65%">
                  <stop offset="0" stop-color="#fffdf2"/>
                  <stop offset="0.55" stop-color="#ffe9a8"/>
                  <stop offset="1" stop-color="#f7c252"/>
                </radialGradient>
                <radialGradient id="bulb-halo" cx="50%" cy="50%" r="50%">
                  <stop offset="0" stop-color="#fff3c4" stop-opacity="0.95"/>
                  <stop offset="0.6" stop-color="#ffd978" stop-opacity="0.35"/>
                  <stop offset="1" stop-color="#ffd978" stop-opacity="0"/>
                </radialGradient>
              </defs>
              <g class="hero__art-scene">
              <circle class="hero__art-halo" cx="200" cy="150" r="170" fill="url(#bulb-halo)"/>
              <g class="hero__art-rays"><line x1="200.0" y1="38.0" x2="200.0" y2="0.0"/><line x1="256.0" y1="53.0" x2="268.0" y2="32.2"/><line x1="297.0" y1="94.0" x2="329.9" y2="75.0"/><line x1="312.0" y1="150.0" x2="336.0" y2="150.0"/><line x1="297.0" y1="206.0" x2="329.9" y2="225.0"/><line x1="103.0" y1="206.0" x2="70.1" y2="225.0"/><line x1="88.0" y1="150.0" x2="64.0" y2="150.0"/><line x1="103.0" y1="94.0" x2="70.1" y2="75.0"/><line x1="144.0" y1="53.0" x2="132.0" y2="32.2"/></g>
              <path class="hero__art-glass" d="M164 226c0-24-44-40-44-84a80 80 0 1 1 160 0c0 44-44 60-44 84z" fill="url(#bulb-glass)"/>
              <path class="hero__art-filament" d="M182 226v-46l9-14 9 14 9-14 9 14v46"/>
              <ellipse cx="172" cy="112" rx="14" ry="24" fill="#fff" opacity="0.7" transform="rotate(28 172 112)"/>
              <g class="hero__art-base">
                <rect x="162" y="228" width="76" height="14" rx="5"/>
                <rect x="164" y="244" width="72" height="12" rx="5"/>
                <rect x="167" y="258" width="66" height="12" rx="5"/>
                <path d="M180 272h40l-8 16h-24z"/>
              </g>
              </g>
            </svg>
          </div>
        <aside class="status-card" aria-label="Приклад роботи системи під час відключення">
          <div class="status-card__head">
            <span class="status-card__badge"><span class="dot"></span>Світла немає</span>
            <span class="status-card__time">19:42 · за графіком до 23:00</span>
          </div>
          <div class="status-card__battery">
            <div class="status-card__level"><strong>78%</strong><span>заряд акумулятора</span></div>
            <div class="gauge" role="img" aria-label="Заряд 78 відсотків"><span style="--level: 78%"></span></div>
            <div class="status-card__eta">вистачить ще на <strong>≈ 9 год</strong></div>
          </div>
          <ul class="status-card__loads">
            <li><span>Холодильник</span><span>150 Вт</span></li>
            <li><span>Газовий котел</span><span>120 Вт</span></li>
            <li><span>Роутер і термінал</span><span>20 Вт</span></li>
            <li><span>Освітлення</span><span>50 Вт</span></li>
            <li><span>Ноутбук</span><span>65 Вт</span></li>
          </ul>
          <div class="status-card__foot">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg>
            Перемкнулось за 8 мс. Ніхто не помітив.
          </div>
        </aside>
        </div>
      </div>
      <div class="container">
        <ul class="hero__facts">
          <li><strong>&lt; 10 мс</strong><span>перемикання на акумулятор</span></li>
          <li><strong>6 000+</strong><span>циклів заряду LiFePO4</span></li>
          <li><strong>1 день</strong><span>монтаж у квартирі</span></li>
          <li><strong>6 кВт</strong><span>вистачає звичайній квартирі</span></li>
        </ul>
      </div>
    </section>

    <div class="brands">
      <div class="container brands__inner">
        <span class="brands__label">Обладнання в каталозі</span>
        <span>Deye</span><span>Felicity</span><span>Growatt</span><span>Solis</span><span>LuxPower</span><span>MUST</span>
      </div>
    </div>

    <section class="promo" id="video">
      <div class="container promo__inner">
        <div class="promo__text">
          <p class="kicker">Як це виглядає</p>
          <h2>Світло вдома, навіть коли в усьому будинку темно</h2>
          <p class="section-lead">10 секунд про те, як працює резервне живлення: у квартирі горить світло і працює техніка, а ліфт у під'їзді возить мешканців далі.</p>
          <div class="promo__actions">
            <a href="#calculator" class="btn btn--primary">Порахувати свою систему</a>
            <a href="${SERVICES_PATH}" class="btn btn--outline">Наші послуги</a>
          </div>
        </div>
        <div class="promo__media">
          <video class="promo__video" src="/video/promo.mp4#t=0.1" muted loop playsinline preload="metadata" aria-label="Відео: як працює резервне живлення в квартирі під час відключення"></video>
          <button type="button" class="promo__sound" aria-pressed="false" aria-label="Увімкнути звук">
            <svg class="promo__sound-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>
            <svg class="promo__sound-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          </button>
        </div>
      </div>
    </section>

    <section class="how" id="how">
      <div class="container how__grid">
        <div class="how__text">
          <p class="kicker">Як це працює</p>
          <h2>Інвертор стоїть між мережею і вашими розетками</h2>
          <p class="section-lead">Поки світло є, він живить дім і заряджає акумулятор. Зникло світло — дім живиться від акумулятора, а вдень ще й від сонця, якщо є панелі.</p>
          <ol class="steps">
            <li><strong>Є світло.</strong> Мережа живить дім через інвертор, акумулятор заряджається.</li>
            <li><strong>Вимкнули.</strong> За мілісекунди інвертор переходить на акумулятор. Техніка не вимикається.</li>
            <li><strong>Повернули.</strong> Дім знову на мережі, акумулятор заряджається до наступного разу.</li>
            <li><strong>Сонце, за бажанням.</strong> Панелі можна додати пізніше, без заміни інвертора.</li>
          </ol>
        </div>
        <figure class="diagram">
          <svg viewBox="0 0 600 480" role="img" aria-label="Схема: мережа і сонячні панелі живлять інвертор, інвертор живить дім і заряджає акумулятор">
            <path class="wire" d="M170 110 C 230 110, 230 230, 240 230"/>
            <path class="wire wire--sun" d="M170 350 C 230 350, 230 230, 240 230"/>
            <path class="wire wire--out" d="M360 230 L 430 230"/>
            <path class="wire wire--out" d="M300 290 L 300 360"/>
            <g class="node" transform="translate(70 60)">
              <rect width="100" height="100" rx="22"/>
              <g class="node__tower">
                <path d="M34 84 46 22 50 13 54 22 66 84M24 32h52M30 48h40M44 32l15 16M56 32 41 48M41 48l25 36M59 48 34 84M30 84h40" class="node__icon"/>
                <path d="M26 32v7M74 32v7M32 48v7M68 48v7" class="node__insulator"/>
                <circle cx="50" cy="13" r="2.6" class="node__beacon"/>
              </g>
              <text x="50" y="128">Мережа</text>
            </g>
            <g class="node" transform="translate(70 300)">
              <rect width="100" height="100" rx="22"/>
              <circle cx="50" cy="50" r="12" class="node__icon"/>
              <path d="M50 22v8M50 70v8M22 50h8M70 50h8M30 30l6 6M64 64l6 6M30 70l6-6M64 36l6-6" class="node__icon"/>
              <text x="50" y="128">Сонце</text>
            </g>
            <g class="node node--core" transform="translate(240 170)">
              <rect width="120" height="120" rx="26"/>
              <path d="M66 28 42 64h16l-5 28 24-38H62z" class="node__bolt"/>
              <text x="60" y="-14">Інвертор</text>
            </g>
            <g class="node" transform="translate(430 180)">
              <rect width="100" height="100" rx="22"/>
              <path d="M26 54 50 32l24 22v26H26zM44 80V62h12v18" class="node__icon"/>
              <text x="50" y="128">Дім</text>
            </g>
            <g class="node" transform="translate(250 360)">
              <rect width="100" height="70" rx="18"/>
              <rect x="24" y="22" width="46" height="26" rx="4" class="node__icon"/>
              <rect x="70" y="30" width="5" height="10" rx="2" class="node__fill"/>
              <rect x="28" y="26" width="8" height="18" rx="1.5" class="node__fill node__cell node__cell--1"/>
              <rect x="38" y="26" width="8" height="18" rx="1.5" class="node__fill node__cell node__cell--2"/>
              <rect x="48" y="26" width="8" height="18" rx="1.5" class="node__fill node__cell node__cell--3"/>
              <rect x="58" y="26" width="8" height="18" rx="1.5" class="node__fill node__cell node__cell--4"/>
              <text x="50" y="94">Акумулятор</text>
            </g>
          </svg>
        </figure>
      </div>
    </section>

    <section class="calc" id="calculator">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="kicker">Калькулятор підбору</p>
            <h2>Який інвертор і акумулятор вам потрібні</h2>
          </div>
          <p class="section-lead">Позначте, що має працювати під час відключення і скільки воно триває. Порахуємо потужність інвертора, ємність акумулятора і підберемо обладнання з каталогу.</p>
        </div>
        <div class="calc__layout">
          <div class="calc__inputs">
            <div class="calc__conditions">
              <label class="field">
                <span>Тривалість відключення: <strong id="hours-value">4 год</strong></span>
                <input type="range" id="hours" min="2" max="16" step="1" value="4">
                <span class="range-scale" aria-hidden="true"><span>2 год</span><span>8 год</span><span>16 год</span></span>
              </label>
              <label class="field">
                <span>Мережа в будинку</span>
                <select id="phases">
                  <option value="1">1 фаза (квартира, більшість будинків)</option>
                  <option value="3">3 фази</option>
                </select>
              </label>
              <label class="field">
                <span>Двозонний лічильник (нічний тариф)</span>
                <select id="two-zone">
                  <option value="no">Ні або не знаю</option>
                  <option value="yes">Так, хочу заряджати вночі дешевше</option>
                </select>
              </label>
              <label class="field">
                <span>Де стоятиме батарея</span>
                <select id="battery-place">
                  <option value="heated">В опалюваному приміщенні</option>
                  <option value="unheated">Гараж, комора, підвал без опалення</option>
                </select>
              </label>
              <label class="switch">
                <input type="checkbox" id="with-installation" checked>
                <span class="switch__track" aria-hidden="true"></span>
                <span>Потрібен монтаж під ключ</span>
              </label>
            </div>
            <div class="appliances" id="appliances"></div>
          </div>
          <aside class="calc__result" id="calc-result" aria-live="polite"></aside>
        </div>
      </div>
      ${calculatorData(products)}
    </section>

    <section class="kits" id="kits">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="kicker">Комплекти</p>
            <h2>Готові рішення під ключ</h2>
          </div>
          <p class="section-lead">Інвертор, акумулятори і захист, які ми вже багато разів ставили разом. Найшвидший шлях до світла без вивчення характеристик.</p>
        </div>
        <div class="kits__grid">${kits.map((kit) => kitCard(kit, kit.id === 'kit-house')).join('')}</div>
      </div>
    </section>

    <section class="catalog" id="catalog">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="kicker">Каталог</p>
            <h2>Інвертори та акумулятори</h2>
          </div>
          <div class="catalog__controls">
            <div class="tabs" role="group" aria-label="Категорія">
              <button class="tab is-active" aria-pressed="true" data-category="all">Усе</button>
              <button class="tab" aria-pressed="false" data-category="inverter">Інвертори</button>
              <button class="tab" aria-pressed="false" data-category="battery">Акумулятори</button>
            </div>
            <select id="filter-tier" aria-label="Клас інвертора">
              <option value="">Усі інвертори</option>
              <option value="recommended">З двозонним тарифом</option>
              <option value="budget">Бюджетні</option>
            </select>
            <select id="sort" aria-label="Сортування">
              <option value="popular">Спершу популярні</option>
              <option value="price-asc">Спершу дешевші</option>
              <option value="price-desc">Спершу дорожчі</option>
            </select>
          </div>
        </div>
        <div class="products" id="products">${catalog.map(productCard).join('')}</div>
        <p class="products__empty" id="products-empty" hidden>Нічого не знайдено. Змініть фільтри.</p>
        <div class="catalog__more">
          <a class="btn btn--outline" href="${categoryPath('inverter')}">Усі гібридні інвертори</a>
          <a class="btn btn--outline" href="${categoryPath('battery')}">Усі акумулятори</a>
        </div>
        <p class="note">Ціни орієнтовні та залежать від курсу. Точну ціну і наявність підтвердить менеджер.</p>
      </div>
    </section>

    <section class="lifts" id="lifts">
      <div class="container lifts__grid">
        <figure class="lifts__photo">
          ${picture({ photoId: CATEGORIES.lift.image, alt: 'Світлий ліфтовий хол багатоквартирного будинку', widths: [480, 800, 1200], sizes: '(max-width: 1180px) 100vw, 40vw' })}
        </figure>
        <div class="lifts__text">
          <p class="kicker">Для ОСББ</p>
          <h2>Ліфт, який не зупиняється між поверхами</h2>
          <p class="section-lead">Трифазні гібридні інвертори 20–30 кВт для ліфтів багатоквартирних будинків. Тип системи залежить від двигуна ліфта.</p>
          <div class="lifts__types">
            <div class="lifts__type">
              <strong>Низьковольтні, 20 кВт</strong>
              <p>Батареї 48 В. Для ліфтів з інверторними двигунами.</p>
              <span>від ${formatPrice(Math.min(...lifts.filter((p) => p.voltageClass === 'LV' && p.price).map((p) => p.price)))}</span>
            </div>
            <div class="lifts__type">
              <strong>Високовольтні, 30 кВт</strong>
              <p>Збірка від 5 батарей. Для старих ліфтів з двошвидкісними двигунами.</p>
              <span>від ${formatPrice(Math.min(...lifts.filter((p) => p.voltageClass === 'HV' && p.price).map((p) => p.price)))}</span>
            </div>
          </div>
          <div class="page-head__actions">
            <a class="btn btn--primary" href="${categoryPath('lift')}">Інвертори для ліфтів</a>
            <a class="btn btn--outline" href="#contact" data-consult="Резервне живлення ліфта для ОСББ: потрібен огляд і розрахунок">Замовити огляд ліфта</a>
          </div>
        </div>
      </div>
    </section>

    ${projectsTeaser(projects)}

    <section class="install" id="services">
      <div class="container">
        <div class="install__grid">
          <figure class="install__photo">
            ${picture({ photoId: '/projects/kvartyra-kyiv-deye-6k-lg-chem-1.jpg', alt: 'Наш монтаж у квартирі в Києві: інвертор Deye і акумулятор біля електрощитка', widths: [640, 1000, 1400], sizes: '(max-width: 1020px) 100vw, 50vw' })}
            <figcaption>Акуратний монтаж: інвертор, акумулятори і автомати захисту на одній стіні.</figcaption>
          </figure>
          <div class="install__text">
            <p class="kicker kicker--light">Монтаж під ключ</p>
            <h2>Від дзвінка до світла за кілька днів</h2>
            <ol class="timeline">
              <li><span class="timeline__day">День 1</span><div><strong>Заявка і розрахунок</strong><p>Інженер уточнить прилади, пускові струми насосів і графік відключень. Без продажу «з запасом».</p></div></li>
              <li><span class="timeline__day">День 2</span><div><strong>Виїзд і замір</strong><p>Подивимося щиток і місце під обладнання. У Києві та області — безкоштовно при замовленні монтажу.</p></div></li>
              <li><span class="timeline__day">День 3–5</span><div><strong>Доставка і монтаж</strong><p>Окрема резервна лінія, підписані автомати, налаштований застосунок. Квартира — 1 день, будинок — 1–2.</p></div></li>
              <li><span class="timeline__day">Далі</span><div><strong>Підтримка</strong><p>Налаштуємо режими під ваш графік, пояснимо, як користуватись, і будемо на зв'язку.</p></div></li>
            </ol>
          </div>
        </div>
        <div class="perks">
          <article class="perk">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 9h16v13H4zM20 13h5l3 4v5h-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="23" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="23" cy="23" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            <h3>Доставка по Україні</h3>
            <p>Новою поштою з оглядом і страховкою, у заводському пакуванні.</p>
          </article>
          <article class="perk">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 5 7v8c0 7 5 12 11 14 6-2 11-7 11-14V7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m11 16 3.5 3.5L21 13" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            <h3>Офіційна гарантія</h3>
            <p>Обладнання від офіційних дистриб'юторів, сервіс в Україні.</p>
          </article>
          <article class="perk">
            <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="8" width="24" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 13h24M9 19h6" stroke="currentColor" stroke-width="2"/></svg>
            <h3>Оплата частинами</h3>
            <p>Можлива оплата частинами через банк. Умови уточнюйте у менеджера.</p>
          </article>
          <article class="perk perk--photo">
            ${picture({ photoId: 'photo-1655300256335-beef51a914fe', alt: 'Будинок із сонячними панелями на даху', widths: [480, 800], sizes: '(max-width: 760px) 100vw, 25vw' })}
            <div><h3>Сонячні панелі</h3><p>Розширимо систему до СЕС, коли будете готові.</p></div>
          </article>
        </div>
      </div>
    </section>

    <section class="faq" id="faq">
      <div class="container faq__grid">
        <div class="faq__aside">
          <p class="kicker">Питання</p>
          <h2>Часті питання про інвертори</h2>
          <div class="faq__help">
            <p>Не знайшли відповідь? Напишіть, інженер відповість протягом робочого дня.</p>
            <a class="btn btn--tg" href="https://t.me/${site.telegram}" target="_blank" rel="noopener">Запитати в Telegram</a>
          </div>
        </div>
        <div class="faq__list">
          ${FAQ.map((item, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`).join('')}
        </div>
      </div>
    </section>
    ${contactSection()}`;

  return layout({
    title: `Гібридні інвертори та акумулятори для дому | ${site.name}`,
    description: 'Гібридні інвертори Deye, Growatt, Victron і LiFePO4 акумулятори для квартири, будинку та бізнесу. Калькулятор підбору, доставка по Україні, монтаж під ключ.',
    path: '/',
    body,
    graph: [storeSchema(), websiteSchema(), faqSchema(), itemListSchema([...kits, ...catalog, ...lifts])],
    ogImage: site.heroImage,
    assetVersion,
  });
}

const INVERTER_GROUPS = [
  { tier: 'recommended', title: 'З підтримкою двозонного лічильника', text: 'Заряджають батарею від мережі за розкладом, тож з нічним тарифом резерв дешевшає. Саме їх ми радимо для квартири і будинку.' },
  { tier: 'budget', title: 'Бюджетні', text: 'Прості інвертори, які надійно тримають резерв під час відключення, але не вміють заряджати батарею за нічним тарифом.' },
];

function categoryGrid(category, items) {
  if (category === 'kit') return `<div class="kits__grid">${items.map((kit) => kitCard(kit, kit.id === 'kit-house')).join('')}</div>`;
  if (category === 'inverter') {
    return INVERTER_GROUPS.map((group) => `
      <div class="catalog-group">
        <div class="catalog-group__head"><h2>${group.title}</h2><p>${group.text}</p></div>
        <div class="products">${items.filter((p) => p.tier === group.tier).map(productCard).join('')}</div>
      </div>`).join('');
  }
  if (category === 'lift') {
    return [['LV', 'Низьковольтні 20 кВт, батареї 48 В', 'Для ліфтів з інверторними (частотними) двигунами.'], ['HV', 'Високовольтні 30 кВт', 'Для старих ліфтів з двошвидкісними двигунами: збірка щонайменше з 5 батарей.']].map(([cls, title, text]) => `
      <div class="catalog-group">
        <div class="catalog-group__head"><h2>${title}</h2><p>${text}</p></div>
        <div class="products">${items.filter((p) => p.voltageClass === cls).map(productCard).join('')}</div>
      </div>`).join('');
  }
  return `<div class="products">${items.map(productCard).join('')}</div>`;
}

function categoryPage(category, products, assetVersion) {
  const meta = CATEGORIES[category];
  const items = products.filter((p) => p.category === category);
  const crumbs = [{ name: 'Головна', path: '/' }, { name: meta.navTitle, path: categoryPath(category) }];
  const actions = category === 'lift'
    ? `<a class="btn btn--primary" href="#contact" data-consult="Резервне живлення ліфта для ОСББ: потрібен огляд і розрахунок">Замовити огляд ліфта</a>`
    : `<a class="btn btn--primary" href="/#calculator">Підібрати за калькулятором</a>
          <a class="btn btn--outline" href="#contact">Консультація інженера</a>`;
  const body = `
    <section class="page-head">
      <div class="container">
        ${breadcrumbs(crumbs)}
        <h1>${esc(meta.h1)}</h1>
        <p class="section-lead">${esc(meta.intro)}</p>
        <div class="page-head__actions">${actions}</div>
      </div>
    </section>
    <section class="catalog catalog--page">
      <div class="container">
        ${categoryGrid(category, items)}
        <p class="note">Ціни орієнтовні та залежать від курсу. Точну ціну і наявність підтвердить менеджер.</p>
      </div>
    </section>
    ${contactSection(category === 'lift' ? 'Резервне живлення ліфта для ОСББ' : `${meta.navTitle}: потрібна консультація з вибору`)}`;
  return layout({
    title: `${meta.title} | ${site.name}`,
    description: meta.description,
    path: categoryPath(category),
    body,
    graph: [storeSchema(), breadcrumbSchema(crumbs), itemListSchema(items)],
    ogImage: meta.image,
    assetVersion,
  });
}

const yesNo = (value) => (value ? 'Так' : 'Ні');

function specRows(product) {
  const isInverter = product.category === 'inverter' || product.category === 'lift';
  return [
    ['Тип', CATEGORIES[product.category].label],
    product.brand && ['Бренд', product.brand],
    product.powerKw && ['Номінальна потужність', formatKw(product.powerKw)],
    product.peakKw && ['Пікова потужність', formatKw(product.peakKw)],
    product.phases && ['Фазність', product.phases === 3 ? 'Трифазний' : 'Однофазний'],
    isInverter && ['Система батарей', product.voltageClass === 'HV' ? `Високовольтна, ${product.batteryVoltageLabel}` : 'Низьковольтна, 48 В'],
    product.category === 'battery' && ['Напруга', '51,2 В (система 48 В)'],
    product.capacityKwh && ['Ємність', formatKwh(product.capacityKwh)],
    product.cycles && ['Ресурс', `${formatNumber(product.cycles)} циклів`],
    product.twoZone !== undefined && ['Двозонний лічильник', product.twoZone ? 'Так, заряд за розкладом' : 'Ні'],
    product.switchoverMs && ['Перемикання на батарею', `до ${product.switchoverMs} мс`],
    isInverter && product.pvMaxW && ['Сонячні панелі', `до ${formatNumber(product.pvMaxW)} Вт${product.mppt ? `, MPPT: ${product.mppt}` : ''}`],
    product.generator !== undefined && ['Вхід для генератора', yesNo(product.generator)],
    product.parallel && ['Паралельне підключення', `до ${product.parallel} шт.`],
    ['Гарантія', product.warrantyYears ? `${product.warrantyYears} р.` : 'уточнюйте у менеджера'],
    ['Наявність', stockLabel(product)],
  ].filter(Boolean).map(([label, value]) => `<tr><th scope="row">${label}</th><td>${esc(value)}</td></tr>`).join('');
}

function kitComposition(kit) {
  const lines = kit.parts.map((part) => `<li><a href="${part.path}">${part.qty > 1 ? `${part.qty} × ` : ''}${esc(part.name)}</a></li>`);
  lines.push(`<li>${KIT_MOUNTING_LABELS[kit.mountingKit]} — ${formatPrice(kit.mountingKitPrice)}</li>`);
  return `<h2>Склад комплекту</h2><ul class="checklist checklist--dark">${lines.join('')}</ul>
    <p class="pdp__aside-note">Монтаж і налаштування — від ${formatPrice(site.pricing.installation)} для звичайної квартири${kit.phases === 3 ? ', для трифазних систем після огляду' : ''}.</p>`;
}

function productPage(product, products, projects, assetVersion) {
  const meta = CATEGORIES[product.category];
  const crumbs = [{ name: 'Головна', path: '/' }, { name: meta.navTitle, path: categoryPath(product.category) }, { name: product.name, path: productPath(product) }];
  const sameGroup = (p) => p.category === product.category && p.id !== product.id && (product.tier ? p.tier === product.tier : true);
  const related = [...products.filter(sameGroup), ...products.filter((p) => p.category === product.category && p.id !== product.id && !sameGroup(p))].slice(0, 4);
  const spec = headlineSpec(product);
  const visual = product.image
    ? `<div class="pdp__media ${isLocalImage(product.image) ? 'pdp__media--product' : 'pdp__media--photo'}">${picture({ photoId: product.image, alt: product.name, widths: [640, 1000, 1400], sizes: '(max-width: 900px) 100vw, 50vw', eager: true })}</div>`
    : `<div class="pdp__media pdp__media--${product.category}"><span class="product__spec product__spec--lg"><strong>${spec.value}</strong>${spec.unit}</span>${productIllustration(product)}</div>`;
  const consultText = `${product.name} — ${priceText(product)}`;
  const priceNote = product.price === null
    ? 'Менеджер назве актуальну ціну і термін поставки'
    : product.category === 'kit' ? 'Обладнання і монтажний набір, без монтажу' : 'Ціна орієнтовна, уточнює менеджер';
  const body = `
    <section class="pdp">
      <div class="container">
        ${breadcrumbs(crumbs)}
        <div class="pdp__grid">
          ${visual}
          <div class="pdp__info">
            <div class="product__brand">${esc(brandOf(product))} · ${meta.label}</div>
            <h1>${esc(product.name)}</h1>
            <p class="pdp__tagline">${esc(product.tagline)}</p>
            <div class="chips">${tierChip(product)}${chips(specList(product))}${stockChip(product)}</div>
            <div class="pdp__buy">
              <div class="pdp__price">${priceHtml(product, 'price price--lg')}<span class="pdp__price-note">${priceNote}</span></div>
              <a class="btn btn--primary btn--lg" href="#contact" data-consult="${esc(consultText)}">${product.price === null ? 'Дізнатися ціну' : 'Отримати консультацію'}</a>
              <a class="btn btn--tg btn--lg" href="https://t.me/${site.telegram}" target="_blank" rel="noopener">Telegram</a>
            </div>
            <ul class="pdp__perks">
              <li>Доставка по Україні Новою поштою</li>
              <li>Монтаж під ключ у Києві та області</li>
              ${product.warrantyYears ? `<li>Офіційна гарантія ${product.warrantyYears} р.</li>` : '<li>Офіційна гарантія виробника</li>'}
            </ul>
          </div>
        </div>
        <div class="pdp__details">
          <div>
            <h2>Характеристики</h2>
            <table class="spec-table"><tbody>${specRows(product)}</tbody></table>
          </div>
          <div>
            ${product.category === 'kit' ? kitComposition(product) : ''}
            <h2>Переваги</h2>
            <ul class="checklist checklist--dark">${product.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    </section>
    ${related.length ? `
    <section class="related">
      <div class="container">
        <h2>Схожі товари</h2>
        <div class="${product.category === 'kit' ? 'kits__grid' : 'products'}">${related.map((p, i) => (product.category === 'kit' ? kitCard(p, false) : productCard(p, i))).join('')}</div>
      </div>
    </section>` : ''}
    ${projectsForProduct(product, projects)}
    ${contactSection(consultText)}`;
  const priceMeta = product.price === null ? '' : `<meta property="product:price:amount" content="${product.price}">
  <meta property="product:price:currency" content="UAH">`;
  return layout({
    title: product.price === null ? `${product.name} — купити, ціна за запитом | ${site.name}` : `${product.name} — ціна ${formatPrice(product.price)} | ${site.name}`,
    description: productDescription(product).slice(0, 160),
    path: productPath(product),
    body,
    graph: [storeSchema(), breadcrumbSchema(crumbs), productSchema(product)],
    ogType: 'product',
    ogImage: productPhotoId(product),
    extraMeta: `${priceMeta}
  <meta property="product:availability" content="${product.stock === 'in_stock' ? 'in stock' : 'available for order'}">`,
    assetVersion,
  });
}

function notFoundPage(assetVersion) {
  const body = `
    <section class="page-head page-head--center">
      <div class="container">
        <p class="kicker">404</p>
        <h1>Сторінку не знайдено</h1>
        <p class="section-lead">Можливо, товар зняли з продажу або посилання застаріло.</p>
        <div class="page-head__actions">
          <a class="btn btn--primary" href="/">На головну</a>
          <a class="btn btn--outline" href="${categoryPath('inverter')}">Каталог інверторів</a>
        </div>
      </div>
    </section>`;
  return layout({ title: `Сторінку не знайдено | ${site.name}`, description: 'Сторінку не знайдено.', path: '/404', body, noindex: true, assetVersion });
}

const PROJECT_TYPES = { apartment: 'Квартира', house: 'Приватний будинок', business: 'Бізнес', lift: 'Ліфт ОСББ' };
const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

function formatMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function prepareProjects(rawProjects, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return rawProjects
    .filter((project) => site.showDrafts || !project.draft)
    .map((project) => {
      const equipment = project.equipment.map((item) => {
        // Equipment we don't sell (e.g. the client's own battery) is described inline instead of by catalog id
        if (!item.id) return { product: { name: item.name, category: item.category, powerKw: item.powerKw || 0, capacityKwh: item.capacityKwh || 0, price: null, custom: true }, qty: item.qty || 1 };
        const product = byId.get(item.id);
        if (!product) throw new Error(`Project ${project.id}: unknown product ${item.id}`);
        return { product, qty: item.qty };
      });
      const inverters = equipment.filter((item) => item.product.category !== 'battery');
      const batteries = equipment.filter((item) => item.product.category === 'battery');
      return {
        ...project,
        equipment,
        powerKw: inverters.reduce((sum, item) => sum + item.product.powerKw * item.qty, 0),
        capacityKwh: batteries.reduce((sum, item) => sum + item.product.capacityKwh * item.qty, 0),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function draftChip(project) {
  return project.draft ? '<span class="chip chip--draft">Чернетка</span>' : '';
}

function projectCard(project) {
  const url = projectPath(project);
  return `
    <article class="project-card" data-type="${project.type}">
      <a class="project-card__photo" href="${url}" tabindex="-1" aria-hidden="true">
        ${picture({ photoId: project.cover, widths: [480, 800, 1200], sizes: '(max-width: 760px) 100vw, 33vw' })}
        <span class="project-card__type">${PROJECT_TYPES[project.type]}</span>
      </a>
      <div class="project-card__body">
        <div class="project-card__meta">${esc(project.city)} · ${formatMonth(project.date)} ${draftChip(project)}</div>
        <h3><a href="${url}">${esc(project.title)}</a></h3>
        <dl class="project-card__stats">
          <div><dt>Інвертор</dt><dd>${formatKw(project.powerKw)}</dd></div>
          <div><dt>Батареї</dt><dd>${formatKwh(project.capacityKwh)}</dd></div>
          <div><dt>Монтаж</dt><dd>${project.installDays} ${project.installDays === 1 ? 'день' : 'дні'}</dd></div>
        </dl>
      </div>
    </article>`;
}

function projectsTeaser(projects) {
  if (!projects.length) return '';
  return `
    <section class="projects-teaser" id="projects">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="kicker">Наші роботи</p>
            <h2>Як це виглядає вживу</h2>
          </div>
          <p class="section-lead">Квартири, будинки й ліфти, де ми вже поставили резервне живлення: задача, обладнання і результат.</p>
        </div>
        <div class="projects-grid">${projects.slice(0, 3).map(projectCard).join('')}</div>
        <div class="catalog__more"><a class="btn btn--outline" href="${PROJECTS_PATH}">Усі роботи</a></div>
      </div>
    </section>`;
}

function projectsForProduct(product, projects) {
  const used = projects.filter((project) => project.equipment.some((item) => item.product.id === product.id));
  if (!used.length) return '';
  return `
    <section class="related related--projects">
      <div class="container">
        <h2>Де ми це встановили</h2>
        <div class="projects-grid">${used.slice(0, 3).map(projectCard).join('')}</div>
      </div>
    </section>`;
}

function servicesPage(assetVersion) {
  const crumbs = [{ name: 'Головна', path: '/' }, { name: 'Послуги', path: SERVICES_PATH }];
  const body = `
    <section class="page-head">
      <div class="container">
        ${breadcrumbs(crumbs)}
        <h1>Наші послуги: монтаж, налаштування і сервіс</h1>
        <p class="section-lead">Встановимо не лише обладнання з нашого каталогу, а й те, що ви вже купили деінде. Налаштуємо систему і будемо доглядати за нею після монтажу.</p>
      </div>
    </section>
    <section class="catalog catalog--page">
      <div class="container">
        <div class="services__grid">
          ${SERVICES.map((service) => `
          <article class="service">
            <span class="service__icon" aria-hidden="true">${service.icon}</span>
            <h2>${service.title}</h2>
            <p>${service.text}</p>
            <ul>${service.points.map((point) => `<li>${point}</li>`).join('')}</ul>
            <div class="service__footer">
              ${service.priceFrom ? `<span class="price"><small>від</small> ${formatPrice(service.priceFrom)}</span>` : '<span class="price price--request">Ціна за запитом</span>'}
              <a class="btn btn--primary btn--small" href="#contact" data-consult="Послуга: ${service.title}">Замовити</a>
            </div>
          </article>`).join('')}
        </div>
      </div>
    </section>
    ${contactSection('Потрібен монтаж, налаштування чи сервіс')}`;
  return layout({
    title: `Послуги: монтаж, налаштування і сервіс інверторів | ${site.name}`,
    description: 'Професійне встановлення будь-якого вашого обладнання: інвертори, акумулятори, сонячні панелі. Налаштування системи і сервісне обслуговування.',
    path: SERVICES_PATH,
    body,
    graph: [storeSchema(), breadcrumbSchema(crumbs), ...SERVICES.map((service) => ({ '@type': 'Service', name: service.title, description: service.text, provider: { '@id': storeId() }, areaServed: 'UA' }))],
    assetVersion,
  });
}

function projectsListPage(projects, assetVersion) {
  const crumbs = [{ name: 'Головна', path: '/' }, { name: 'Наші роботи', path: PROJECTS_PATH }];
  const types = Object.entries(PROJECT_TYPES).filter(([type]) => projects.some((p) => p.type === type));
  const body = `
    <section class="page-head">
      <div class="container">
        ${breadcrumbs(crumbs)}
        <h1>Наші роботи: резервне живлення під ключ</h1>
        <p class="section-lead">Реальні об'єкти: що хотів клієнт, яке обладнання ми поставили і як система працює під час відключень.</p>
        ${types.length > 1 ? `
        <div class="tabs tabs--projects" role="group" aria-label="Тип об'єкта">
          <button class="tab is-active" aria-pressed="true" data-project-type="all">Усі</button>
          ${types.map(([type, label]) => `<button class="tab" aria-pressed="false" data-project-type="${type}">${label}</button>`).join('')}
        </div>` : ''}
      </div>
    </section>
    <section class="catalog catalog--page">
      <div class="container">
        ${projects.length ? `<div class="projects-grid" id="projects-grid">${projects.map(projectCard).join('')}</div>` : '<p class="note">Скоро тут з\'являться наші об\'єкти.</p>'}
      </div>
    </section>
    ${contactSection('Хочу таку ж систему, як у ваших роботах')}`;
  return layout({
    title: `Наші роботи: встановлення інверторів і батарей | ${site.name}`,
    description: 'Приклади встановлення гібридних інверторів і батарей у квартирах, будинках і ліфтах ОСББ: задача, обладнання, фото і результат.',
    path: PROJECTS_PATH,
    body,
    graph: [storeSchema(), breadcrumbSchema(crumbs), { '@type': 'CollectionPage', name: 'Наші роботи', url: absoluteUrl(PROJECTS_PATH) }, {
      '@type': 'ItemList',
      itemListElement: projects.filter((p) => !p.draft).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: absoluteUrl(projectPath(p)), name: p.title })),
    }],
    ogImage: projects[0]?.cover || site.defaultImage,
    assetVersion,
  });
}

function projectSchema(project) {
  return {
    '@type': 'Article',
    headline: project.title,
    description: project.summary,
    image: project.photos.map((photo) => (isLocalImage(photo) ? absoluteUrl(photo) : unsplashUrl(photo, 1200))),
    datePublished: `${project.date}-01`,
    author: { '@id': storeId() },
    publisher: { '@id': storeId() },
    mainEntityOfPage: absoluteUrl(projectPath(project)),
    contentLocation: { '@type': 'Place', name: project.city },
    about: project.equipment.map((item) => (item.product.custom ? { '@type': 'Product', name: item.product.name } : { '@type': 'Product', name: item.product.name, url: absoluteUrl(productPath(item.product)) })),
  };
}

function projectPage(project, projects, assetVersion) {
  const crumbs = [{ name: 'Головна', path: '/' }, { name: 'Наші роботи', path: PROJECTS_PATH }, { name: project.title, path: projectPath(project) }];
  const others = projects.filter((p) => p.id !== project.id);
  const related = [...others.filter((p) => p.type === project.type), ...others.filter((p) => p.type !== project.type)].slice(0, 3);
  const consultText = `Хочу так само, як у проєкті «${project.title}»`;
  const equipmentRows = project.equipment.map((item) => `
    <li>
      ${item.product.custom
        ? `<span>${item.qty > 1 ? `${item.qty} × ` : ''}${esc(item.product.name)}</span>`
        : `<a href="${productPath(item.product)}">${item.qty > 1 ? `${item.qty} × ` : ''}${esc(item.product.name)}</a>`}
      <span>${item.product.custom ? '' : item.product.price === null ? 'ціна за запитом' : formatPrice(item.product.price * item.qty)}</span>
    </li>`).join('');
  const body = `
    ${project.draft ? '<div class="draft-banner"><div class="container">Чернетка: приклад оформлення. Замініть на реальний об\'єкт у data/projects.json. На сайті з доменом чернетки не публікуються.</div></div>' : ''}
    <section class="case">
      <div class="container">
        ${breadcrumbs(crumbs)}
        <div class="case__head">
          <div>
            <p class="kicker">${PROJECT_TYPES[project.type]} · ${esc(project.city)} · ${formatMonth(project.date)}</p>
            <h1>${esc(project.title)}</h1>
            <p class="section-lead">${esc(project.summary)}</p>
          </div>
          <dl class="case__facts">
            <div><dt>Інвертор</dt><dd>${formatKw(project.powerKw)}</dd></div>
            <div><dt>Батареї</dt><dd>${formatKwh(project.capacityKwh)}</dd></div>
            <div><dt>Монтаж</dt><dd>${project.installDays} ${project.installDays === 1 ? 'день' : 'дні'}</dd></div>
            <div><dt>Мережа</dt><dd>${project.mountingKit === 'three' ? '3 фази' : '1 фаза'}</dd></div>
          </dl>
        </div>
        <div class="case__cover${isLocalImage(project.cover) ? ' case__cover--photo' : ''}"${isLocalImage(project.cover) ? ` style="--cover: url('${versioned(project.cover)}')"` : ''}>${picture({ photoId: project.cover, alt: project.title, widths: [800, 1400, 2000], sizes: '100vw', eager: true })}</div>
        <div class="case__body">
          <div class="case__story">
            <h2>Задача</h2>
            <p>${esc(project.task)}</p>
            <h2>Рішення</h2>
            <p>${esc(project.solution)}</p>
            <h2>Результат</h2>
            <p>${esc(project.result)}</p>
          </div>
          <aside class="case__equipment">
            <h2>Обладнання</h2>
            <ul>${equipmentRows}</ul>
            <a class="btn btn--primary btn--block" href="#contact" data-consult="${esc(consultText)}">Хочу так само</a>
          </aside>
        </div>
        ${project.photos.length > 1 ? `
        <div class="gallery">
          <h2>Фото</h2>
          <div class="gallery__grid">
            ${project.photos.map((photo, i) => `
            <button type="button" class="gallery__item" data-gallery-src="${imageUrl(photo, 1800)}" aria-label="Відкрити фото ${i + 1}">
              ${picture({ photoId: photo, alt: `${project.title}, фото ${i + 1}`, widths: [480, 800], sizes: '(max-width: 760px) 100vw, 33vw' })}
            </button>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </section>
    ${related.length ? `
    <section class="related">
      <div class="container">
        <h2>Інші роботи</h2>
        <div class="projects-grid">${related.map(projectCard).join('')}</div>
      </div>
    </section>` : ''}
    ${contactSection(consultText)}
    <dialog class="lightbox" id="lightbox"><button type="button" class="lightbox__close" data-lightbox-close aria-label="Закрити">×</button><img alt=""></dialog>`;
  return layout({
    title: `${project.title} | ${site.name}`,
    description: project.summary.slice(0, 160),
    path: projectPath(project),
    body,
    graph: [storeSchema(), breadcrumbSchema(crumbs), projectSchema(project)],
    ogType: 'article',
    ogImage: project.cover,
    noindex: Boolean(project.draft),
    assetVersion,
  });
}

module.exports = { servicesPage, SERVICES_PATH, prepareProjects, projectsListPage, projectPage, projectPath, PROJECTS_PATH, prepareCatalog, homePage, categoryPage, productPage, notFoundPage, categoryPath, productPath, absoluteUrl, CATEGORIES };
