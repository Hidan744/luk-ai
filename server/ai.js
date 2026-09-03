// Реальный ИИ-анализ фото вещей и гардероба через Claude (vision +
// структурированный JSON-ответ). Требует ANTHROPIC_API_KEY в окружении —
// без ключа этот модуль сообщает "недоступен", а не падает, чтобы сайт
// продолжал работать на обычном определении цвета через canvas.

const AI_MODEL = 'claude-opus-5';

function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const Anthropic = require('@anthropic-ai/sdk');
let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['top', 'bottom', 'outer', 'shoes'] },
    colorName: { type: 'string', description: 'Название цвета по-русски, например "пудрово-розовый"' },
    colorHex: { type: 'string', description: 'HEX-код доминирующего цвета вещи, например #e8c4b8' },
    notes: { type: 'string', description: 'Короткая заметка стилиста об этой вещи: материал, стиль, для чего подходит — 1 предложение по-русски' }
  },
  required: ['type', 'colorName', 'colorHex', 'notes'],
  additionalProperties: false
};

// Анализирует одно фото вещи: определяет тип, точный цвет и даёт короткую
// заметку стилиста — вместо угадывания типа пользователем и грубого
// усреднения цвета по пикселям.
async function analyzeClothingPhoto(base64Image, mediaType) {
  const client = getClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
        { type: 'text', text: 'Определи тип этой вещи одежды (верх/низ/верхняя одежда/обувь), её точный цвет и дай короткую заметку стилиста.' }
      ]
    }],
    output_config: { format: { type: 'json_schema', schema: ITEM_SCHEMA } }
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Пустой ответ от модели');
  return JSON.parse(textBlock.text);
}

const WARDROBE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Общая оценка гардероба в 1-2 предложениях по-русски' },
    findings: {
      type: 'array',
      description: 'Конкретные проблемы или наблюдения, каждая — короткое предложение по-русски',
      items: { type: 'string' }
    },
    recommendations: {
      type: 'array',
      description: 'Конкретные предложения что докупить или изменить, каждое — короткое предложение по-русски',
      items: { type: 'string' }
    }
  },
  required: ['summary', 'findings', 'recommendations'],
  additionalProperties: false
};

// Анализирует ВЕСЬ гардероб как стилист: что не так, чего не хватает,
// что предложить докупить — по описанию вещей (тип+цвет+название).
// Картинки не передаём (их может быть много) — только структурированное
// описание, этого достаточно для содержательной критики.
async function analyzeWardrobeStyle(items) {
  const client = getClient();
  const description = items
    .map(i => `- ${i.label} (тип: ${i.type}, цвет: ${i.hex})`)
    .join('\n');

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: 'Ты — персональный стилист. Оцени гардероб пользователя честно и конкретно: не ограничивайся общими фразами, называй конкретные вещи и конкретные советы что докупить или изменить.',
    messages: [{
      role: 'user',
      content: `Вот гардероб пользователя:\n${description}\n\nОцени его и дай конкретные рекомендации.`
    }],
    output_config: { format: { type: 'json_schema', schema: WARDROBE_SCHEMA } }
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Пустой ответ от модели');
  return JSON.parse(textBlock.text);
}

module.exports = { isAvailable, analyzeClothingPhoto, analyzeWardrobeStyle };
