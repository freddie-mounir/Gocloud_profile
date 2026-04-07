(function () {
  'use strict';

  var API_URL = '/api/chat';
  var MAX_HISTORY = 50;
  var WELCOME_MSG =
    "Hi! I'm GoCloud's AI assistant. Ask me anything about our Odoo ERP solutions, " +
    'ELITE medical insurance platform, or any of our services. How can I help you today?';

  var chatBtn = document.getElementById('gcChatBtn');
  var chatPanel = document.getElementById('gcChatPanel');
  var chatMessages = document.getElementById('gcChatMessages');
  var chatInput = document.getElementById('gcChatInput');
  var chatSend = document.getElementById('gcChatSend');
  var chatClose = chatPanel ? chatPanel.querySelector('.gc-chat-close') : null;
  var typingEl = document.getElementById('gcTyping');
  var isOpen = false;
  var isSending = false;
  var history = [];

  function loadHistory() {
    try {
      var saved = sessionStorage.getItem('gc_chat_history');
      if (saved) {
        history = JSON.parse(saved);
      }
    } catch (e) {
      history = [];
    }
  }

  function saveHistory() {
    try {
      if (history.length > MAX_HISTORY) {
        history = history.slice(-MAX_HISTORY);
      }
      sessionStorage.setItem('gc_chat_history', JSON.stringify(history));
    } catch (e) {
      // sessionStorage unavailable
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatResponse(text) {
    // Convert markdown bold to <strong>
    var formatted = escapeHtml(text);
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Convert markdown links [text](url)
    formatted = formatted.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    // Convert plain URLs
    formatted = formatted.replace(
      /(^|[^"=])(https?:\/\/[^\s<]+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>'
    );
    // Convert email addresses
    formatted = formatted.replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1">$1</a>'
    );
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  }

  function addMessage(text, role) {
    var msgDiv = document.createElement('div');
    msgDiv.className = 'gc-msg ' + (role === 'user' ? 'gc-msg-user' : 'gc-msg-bot');
    if (role === 'user') {
      msgDiv.textContent = text;
    } else {
      msgDiv.innerHTML = formatResponse(text);
    }
    chatMessages.insertBefore(msgDiv, typingEl);
    scrollToBottom();
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showTyping() {
    typingEl.classList.add('gc-show');
    scrollToBottom();
  }

  function hideTyping() {
    typingEl.classList.remove('gc-show');
  }

  function setInputEnabled(enabled) {
    chatInput.disabled = !enabled;
    chatSend.disabled = !enabled;
    isSending = !enabled;
  }

  function renderHistory() {
    // Clear existing messages except typing indicator
    var messages = chatMessages.querySelectorAll('.gc-msg');
    for (var i = 0; i < messages.length; i++) {
      messages[i].remove();
    }
    for (var j = 0; j < history.length; j++) {
      addMessage(history[j].text, history[j].role);
    }
  }

  function trackEvent(action, label) {
    if (typeof gtag === 'function') {
      gtag('event', action, {
        event_category: 'chatbot',
        event_label: label
      });
    }
  }

  async function sendMessage() {
    var text = chatInput.value.trim();
    if (!text || isSending) {
      return;
    }

    addMessage(text, 'user');
    history.push({ role: 'user', text: text });
    saveHistory();
    chatInput.value = '';
    setInputEnabled(false);
    showTyping();

    trackEvent('chatbot_message_sent', text.substring(0, 50));

    try {
      var res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1)
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function () {
          return {};
        });
        throw new Error(errData.error || 'Request failed');
      }

      var data = await res.json();
      var reply = data.reply || 'Sorry, I could not generate a response. Please try again.';

      hideTyping();
      addMessage(reply, 'model');
      history.push({ role: 'model', text: reply });
      saveHistory();

      trackEvent('chatbot_response_received', reply.substring(0, 50));
    } catch (err) {
      hideTyping();
      var errorMsg =
        "I'm having trouble connecting right now. Please try again, or reach out to us " +
        'directly at marketing@gocloudeg.com or +20 101 738 3815.';
      addMessage(errorMsg, 'model');
      console.error('Chatbot error:', err.message);
    }

    setInputEnabled(true);
    chatInput.focus();
  }

  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      chatPanel.classList.add('gc-open');
      chatBtn.style.display = 'none';
      chatInput.focus();
      trackEvent('chatbot_opened', 'toggle');

      if (history.length === 0) {
        addMessage(WELCOME_MSG, 'model');
        history.push({ role: 'model', text: WELCOME_MSG });
        saveHistory();
      }
    } else {
      chatPanel.classList.remove('gc-open');
      chatBtn.style.display = 'flex';
    }
  }

  function closeChat() {
    isOpen = false;
    chatPanel.classList.remove('gc-open');
    chatBtn.style.display = 'flex';
  }

  function init() {
    if (!chatBtn || !chatPanel || !chatInput || !chatSend) {
      return;
    }

    loadHistory();

    if (history.length > 0) {
      renderHistory();
    }

    chatBtn.addEventListener('click', toggleChat);
    chatClose.addEventListener('click', closeChat);

    chatSend.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        closeChat();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
