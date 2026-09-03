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

  return { hexToHsl, isNeutral, pairScore, outfitScore, pickBestOutfit, suggestSwap };
});
