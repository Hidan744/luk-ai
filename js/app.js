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
const shoppingSuggest = document.getElementById('shoppingSuggest');
const uploadTypePicker = document.getElementById('uploadTypePicker');
const resultAdvice = document.getElementById('resultAdvice');

const colorMap = {
  tangerine: { hex: '#eb7d00', name: 'Оранжевый' },
  vanilla: { hex: '#ebe3a7', name: 'Ванильный' },
  green: { hex: '#2c5745', name: 'Зелёный' },
  brown: { hex: '#2e2910', name: 'Тёмно-коричневый' },
  rust: { hex: '#b8630a', name: 'Терракотовый' }
};
const typeLabel = { top: 'Верх', bottom: 'Низ', outer: 'Верхняя одежда', shoes: 'Обувь' };
const shopQuery = { top: 'свитер', bottom: 'джинсы', outer: 'куртка', shoes: 'кроссовки' };
const marketplaces = [
  { id: 'wb', name: 'Wildberries', url: q => `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(q)}` },
  { id: 'ozon', name: 'Ozon', url: q => `https://www.ozon.ru/search/?text=${encodeURIComponent(q)}` }
];
const MARKETPLACE_PREF_KEY = 'luk-ai-marketplace-pref-v1';

function loadMarketplacePref() {
  try {
    const raw = localStorage.getItem(MARKETPLACE_PREF_KEY);
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.length ? ids : marketplaces.map(m => m.id);
  } catch (e) {
    return marketplaces.map(m => m.id);
  }
}

let marketplacePref = loadMarketplacePref();

function saveMarketplacePref() {
  try { localStorage.setItem(MARKETPLACE_PREF_KEY, JSON.stringify(marketplacePref)); } catch (e) { /* нет доступа к localStorage */ }
}

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
  } else {
    wardrobeGrid.innerHTML = wardrobe.map((item, i) => `
      <div class="wardrobe-item" style="${item.img ? '' : `background:${item.hex}22; border-color:${item.hex}55;`}">
        ${item.img ? `<img src="${item.img}" alt="${item.label}">` : `<span>${item.label}</span>`}
        <div class="color-dot" style="background:${item.hex}" title="${item.label}"></div>
        <div class="remove-x" data-i="${i}">✕</div>
      </div>
    `).join('');
  }
  renderShoppingSuggest();
}

// Настоящие рабочие ссылки на поиск по маркетплейсам (без партнёрского API,
// живых цен и картинок — просто честная выдача по клику) для типов вещей,
// которых в гардеробе нет вообще: это и есть "чего докупить".
function renderShoppingSuggest() {
  const missingTypes = Object.keys(typeLabel).filter(t => !wardrobe.some(i => i.type === t));
  if (!missingTypes.length) {
    shoppingSuggest.innerHTML = '';
    return;
  }
  const activeMarketplaces = marketplaces.filter(m => marketplacePref.includes(m.id));
  const shownMarketplaces = activeMarketplaces.length ? activeMarketplaces : marketplaces;

  shoppingSuggest.innerHTML = `
    <div class="shopping-suggest-title">Чего не хватает в гардеробе</div>
    <div class="shopping-pref">
      <span>Где искать:</span>
      ${marketplaces.map(m => `
        <button class="pref-btn${marketplacePref.includes(m.id) ? ' active' : ''}" data-market="${m.id}">${m.name}</button>
      `).join('')}
    </div>
    ${missingTypes.map(type => `
      <div class="shopping-row">
        <span class="type-label">${typeLabel[type]}</span>
        ${shownMarketplaces.map(m => `<a class="shopping-link" href="${m.url(shopQuery[type])}" target="_blank" rel="noopener">${m.name} →</a>`).join('')}
      </div>
    `).join('')}
  `;
}

shoppingSuggest.addEventListener('click', (e) => {
  const btn = e.target.closest('.pref-btn');
  if (!btn) return;
  const id = btn.dataset.market;
  if (marketplacePref.includes(id)) {
    // хотя бы один маркетплейс должен оставаться выбранным
    if (marketplacePref.length > 1) marketplacePref = marketplacePref.filter(m => m !== id);
  } else {
    marketplacePref = [...marketplacePref, id];
  }
  saveMarketplacePref();
  renderShoppingSuggest();
});

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

// Клик по label с вложенным input[type=file] и так нативно открывает
// выбор файла — руками дёргать fileInput.click() не нужно (а если делать
// это через preventDefault() + click(), диалог в части браузеров вообще
// не открывается, из-за чего кнопка выглядела нерабочей).

// Тип вещи раньше угадывался вслепую (по счётчику добавленных вещей) —
// после загрузки фото спрашиваем пользователя явно, чтобы вещь попала
// в правильную категорию (верх/низ/верхняя одежда/обувь).
let pendingUpload = null;

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);

  const img = new Image();
  img.onload = () => {
    pendingUpload = { hex: extractDominantColor(img), img: url, label: file.name };
    uploadTypePicker.hidden = false;
    uploadTypePicker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  img.onerror = () => {
    pendingUpload = { hex: '#888888', img: url, label: file.name };
    uploadTypePicker.hidden = false;
  };
  img.src = url;

  fileInput.value = '';
});

uploadTypePicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-btn');
  if (!btn || !pendingUpload) return;
  addItem({ type: btn.dataset.type, hex: pendingUpload.hex, label: pendingUpload.label, img: pendingUpload.img });
  pendingUpload = null;
  uploadTypePicker.hidden = true;
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
    resultAdvice.hidden = true;
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

  // Совет: либо предлагаем конкретную замену, которая заметно улучшит
  // сочетаемость, либо явно подтверждаем, что менять ничего не нужно.
  if (result) {
    const swap = OutfitLogic.suggestSwap(result.items, wardrobe, result.score);
    if (swap) {
      resultAdvice.className = 'result-advice suggest';
      resultAdvice.innerHTML = `💡 <span>Совет: замени «${swap.fromLabel}» на «${swap.toLabel}» — сочетание станет лучше (${Math.round(swap.fromScore * 100)}% → ${Math.round(swap.toScore * 100)}%).</span>`;
    } else {
      resultAdvice.className = 'result-advice confirm';
      resultAdvice.innerHTML = `✅ <span>Этот выбор хорош — можно ничего не менять.</span>`;
    }
    resultAdvice.hidden = false;
  } else {
    resultAdvice.hidden = true;
  }

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

function setHeroTemp(tempC) {
  heroTemp.textContent = `${tempC >= 0 ? '+' : ''}${Math.round(tempC)}°`;
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

  setHeroTemp(tempC);
  heroMatch.textContent = `${Math.round(score * 100)}%`;
}

async function fetchTemperature(latitude, longitude) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather api error');
  const data = await res.json();
  return data.current.temperature_2m;
}

// Температуру в hero обновляем всегда, как только известна погода.
// Сами свотчи (реальный лук вместо иллюстративного примера) пересобираем,
// только если в гардеробе достаточно вещей — иначе считать не из чего,
// но цифра температуры всё равно должна быть настоящей, а не примером.
function updateHeroForTemp(tempC) {
  const weather = weatherBucket(tempC);
  document.querySelectorAll('#weatherPicker .tag-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.weather === weather);
  });

  if (wardrobe.length < 2) {
    setHeroTemp(tempC);
    return false;
  }
  const occasion = document.querySelector('#occasionPicker .active').dataset.occ;
  const result = OutfitLogic.pickBestOutfit(wardrobe, { weather, occasion });
  if (!result) {
    setHeroTemp(tempC);
    return false;
  }
  renderHeroLook(result.items, tempC, result.score);
  return true;
}

const HERO_POLL_INTERVAL_MS = 10 * 60 * 1000; // раз в 10 минут — чаще реальная погода и не меняется
const HERO_TEMP_CHANGE_THRESHOLD = 3; // °C — при таком сдвиге пересобираем лук

// Сайт сам спрашивает геолокацию при заходе (браузер покажет свой стандартный
// запрос доступа), чтобы hero сразу показывал настоящую температуру вместо
// иллюстративного примера "+18°". Если гардероб уже достаточно большой —
// заодно пересобирается и сам лук. Пока страница открыта, погода
// перепроверяется раз в HERO_POLL_INTERVAL_MS, и лук пересобирается заново,
// если температура сдвинулась на HERO_TEMP_CHANGE_THRESHOLD градусов и больше.
function initHeroWeather() {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    let lastTemp = null;

    fetchTemperature(latitude, longitude)
      .then(tempC => { updateHeroForTemp(tempC); lastTemp = tempC; })
      .catch(() => { /* не удалось получить погоду — оставляем статичный пример */ });

    setInterval(() => {
      fetchTemperature(latitude, longitude)
        .then(tempC => {
          if (lastTemp === null || Math.abs(tempC - lastTemp) >= HERO_TEMP_CHANGE_THRESHOLD) {
            updateHeroForTemp(tempC);
            lastTemp = tempC;
          }
        })
        .catch(() => { /* попробуем на следующем тике */ });
    }, HERO_POLL_INTERVAL_MS);
  }, () => { /* доступ к геолокации не дан — оставляем статичный пример */ }, { timeout: 8000 });
}

// Бегущая строка должна быть бесшовной на любой ширине экрана. В разметке
// лежит одна группа фраз; здесь она измеряется и повторяется столько раз,
// чтобы половина дорожки была шире контейнера — тогда стык между повторами
// никогда не попадает в видимую область. Скорость (px/сек) не зависит от
// того, сколько раз пришлось повторить, поэтому бег выглядит одинаково
// что на телефоне, что на широком мониторе.
function setupMarquee() {
  const wrap = document.querySelector('.marquee');
  const track = document.querySelector('.marquee-track');
  if (!wrap || !track) return;

  const items = Array.from(track.querySelectorAll('span')).map(s => s.textContent);
  const uniqueCount = new Set(items).size || items.length;
  const groupHTML = items.slice(0, uniqueCount).map(t => `<span>${t}</span>`).join('');

  track.innerHTML = groupHTML;
  const groupWidth = track.scrollWidth || 1;
  const containerWidth = wrap.clientWidth || 1;
  const repeats = Math.max(2, Math.ceil((containerWidth * 1.3) / groupWidth));

  const halfHTML = groupHTML.repeat(repeats);
  track.innerHTML = halfHTML + halfHTML;

  const halfWidth = track.scrollWidth / 2;
  const PX_PER_SECOND = 50;
  track.style.animationDuration = `${(halfWidth / PX_PER_SECOND).toFixed(1)}s`;
}
setupMarquee();
window.addEventListener('resize', () => {
  clearTimeout(window.__marqueeResizeTimer);
  window.__marqueeResizeTimer = setTimeout(setupMarquee, 200);
});

renderWardrobe();
initHeroWeather();
