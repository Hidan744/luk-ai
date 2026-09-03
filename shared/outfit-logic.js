/**
 * Общая логика подбора образа — используется и в браузере (js/app.js),
 * и в Telegram-боте (bot/bot.js). UMD-обёртка: в браузере вешается на
 * window.OutfitLogic, в Node отдаётся через module.exports.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OutfitLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function hexToHsl(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = 60 * (((g - b) / d) % 6); break;
        case g: h = 60 * ((b - r) / d + 2); break;
        case b: h = 60 * ((r - g) / d + 4); break;
      }
    }
    if (h < 0) h += 360;
    return { h, s, l };
  }

  function isNeutral(hsl) {
    return hsl.s < 0.15 || hsl.l < 0.13 || hsl.l > 0.92;
  }

  // 0..1 — насколько хорошо сочетаются два цвета
  function pairScore(hexA, hexB) {
    const a = hexToHsl(hexA), b = hexToHsl(hexB);
    if (isNeutral(a) || isNeutral(b)) return 0.9;
    let diff = Math.abs(a.h - b.h);
    if (diff > 180) diff = 360 - diff;
    // аналогичные (близкие) или комплементарные (~180°) оттенки — хорошо,
    // "грязная" середина (60-150°) — хуже всего
    if (diff <= 35) return 0.8;
    if (diff >= 150) return 0.75;
    if (diff >= 60 && diff < 150) return 0.35;
    return 0.55;
  }

  function outfitScore(items) {
    let total = 0, pairs = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        total += pairScore(items[i].hex, items[j].hex);
        pairs++;
      }
    }
    return pairs ? total / pairs : 0;
  }

  /**
   * wardrobe: [{type, hex, label, ...}]
   * opts: {weather: 'cold'|'mild'|'warm', occasion, topN: сколько лучших
   *        комбинаций рассмотреть для финального случайного выбора}
   * Возвращает { pick: [...items], score } либо null, если вещей мало.
   */
  function pickBestOutfit(wardrobe, opts) {
    opts = opts || {};
    const byType = t => wardrobe.filter(i => i.type === t);
    const tops = byType('top');
    const bottoms = byType('bottom');
    const outers = byType('outer');
    const shoes = byType('shoes');

    const needOuter = opts.weather === 'cold';
    const combos = [];

    const outerOptions = needOuter && outers.length ? outers : [null];

    tops.forEach(top => {
      bottoms.forEach(bottom => {
        outerOptions.forEach(outer => {
          const shoeOptions = shoes.length ? shoes : [null];
          shoeOptions.forEach(shoe => {
            const items = [top, bottom, outer, shoe].filter(Boolean);
            if (items.length < 2) return;
            combos.push({ items, score: outfitScore(items) });
          });
        });
      });
    });

    if (!combos.length) return null;

    combos.sort((a, b) => b.score - a.score);
    const topN = combos.slice(0, Math.max(1, opts.topN || 3));
    const chosenIdx = Math.floor(Math.random() * topN.length);
    const chosen = topN[chosenIdx];
    // остальные варианты из топа — показываем как альтернативы под основным луком
    chosen.alternatives = topN.filter((_, i) => i !== chosenIdx);
    return chosen;
  }

  /**
   * Ищет замену одной вещи в собранном луке, которая заметно улучшила бы
   * сочетаемость. items — уже выбранный лук (результат pickBestOutfit),
   * wardrobe — весь гардероб (источник альтернатив по тому же типу).
   * Возвращает { type, fromLabel, toLabel, fromScore, toScore } либо null,
   * если ничего заметно лучше не нашлось — тогда лук можно просто подтвердить.
   */
  function suggestSwap(items, wardrobe, currentScore) {
    const IMPROVEMENT_THRESHOLD = 0.1;
    let best = null;

    items.forEach((item, idx) => {
      const alternatives = wardrobe.filter(w => w.type === item.type && w !== item);
      alternatives.forEach(alt => {
        const trial = items.slice();
        trial[idx] = alt;
        const score = outfitScore(trial);
        if (score > currentScore + IMPROVEMENT_THRESHOLD && (!best || score > best.toScore)) {
          best = { type: item.type, fromLabel: item.label, toLabel: alt.label, fromScore: currentScore, toScore: score };
        }
      });
    });

    return best;
  }

  const TYPE_NAMES_RU = { top: 'верх', bottom: 'низ', outer: 'верхняя одежда', shoes: 'обувь' };

  /**
   * Реальный анализ ВСЕГО гардероба (а не одного собранного лука):
   * чего не хватает по типам, есть ли хоть одна нейтральная вещь, нет ли
   * явного перекоса ("4 верха и 1 низ") или дублирующих по цвету вещей,
   * и какая в среднем сочетаемость по гардеробу. Возвращает список
   * находок (findings) вместо дежурного "всё ок".
   */
  function analyzeWardrobe(wardrobe) {
    if (!wardrobe || wardrobe.length < 2) {
      return { findings: [{ type: 'info', text: 'Добавь хотя бы 2 вещи, чтобы получить анализ гардероба.' }], avgScore: null, counts: {} };
    }

    const types = Object.keys(TYPE_NAMES_RU);
    const counts = {};
    types.forEach(t => { counts[t] = wardrobe.filter(i => i.type === t).length; });
    const findings = [];

    const missing = types.filter(t => counts[t] === 0);
    if (missing.length) {
      findings.push({ type: 'warn', text: `В гардеробе совсем нет: ${missing.map(t => TYPE_NAMES_RU[t]).join(', ')} — без этого ни один образ не будет полным.` });
    }

    const hasNeutral = wardrobe.some(i => isNeutral(hexToHsl(i.hex)));
    if (!hasNeutral) {
      findings.push({ type: 'warn', text: 'В гардеробе нет ни одной нейтральной вещи (чёрной/белой/серой/бежевой) — такие вещи сочетаются почти со всем, без них образам сложнее выглядеть собранными.' });
    }

    const presentCounts = types.map(t => counts[t]).filter(c => c > 0);
    const maxCount = presentCounts.length ? Math.max(...presentCounts) : 0;
    types.forEach(t => {
      if (counts[t] === 1 && maxCount >= 3) {
        findings.push({ type: 'tip', text: `Только одна вещь в категории «${TYPE_NAMES_RU[t]}» — почти все образы будут повторять её. Стоит добавить ещё.` });
      }
    });

    types.forEach(t => {
      const items = wardrobe.filter(i => i.type === t);
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = hexToHsl(items[i].hex), b = hexToHsl(items[j].hex);
          let diff = Math.abs(a.h - b.h);
          if (diff > 180) diff = 360 - diff;
          if (!isNeutral(a) && !isNeutral(b) && diff < 12 && Math.abs(a.l - b.l) < 0.1) {
            findings.push({ type: 'tip', text: `«${items[i].label}» и «${items[j].label}» почти одного цвета — по сути дублируют друг друга в подборе.` });
          }
        }
      }
    });

    let total = 0, pairs = 0;
    for (let i = 0; i < wardrobe.length; i++) {
      for (let j = i + 1; j < wardrobe.length; j++) {
        if (wardrobe[i].type === wardrobe[j].type) continue;
        total += pairScore(wardrobe[i].hex, wardrobe[j].hex);
        pairs++;
      }
    }
    const avgScore = pairs ? total / pairs : null;

    if (avgScore !== null && avgScore < 0.55 && !findings.length) {
      findings.push({ type: 'warn', text: 'В среднем вещи гардероба сочетаются слабо — добавь более нейтральные вещи (чёрный/белый/серый/бежевый), они выручат почти в любом сочетании.' });
    }

    if (!findings.length) {
      findings.push({ type: 'ok', text: `Гардероб сбалансирован — вещи хорошо сочетаются между собой (в среднем ${Math.round((avgScore || 0.8) * 100)}%).` });
    }

    return { findings, avgScore, counts };
  }

  return { hexToHsl, isNeutral, pairScore, outfitScore, pickBestOutfit, suggestSwap, analyzeWardrobe };
});
