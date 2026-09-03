const wardrobe = [];
  const wardrobeGrid = document.getElementById('wardrobeGrid');
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const quickAdd = document.getElementById('quickAdd');
  const genBtn = document.getElementById('genBtn');
  const resultBox = document.getElementById('resultBox');
  const resultItems = document.getElementById('resultItems');
  const resultNote = document.getElementById('resultNote');

  const colorMap = {
    lime:{hex:'#d4ff3f', name:'Лаймовый'},
    white:{hex:'#f0f0e8', name:'Белый'},
    dark:{hex:'#3a3a52', name:'Тёмно-синий'},
    black:{hex:'#1c1c1c', name:'Чёрный'},
    olive:{hex:'#5c5c3a', name:'Оливковый'},
    photo:{hex:'#888', name:'Своя вещь'}
  };
  const typeLabel = {top:'Верх', bottom:'Низ', outer:'Верхняя одежда', shoes:'Обувь'};

  function renderWardrobe(){
    if(wardrobe.length === 0){
      wardrobeGrid.innerHTML = '<div class="wardrobe-empty">Гардероб пуст — добавь пару вещей выше</div>';
      return;
    }
    wardrobeGrid.innerHTML = wardrobe.map((item, i) => `
      <div class="wardrobe-item" style="${item.img ? '' : `background:${colorMap[item.color].hex}22; border-color:${colorMap[item.color].hex}55;`}">
        ${item.img ? `<img src="${item.img}" alt="${item.label}">` : `<span>${item.label}</span>`}
        <div class="remove-x" data-i="${i}">✕</div>
      </div>
    `).join('');
  }

  function addItem(item){
    wardrobe.push(item);
    renderWardrobe();
  }

  quickAdd.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-btn');
    if(!btn) return;
    addItem({
      type: btn.dataset.type,
      color: btn.dataset.color,
      label: btn.textContent.replace('+ ', ''),
      img: null
    });
  });

  uploadZone.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    const types = ['top','bottom','outer','shoes'];
    const type = types[wardrobe.length % types.length];
    addItem({ type, color:'photo', label:file.name, img:url });
    fileInput.value = '';
  });

  wardrobeGrid.addEventListener('click', (e) => {
    const x = e.target.closest('.remove-x');
    if(!x) return;
    wardrobe.splice(Number(x.dataset.i), 1);
    renderWardrobe();
  });

  function setupPicker(id, attr){
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.tag-btn');
      if(!btn) return;
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

  genBtn.addEventListener('click', () => {
    if(wardrobe.length < 2){
      resultBox.classList.add('show');
      resultItems.innerHTML = '<div class="result-item"><span>Добавь хотя бы 2 вещи в гардероб, чтобы собрать лук 👕</span></div>';
      resultNote.textContent = '';
      return;
    }

    const occasion = document.querySelector('#occasionPicker .active').dataset.occ;
    const weather = document.querySelector('#weatherPicker .active').dataset.weather;

    const byType = t => wardrobe.filter(i => i.type === t);
    let pick = [];
    const top = byType('top'); const bottom = byType('bottom');
    const outer = byType('outer'); const shoes = byType('shoes');

    if(top.length) pick.push(top[Math.floor(Math.random()*top.length)]);
    if(bottom.length) pick.push(bottom[Math.floor(Math.random()*bottom.length)]);
    if(weather === 'cold' && outer.length) pick.push(outer[Math.floor(Math.random()*outer.length)]);
    if(shoes.length) pick.push(shoes[Math.floor(Math.random()*shoes.length)]);

    if(pick.length === 0){
      pick = wardrobe.slice(0, Math.min(3, wardrobe.length));
    }

    resultItems.innerHTML = pick.map(item => `
      <div class="result-item">
        <div class="dot" style="background:${item.img ? '#d4ff3f' : colorMap[item.color].hex}"></div>
        <span>${typeLabel[item.type] || 'Вещь'}: ${item.label}</span>
      </div>
    `).join('');

    resultNote.textContent = `${occasionNotes[occasion]} ${weatherNotes[weather]}`;
    resultBox.classList.add('show');
  });
