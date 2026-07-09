'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const SYSTEM_PROMPT = require('./system-prompt');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'https://www.gocloudeg.com')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

const REQUIRED_CHAT_TOKEN = process.env.CHATBOT_API_TOKEN || '';
const CHAT_MINUTE_LIMIT = Number(process.env.CHAT_RATE_LIMIT_PER_MIN || 10);
const CHAT_DAILY_LIMIT = Number(process.env.CHAT_RATE_LIMIT_PER_DAY || 250);

// --- Middleware ---

app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'X-GoCloud-Chat-Token', 'X-Requested-With']
  })
);

app.use(express.json({ limit: '16kb' }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: CHAT_MINUTE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a moment.' }
});

const chatDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: CHAT_DAILY_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Daily request limit reached. Please try again later.' }
});

// --- Gemini Client ---

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  systemInstruction: SYSTEM_PROMPT
});

// --- Helpers ---

function sanitizeInput(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 500);
}

function buildHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) {
    return [];
  }
  const mapped = rawHistory
    .slice(-20)
    .filter(msg => msg && msg.role && msg.text)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: sanitizeInput(msg.text) }]
    }));
  // Gemini requires history to start with a 'user' message
  while (mapped.length > 0 && mapped[0].role !== 'user') {
    mapped.shift();
  }
  return mapped;
}

function isAllowedBrowserOrigin(req) {
  const origin = req.get('origin');
  const referer = req.get('referer');

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return false;
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!ALLOWED_ORIGINS.includes(refererOrigin)) {
        return false;
      }
    } catch (err) {
      return false;
    }
  }

  return true;
}

function requireChatAuth(req, res, next) {
  if (!isAllowedBrowserOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden origin.' });
  }

  const userAgent = req.get('user-agent');
  if (!userAgent) {
    return res.status(400).json({ error: 'Missing user agent.' });
  }

  if (REQUIRED_CHAT_TOKEN) {
    const token = req.get('x-gocloud-chat-token');
    if (token !== REQUIRED_CHAT_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized request.' });
    }
  }

  next();
}

// --- Routes ---

app.post('/api/chat', chatLimiter, chatDailyLimiter, requireChatAuth, async (req, res) => {
  try {
    const { message, history } = req.body;
    const userMessage = sanitizeInput(message);

    if (!userMessage) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const chatHistory = buildHistory(history);

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(userMessage);
    const response = result.response.text();

    res.json({ reply: response });
  } catch (err) {
    console.error('Gemini API error:', err.message);

    if (err.message && err.message.includes('API key')) {
      return res
        .status(500)
        .json({ error: 'Service configuration error. Please try again later.' });
    }

    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Start ---

app.listen(PORT, () => {
  console.error(`GoCloud Chatbot API running on port ${PORT}`);
});
