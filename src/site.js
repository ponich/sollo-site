const port = process.env.PORT || 3000;

const url = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

module.exports = {
  url,
  noindexAll: process.env.SITE_NOINDEX === '1',
  showDrafts:process.env.SHOW_DRAFTS ? process.env.SHOW_DRAFTS === '1' : /\/\/(localhost|127\.0\.0\.1)\b/.test(url),
  name: 'Світло ON',
  legalName: 'Світло ON',
  tagline: 'Гібридні інвертори та акумулятори',
  phone: '+380935122649',
  phoneLabel: '+38 (093) 512-26-49',
  phone2: '+380965122649',
  phone2Label: '+38 (096) 512-26-49',
  telegram: 'Svitlo_one',
  telegramLabel: '@Svitlo_one',
  workingHours: 'Пн–Сб, 9:00–20:00',
  openingHours: { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '20:00' },
  city: 'Київ',
  region: 'Київська область',
  country: 'UA',
  priceRange: '₴₴',
  pricing: {
    mountingKit: { single: 5000, three: 63000 },
    installation: 10000,
  },
  minHomeInverterKw: 6,
  defaultImage: 'photo-1704040686510-b747ff423ebb',
  heroImage: 'photo-1704040686510-b747ff423ebb',
};
