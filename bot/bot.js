// Telegram-бот ЛУК.AI — та же логика подбора образа, что на сайте.
// Не запускается сам по себе: нужен токен от @BotFather в переменной
// окружения TELEGRAM_BOT_TOKEN (см. README в этой папке).

const TelegramBot = require('node-telegram-bot-api');
const Jimp = require('jimp');
const OutfitLogic = require('../shared/outfit-logic');
const { getWardrobe, addWardrobeItem, deleteWardrobeItem, ensureUser } = require('../server/db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Не задан TELEGRAM_BOT_TOKEN. Получи токен у @BotFather и запусти:');
  console.error('  TELEGRAM_BOT_TOKEN=xxxxx node bot.js');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

const colorPresets = {
  lime: { hex: '#d4ff3f', name: 'Лаймовый' },
  white: { hex: '#f0f0e8', name: 'Белый' },
  dark: { hex: '#3a3a52', name: 'Тёмно-синий' },
  black: { hex: '#1c1c1c', name: 'Чёрный' },
  olive: { hex: '#5c5c3a', name: 'Оливковый' }
};
const typeLabels = { top: 'Верх', bottom: 'Низ', outer: 'Верхняя одежда', shoes: 'Обувь' };
const occasionLabels = { work: '💼 Работа', date: '🌙 Свидание', walk: '🚶 Прогулка', event: '✨ Важная встреча' };
const weatherLabels = { cold: '❄️ Холодно', mild: '🌤 Прохладно', warm: '☀️ Тепло' };

// pending add-flow состояние по chatId: { type, hex, awaitingLabel }
const sessions = new Map();

function typeKeyboard(prefix) {
  return {
    inline_keyboard: [Object.entries(typeLabels).map(([key, label]) => ({
      text: label, callback_data: `${prefix}:${key}`
    }))]
  };
}

function colorKeyboard() {
  return {
    inline_keyboard: [Object.entries(colorPresets).map(([key, c]) => ({
      text: c.name, callback_data: `color:${key}`
    }))]
  };
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Привет! Я ЛУК.AI — помогу собрать образ из твоего гардероба.\n\n' +
    '/add — добавить вещь (фото или готовый цвет)\n' +
    '/wardrobe — показать гардероб\n' +
    '/look — подобрать образ\n' +
    '/remove <id> — удалить вещь'
  );
});

bot.onText(/\/add/, (msg) => {
  sessions.set(msg.chat.id, {});
  bot.sendMessage(msg.chat.id, 'Что добавляем?', { reply_markup: typeKeyboard('type') });
});

bot.onText(/\/wardrobe/, (msg) => {
  const chatId = msg.chat.id;
  const items = getWardrobe(String(chatId));
  if (!items.length) {
    return bot.sendMessage(chatId, 'Гардероб пуст — добавь вещи через /add');
  }
  const text = items.map(i => `#${i.id} · ${typeLabels[i.type] || i.type} · ${i.label} (${i.hex})`).join('\n');
  bot.sendMessage(chatId, text);
});

bot.onText(/\/remove (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const ok = deleteWardrobeItem(String(chatId), Number(match[1]));
  bot.sendMessage(chatId, ok ? 'Удалено.' : 'Вещь с таким номером не найдена.');
});

bot.onText(/\/look/, (msg) => {
  const chatId = msg.chat.id;
  sessions.set(chatId, { flow: 'look' });
  bot.sendMessage(chatId, 'Какой повод?', {
    reply_markup: {
      inline_keyboard: [Object.entries(occasionLabels).map(([key, label]) => ({
        text: label, callback_data: `occ:${key}`
      }))]
    }
  });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const [kind, value] = query.data.split(':');
  const session = sessions.get(chatId) || {};

  if (kind === 'type') {
    session.type = value;
    sessions.set(chatId, session);
    await bot.sendMessage(chatId,
      `Тип: ${typeLabels[value]}. Пришли фото вещи (я определю цвет сам) или выбери готовый цвет:`,
      { reply_markup: colorKeyboard() }
    );
  }

  if (kind === 'color') {
    session.hex = colorPresets[value].hex;
    session.awaitingLabel = true;
    sessions.set(chatId, session);
    await bot.sendMessage(chatId, 'Как назовём вещь? Просто напиши название сообщением.');
  }

  if (kind === 'occ') {
    session.occasion = value;
    sessions.set(chatId, session);
    await bot.sendMessage(chatId, 'Погода?', {
      reply_markup: {
        inline_keyboard: [Object.entries(weatherLabels).map(([key, label]) => ({
          text: label, callback_data: `weather:${key}`
        }))]
      }
    });
  }

  if (kind === 'weather') {
    session.weather = value;
    const wardrobe = getWardrobe(String(chatId));
    const result = OutfitLogic.pickBestOutfit(wardrobe, { weather: session.weather, occasion: session.occasion });
    if (!result) {
      await bot.sendMessage(chatId, 'В гардеробе маловато вещей — добавь ещё через /add');
    } else {
      const lines = result.items.map(i => `${typeLabels[i.type]}: ${i.label}`).join('\n');
      await bot.sendMessage(chatId, `Готовый лук:\n${lines}\n\nСочетаемость: ${Math.round(result.score * 100)}%`);
    }
    sessions.delete(chatId);
  }

  bot.answerCallbackQuery(query.id);
});

// Фото вещи — вычисляем средний цвет через Jimp (чистый JS, без нативных
// зависимостей) и просим название.
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  if (!session || !session.type) {
    return bot.sendMessage(chatId, 'Сначала выбери тип вещи: /add');
  }
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const fileLink = await bot.getFileLink(fileId);

  try {
    const image = await Jimp.read(fileLink);
    image.resize(32, 32);
    let r = 0, g = 0, b = 0, n = 0;
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
      r += this.bitmap.data[idx]; g += this.bitmap.data[idx + 1]; b += this.bitmap.data[idx + 2];
      n++;
    });
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    session.hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    session.awaitingLabel = true;
    sessions.set(chatId, session);
    await bot.sendMessage(chatId, `Цвет определён (${session.hex}). Как назовём вещь?`);
  } catch (e) {
    await bot.sendMessage(chatId, 'Не получилось обработать фото, попробуй ещё раз или выбери готовый цвет.');
  }
});

bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return; // команды обрабатываются выше
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  if (!session || !session.awaitingLabel || !msg.text) return;

  ensureUser(String(chatId));
  addWardrobeItem(String(chatId), { type: session.type, hex: session.hex, label: msg.text.trim() });
  bot.sendMessage(chatId, `Добавлено: ${msg.text.trim()} (${typeLabels[session.type]}). Ещё? /add · Гардероб: /wardrobe`);
  sessions.delete(chatId);
});

console.log('ЛУК.AI Telegram-бот запущен (long polling)');
