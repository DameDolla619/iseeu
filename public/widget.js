(function () {
  'use strict';

  // ── config injected by the embed script tag ──
  const RELAY = window.GR33K_RELAY_URL || 'https://gr33k-chat-relay.onrender.com';
  const BUSINESS = window.GR33K_BUSINESS || document.title || 'GR33KMoBB';
  const ACCENT = window.GR33K_ACCENT || '#39ff9e';

  // ── styles ──
  const css = `
    #gr33k-chat-bubble {
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${ACCENT}; cursor: pointer;
      box-shadow: 0 0 0 0 ${ACCENT}44;
      animation: gr33k-pulse 2.5s infinite;
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s;
    }
    #gr33k-chat-bubble:hover { transform: scale(1.1); }
    #gr33k-chat-bubble svg { width: 26px; height: 26px; fill: #000; }
    @keyframes gr33k-pulse {
      0%   { box-shadow: 0 0 0 0 ${ACCENT}66; }
      70%  { box-shadow: 0 0 0 14px ${ACCENT}00; }
      100% { box-shadow: 0 0 0 0 ${ACCENT}00; }
    }
    #gr33k-chat-box {
      position: fixed; bottom: 92px; right: 24px; z-index: 99999;
      width: 340px; max-height: 500px;
      background: #0a0e1a; border: 1px solid ${ACCENT}55;
      border-radius: 16px; display: none; flex-direction: column;
      box-shadow: 0 8px 40px #000a;
      font-family: 'Segoe UI', system-ui, sans-serif;
      overflow: hidden;
    }
    #gr33k-chat-box.open { display: flex; }
    #gr33k-chat-header {
      background: linear-gradient(135deg, #0f1628, #1a2540);
      padding: 14px 16px; display: flex; align-items: center; gap: 10px;
      border-bottom: 1px solid ${ACCENT}33;
    }
    #gr33k-chat-header .dot {
      width: 9px; height: 9px; border-radius: 50%; background: ${ACCENT};
      box-shadow: 0 0 6px ${ACCENT};
    }
    #gr33k-chat-header .title { color: #fff; font-weight: 700; font-size: 14px; flex: 1; }
    #gr33k-chat-header .sub { color: #8aa0c0; font-size: 11px; }
    #gr33k-chat-close {
      color: #8aa0c0; cursor: pointer; font-size: 18px; line-height: 1;
      padding: 2px 6px; border-radius: 4px;
    }
    #gr33k-chat-close:hover { color: #fff; }
    #gr33k-chat-messages {
      flex: 1; overflow-y: auto; padding: 14px; display: flex;
      flex-direction: column; gap: 10px; min-height: 200px; max-height: 320px;
    }
    #gr33k-chat-messages::-webkit-scrollbar { width: 4px; }
    #gr33k-chat-messages::-webkit-scrollbar-thumb { background: ${ACCENT}44; border-radius: 4px; }
    .gr33k-msg {
      max-width: 80%; padding: 9px 13px; border-radius: 12px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
    }
    .gr33k-msg.bot {
      background: #141c30; color: #d0e4ff; border-bottom-left-radius: 3px;
      align-self: flex-start;
    }
    .gr33k-msg.user {
      background: ${ACCENT}22; color: ${ACCENT}; border: 1px solid ${ACCENT}44;
      border-bottom-right-radius: 3px; align-self: flex-end;
    }
    .gr33k-typing {
      display: flex; gap: 4px; align-items: center; padding: 10px 13px;
      background: #141c30; border-radius: 12px; align-self: flex-start;
      border-bottom-left-radius: 3px;
    }
    .gr33k-typing span {
      width: 6px; height: 6px; border-radius: 50%; background: ${ACCENT}99;
      animation: gr33k-bounce .9s infinite;
    }
    .gr33k-typing span:nth-child(2) { animation-delay: .15s; }
    .gr33k-typing span:nth-child(3) { animation-delay: .3s; }
    @keyframes gr33k-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }
    #gr33k-chat-input-row {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid ${ACCENT}22; background: #0a0e1a;
    }
    #gr33k-chat-input {
      flex: 1; background: #141c30; border: 1px solid ${ACCENT}33;
      color: #d0e4ff; border-radius: 8px; padding: 8px 12px;
      font-size: 13px; outline: none; resize: none;
      font-family: inherit;
    }
    #gr33k-chat-input::placeholder { color: #4a5a7a; }
    #gr33k-chat-input:focus { border-color: ${ACCENT}88; }
    #gr33k-chat-send {
      background: ${ACCENT}; border: none; border-radius: 8px;
      width: 36px; height: 36px; cursor: pointer; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0;
      align-self: flex-end;
    }
    #gr33k-chat-send:hover { opacity: .85; }
    #gr33k-chat-send svg { width: 16px; height: 16px; fill: #000; }
    #gr33k-chat-brand {
      text-align: center; padding: 6px 0 8px;
      font-size: 10px; color: #3a4a6a; letter-spacing: .04em;
      border-top: 1px solid ${ACCENT}11;
    }
    #gr33k-chat-brand a {
      color: ${ACCENT}99; text-decoration: none; font-weight: 600;
    }
    #gr33k-chat-brand a:hover { color: ${ACCENT}; }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── HTML ──
  const bubble = document.createElement('div');
  bubble.id = 'gr33k-chat-bubble';
  bubble.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;

  const box = document.createElement('div');
  box.id = 'gr33k-chat-box';
  box.innerHTML = `
    <div id="gr33k-chat-header">
      <div class="dot"></div>
      <div>
        <div class="title">${BUSINESS}</div>
        <div class="sub">AI Assistant · Online now</div>
      </div>
      <div id="gr33k-chat-close">✕</div>
    </div>
    <div id="gr33k-chat-messages"></div>
    <div id="gr33k-chat-input-row">
      <textarea id="gr33k-chat-input" rows="1" placeholder="Type a message…"></textarea>
      <button id="gr33k-chat-send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
    <div id="gr33k-chat-brand">
      Powered by <a href="https://gr33k-mobb-forge.lovable.app" target="_blank">GR33KMoBB.media</a>
      &nbsp;·&nbsp; Built by Damion Roy
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(box);

  // ── state ──
  let history = [];
  let visitorInfo = {};
  let leadSaved = false;

  const msgs = document.getElementById('gr33k-chat-messages');
  const input = document.getElementById('gr33k-chat-input');

  function addMsg(text, role) {
    const el = document.createElement('div');
    el.className = `gr33k-msg ${role}`;
    el.textContent = text;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'gr33k-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    return el;
  }

  function extractInfo(text) {
    // name: no contact info yet and short response
    if (!visitorInfo.name && text.length < 40 && !/[@.]/.test(text)) {
      visitorInfo.name = text.trim().split(' ')[0];
    }
    // contact: email or phone
    if (!visitorInfo.contact) {
      const email = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phone = text.match(/[\d\s\-().+]{7,}/);
      if (email) visitorInfo.contact = email[0];
      else if (phone) visitorInfo.contact = phone[0].trim();
    }
    // need
    if (visitorInfo.name && !visitorInfo.need && text.length > 3) {
      visitorInfo.need = text.trim();
    }
  }

  async function send(text) {
    if (!text.trim()) return;
    addMsg(text, 'user');
    history.push({ role: 'user', content: text });
    extractInfo(text);

    const typing = showTyping();

    try {
      const r = await fetch(`${RELAY}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, business: BUSINESS, visitorInfo })
      });
      const data = await r.json();
      typing.remove();
      const reply = data.reply || "Thanks, we'll be in touch!";
      addMsg(reply, 'bot');
      history.push({ role: 'assistant', content: reply });

      // save lead once we have name + contact
      if (!leadSaved && visitorInfo.name && visitorInfo.contact) {
        leadSaved = true;
        fetch(`${RELAY}/lead`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: visitorInfo.name,
            contact: visitorInfo.contact,
            need: visitorInfo.need || text,
            business: BUSINESS,
            messages: history.filter(m => m.role === 'user').map(m => m.content).join(' | ')
          })
        }).catch(() => {});
      }
    } catch {
      typing.remove();
      addMsg("Sorry, I'm having trouble connecting. Please try again in a moment.", 'bot');
    }
  }

  function open() {
    box.classList.add('open');
    if (msgs.children.length === 0) {
      setTimeout(() => {
        const typing = showTyping();
        setTimeout(() => {
          typing.remove();
          addMsg(`Hey! Welcome to ${BUSINESS}. I'm your AI assistant — I'm here 24/7. What brings you here today?`, 'bot');
        }, 900);
      }, 300);
    }
    input.focus();
  }

  function close() { box.classList.remove('open'); }

  bubble.addEventListener('click', () => box.classList.contains('open') ? close() : open());
  document.getElementById('gr33k-chat-close').addEventListener('click', close);
  document.getElementById('gr33k-chat-send').addEventListener('click', () => {
    send(input.value); input.value = '';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); input.value = ''; }
  });

  // auto-open after 8s if not opened yet
  setTimeout(() => { if (!box.classList.contains('open')) open(); }, 8000);
})();
