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

// --- Middleware ---

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'https://www.gocloudeg.com',
    methods: ['POST'],
    allowedHeaders: ['Content-Type']
  })
);

app.use(express.json({ limit: '16kb' }));

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a moment.' }
});

// --- Gemini Client ---

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
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
  return rawHistory
    .slice(-20)
    .filter(msg => msg && msg.role && msg.text)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: sanitizeInput(msg.text) }]
    }));
}

// --- Routes ---

app.post('/api/chat', chatLimiter, async (req, res) => {
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
