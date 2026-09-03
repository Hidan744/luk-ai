const express = require('express');
const path = require('node:path');
const { getWardrobe, addWardrobeItem, deleteWardrobeItem, ensureUser, setSubscription, db } = require('./db');
const OutfitLogic = require('../shared/outfit-logic');

const app = express();
app.use(express.json());

// Демо-CORS — открыт для всех источников, чтобы статический фронтенд
// (например, на GitHub Pages) мог обращаться к серверу напрямую.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function requireUserId(req, res) {
  const userId = req.query.userId || req.body.userId;
  if (!userId) {
    res.status(400).json({ error: 'userId обязателен' });
    return null;
  }
  return String(userId);
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/wardrobe', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  ensureUser(userId);
  res.json(getWardrobe(userId));
});

app.post('/api/wardrobe', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const { type, hex, label } = req.body;
  if (!type || !hex || !label) {
    return res.status(400).json({ error: 'type, hex и label обязательны' });
  }
  res.status(201).json(addWardrobeItem(userId, { type, hex, label }));
});

app.delete('/api/wardrobe/:id', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const ok = deleteWardrobeItem(userId, Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'не найдено' });
  res.status(204).end();
});

app.post('/api/outfit', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const { weather, occasion } = req.body;
  const wardrobe = getWardrobe(userId);
  const result = OutfitLogic.pickBestOutfit(wardrobe, { weather, occasion });
  if (!result) return res.status(200).json({ pick: null, message: 'Недостаточно вещей в гардеробе' });
  res.json({ pick: result.items, score: result.score });
});

// --- Подписка / оплата -----------------------------------------------
// РЕАЛЬНОГО платёжного провайдера здесь нет — нужны ключи ЮKassa/Stripe/
// CloudPayments от владельца проекта. Эндпоинты ниже имитируют то, что
// сделал бы вебхук провайдера после успешной оплаты: помечают пользователя
// подписанным. Чтобы подключить реальные платежи, замени тело
// /api/subscription/checkout на создание платежа в API провайдера и
// перенеси активацию подписки в отдельный /api/subscription/webhook,
// который провайдер будет дёргать сам после факта оплаты.

const PLANS = {
  free: { label: 'Бесплатно', priceRub: 0 },
  plus: { label: 'Стиль+', priceRub: 399 }
};

app.get('/api/subscription', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const user = ensureUser(userId);
  res.json({ plan: user.plan, subscribedUntil: user.subscribed_until, plans: PLANS });
});

app.post('/api/subscription/checkout', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const plan = req.body.plan;
  if (!PLANS[plan]) return res.status(400).json({ error: 'неизвестный тариф' });

  if (plan === 'free') {
    const user = setSubscription(userId, 'free', null);
    return res.json({ mocked: true, user });
  }

  // MOCK: в реальном флоу здесь должен быть редирект на страницу оплаты
  // провайдера и запись pending-платежа; активация подписки происходит
  // только по вебхуку об успешной оплате, а не сразу.
  const until = new Date();
  until.setMonth(until.getMonth() + 1);
  const user = setSubscription(userId, plan, until.toISOString());
  res.json({ mocked: true, note: 'Оплата не подключена — статус выставлен сразу для демо', user });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ЛУК.AI backend слушает на http://localhost:${PORT}`);
});
