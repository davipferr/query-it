const STORAGE_KEY = 'queryit.settings';

const DEFAULTS = {
  dbType: 'postgres',
  connectionString: '',
  proxyUrl: 'https://queryit-proxy.vercel.app/api/query',
};

export function getSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function initSettingsUI({ onSave } = {}) {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('open-settings');
  const closeBtn = document.getElementById('close-settings');
  const form = document.getElementById('settings-form');
  const dbTypeEl = document.getElementById('setting-db-type');
  const connEl = document.getElementById('setting-connection-string');
  const proxyEl = document.getElementById('setting-proxy-url');

  function load() {
    const s = getSettings();
    dbTypeEl.value = s.dbType;
    connEl.value = s.connectionString;
    proxyEl.value = s.proxyUrl;
  }

  function open() {
    load();
    modal.classList.remove('hidden');
  }

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
      dbType: dbTypeEl.value,
      connectionString: connEl.value.trim(),
      proxyUrl: proxyEl.value.trim(),
    };
    saveSettings(settings);
    modal.classList.add('hidden');
    onSave?.(settings);
  });

  load();
  return { open };
}
