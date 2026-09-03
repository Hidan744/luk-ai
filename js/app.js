const STORAGE_KEY = 'luk-ai-wardrobe-v1';

const wardrobeGrid = document.getElementById('wardrobeGrid');
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const quickAdd = document.getElementById('quickAdd');
const genBtn = document.getElementById('genBtn');
const resultBox = document.getElementById('resultBox');
const resultItems = document.getElementById('resultItems');
const resultNote = document.getElementById('resultNote');
const autoWeatherBtn = document.getElementById('autoWeatherBtn');
const weatherStatus = document.getElementById('weatherStatus');
const heroLookCard = document.getElementById('heroLookCard');
const heroTemp = document.getElementById('heroTemp');
const heroMatch = document.getElementById('heroMatch');

const colorMap = {
  tangerine: { hex: '#eb7d00', name: 'Оранжевый' },
  vanilla: { hex: '#ebe3a7', name: 'Ванильный' },
  green: { hex: '#2c5745', name: 'Зелёный' },
  brown: { hex: '#2e2910', name: 'Тёмно-коричневый' },
  rust: { hex: '#b8630a', name: 'Терракотовый' }
};
const typeLabel = { top: 'Верх', bottom: 'Низ', outer: 'Верхняя одежда', shoes: 'Обувь' };

function loadWardrobe() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveWardrobe() {
  try {
    // не сохраняем blob-URL картинок — они умирают между сессиями,
    // сохраняем только то, что нужно для подбора и рендера подписи
    const serializable = wardrobe.map(({ img, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch (e) { /* localStorage недоступен — просто не сохраняем */ }
}

let wardrobe = loadWardrobe();

function renderWardrobe() {
  if (wardrobe.length === 0) {
    wardrobeGrid.innerHTML = '<div class="wardrobe-empty">Гардероб пуст — добавь пару вещей выше</div>';
    return;
  }
  wardrobeGrid.innerHTML = wardrobe.map((item, i) => `
    <div class="wardrobe-item" style="${item.img ? '' : `background:${item.hex}22; border-color:${item.hex}55;`}">
      ${item.img ? `<img src="${item.img}" alt="${item.label}">` : `<span>${item.label}</span>`}
      <div class="color-dot" style="background:${item.hex}" title="${item.label}"></div>
      <div class="remove-x" data-i="${i}">✕</div>
    </div>
  `).join('');
}

function addItem(item) {
  wardrobe.push(item);
  renderWardrobe();
  saveWardrobe();
}

quickAdd.addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-btn');
  if (!btn) return;
  const color = colorMap[btn.dataset.color];
  addItem({
    type: btn.dataset.type,
    hex: color.hex,
    label: btn.textContent.replace('+ ', ''),
    img: null
  });
});

uploadZone.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const types = ['top', 'bottom', 'outer', 'shoes'];
  const type = types[wardrobe.length % types.length];

  const img = new Image();
  img.onload = () => {
    const hex = extractDominantColor(img);
    addItem({ type, hex, label: file.name, img: url });
  };
  img.onerror = () => {
    addItem({ type, hex: '#888888', label: file.name, img: url });
  };
  img.src = url;

  fileInput.value = '';
});

// Уменьшаем фото на маленький canvas и берём средний цвет по пикселям —
// быстрый способ вытащить доминантный оттенок вещи без внешних API.
function extractDominantColor(img) {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);

  let r = 0, g = 0, b = 0, n = 0;
  try {
    const data = ctx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < data.length; i += 4) {
      // отбрасываем почти прозрачные пиксели, если есть альфа-канал
      if (data[i + 3] < 32) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      n++;
    }
  } catch (e) {
    // canvas могли "испачкать" (CORS) — тогда просто серый по умолчанию
    return '#888888';
  }
  if (!n) return '#888888';
  r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

wardrobeGrid.addEventListener('click', (e) => {
  const x = e.target.closest('.remove-x');
  if (!x) return;
  wardrobe.splice(Number(x.dataset.i), 1);
  renderWardrobe();
  saveWardrobe();
});

function setupPicker(id) {
  const el = document.getElementById(id);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    el.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}
setupPicker('occasionPicker');
setupPicker('weatherPicker');

const occasionNotes = {
  work: 'Сдержанное сочетание для офиса — ничего кричащего, всё по делу.',
  date: 'Что-то более выразительное — образ, который запомнят.',
  walk: 'Удобно и просто — на случай, если день окажется длинным.',
  event: 'Собранный образ для важного случая — без права на ошибку.'
};
const weatherNotes = {
  cold: 'Учли, что на улице холодно — добавили верхнюю одежду в приоритет.',
  mild: 'Прохладно, но не критично — хватит лёгкой прослойки.',
  warm: 'Тепло — верхняя одежда сегодня не нужна.'
};

function weatherBucket(tempC) {
  if (tempC <= 8) return 'cold';
  if (tempC <= 17) return 'mild';
  return 'warm';
}

autoWeatherBtn.addEventListener('click', async () => {
  if (!navigator.geolocation) {
    weatherStatus.textContent = 'Геолокация недоступна в этом браузере';
    return;
  }
  weatherStatus.textContent = 'Определяю местоположение…';
  autoWeatherBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      weatherStatus.textContent = 'Запрашиваю погоду…';
      const { latitude, longitude } = pos.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('weather api error');
      const data = await res.json();
      const temp = data.current.temperature_2m;
      const bucket = weatherBucket(temp);

      document.querySelectorAll('#weatherPicker .tag-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.weather === bucket);
      });
      weatherStatus.textContent = `Сейчас у вас ${Math.round(temp)}°C — учли в подборе`;
    } catch (err) {
      weatherStatus.textContent = 'Не получилось узнать погоду, выбери вручную';
    } finally {
      autoWeatherBtn.disabled = false;
    }
  }, () => {
    weatherStatus.textContent = 'Доступ к геолокации не дан, выбери погоду вручную';
    autoWeatherBtn.disabled = false;
  }, { timeout: 8000 });
});

genBtn.addEventListener('click', () => {
  if (wardrobe.length < 2) {
    resultBox.classList.add('show');
    resultItems.innerHTML = '<div class="result-item"><span>Добавь хотя бы 2 вещи в гардероб, чтобы собрать лук 👕</span></div>';
    resultNote.textContent = '';
    return;
  }

  const occasion = document.querySelector('#occasionPicker .active').dataset.occ;
  const weather = document.querySelector('#weatherPicker .active').dataset.weather;

  const result = OutfitLogic.pickBestOutfit(wardrobe, { weather, occasion });
  let pick = result ? result.items : wardrobe.slice(0, Math.min(3, wardrobe.length));

  resultItems.innerHTML = pick.map(item => `
    <div class="result-item">
      <div class="dot" style="background:${item.hex}"></div>
      <span>${typeLabel[item.type] || 'Вещь'}: ${item.label}</span>
    </div>
  `).join('');

  const matchNote = result && result.score >= 0.75
    ? ' Цвета хорошо сочетаются между собой.'
    : result && result.score < 0.5
      ? ' Сочетание неидеальное — маловато вещей на выбор для этого повода.'
      : '';

  resultNote.textContent = `${occasionNotes[occasion]} ${weatherNotes[weather]}${matchNote}`;
  resultBox.classList.add('show');
});

// Затемняем hex на заданную долю — для градиента карточки в hero-блоке.
function darken(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function renderHeroLook(items, tempC, score) {
  const rows = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));

  heroLookCard.innerHTML = rows.map(row => `
    <div class="look-row${row.length === 1 ? ' single' : ''}">
      ${row.map(item => {
        const isLight = OutfitLogic.hexToHsl(item.hex).l > 0.6;
        const textColor = isLight ? '#141009' : 'rgba(255,255,255,.75)';
        return `<div class="swatch" style="background:linear-gradient(160deg,${item.hex},${darken(item.hex, 0.18)}); color:${textColor};">${item.label}</div>`;
      }).join('')}
    </div>
  `).join('');

  heroTemp.textContent = `${tempC >= 0 ? '+' : ''}${Math.round(tempC)}°`;
  heroMatch.textContent = `${Math.round(score * 100)}%`;
}

// Автообновление карточки "Сегодняшний лук" в hero — только для вернувшихся
// посетителей: нужен сохранённый гардероб (localStorage) и УЖЕ выданное
// ранее разрешение на геолокацию. Разрешение мы сами не запрашиваем —
// это было бы навязчиво для человека, который зашёл впервые.
async function tryAutoHeroLook() {
  if (wardrobe.length < 2) return;
  if (!navigator.permissions || !navigator.geolocation) return;

  let permissionState;
  try {
    permissionState = (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch (e) {
    return; // Permissions API недоступен в этом браузере — оставляем статичный пример
  }
  if (permissionState !== 'granted') return;

  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const { latitude, longitude } = pos.coords;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const tempC = data.current.temperature_2m;
      const weather = weatherBucket(tempC);
      const occasion = document.querySelector('#occasionPicker .active').dataset.occ;

      const result = OutfitLogic.pickBestOutfit(wardrobe, { weather, occasion });
      if (!result) return;
      renderHeroLook(result.items, tempC, result.score);
    } catch (e) { /* тихо оставляем статичный пример */ }
  }, () => { /* доступ отозван между визитами — оставляем статичный пример */ }, { timeout: 8000 });
}

renderWardrobe();
tryAutoHeroLook();
