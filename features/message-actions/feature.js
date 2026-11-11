export default async function ({ root, bridge, getUser, on }) {
  let currentUser = getUser();
  let currentReplyTarget = null;

  on('login', (user) => {
    currentUser = user;
    initFeature();
  });

  on('logout', () => {
    currentUser = null;
  });

  function initFeature() {
    const msgsContainer = document.getElementById('msgs');
    const barContainer = document.getElementById('bar');
    const chatInput = document.getElementById('text');
    const sendBtn = document.getElementById('send');
    if (!msgsContainer || !barContainer || !chatInput) return;

    // WhatsApp-style reply preview bar above input
    let replyPreviewBar = document.getElementById('waReplyPreviewBar');
    if (!replyPreviewBar) {
      replyPreviewBar = document.createElement('div');
      replyPreviewBar.id = 'waReplyPreviewBar';
      replyPreviewBar.style.cssText = `
        display: none;
        align-items: center;
        background: #1a2438;
        border-left: 4px solid #6d75ff;
        padding: 8px 12px;
        margin: 0 10px 8px 10px;
        border-radius: 8px;
        font-size: 13px;
        position: absolute;
        bottom: 60px;
        left: 0;
        right: 0;
        z-index: 10;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      `;
      barContainer.parentNode.insertBefore(replyPreviewBar, barContainer);
    }

    function showReplyPreview(author, text) {
      currentReplyTarget = { author, text };
      replyPreviewBar.style.display = 'flex';
      replyPreviewBar.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="font-weight:bold; color:#6d75ff; font-size:12px; margin-bottom:2px;">Replying to ${escapeHtml(author)}</div>
          <div style="color:#9ba9c5; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(text)}</div>
        </div>
        <button id="waCancelReply" style="background:transparent; border:0; color:#9ba9c5; font-size:16px; cursor:pointer; padding:4px 8px;">✕</button>
      `;
      replyPreviewBar.querySelector('#waCancelReply').onclick = hideReplyPreview;
      chatInput.focus();
    }

    function hideReplyPreview() {
      currentReplyTarget = null;
      replyPreviewBar.style.display = 'none';
      replyPreviewBar.innerHTML = '';
    }

    const processAndSend = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      if (currentReplyTarget) {
        const tag = `[[reply:${currentReplyTarget.author}|${currentReplyTarget.text}]]`;
        chatInput.value = tag + text;
        hideReplyPreview();
      }
    };

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        processAndSend();
      }, true);
    }

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        processAndSend();
      }
    }, true);

    let touchStartX = 0;
    let touchStartY = 0;
    let activeMsgRow = null;
    let longPressTimer = null;

    msgsContainer.addEventListener('touchstart', (e) => {
      const row = e.target.closest('.msg-row');
      if (!row) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      activeMsgRow = row;

      const user = getUser();
      if (user && user.isAdmin) {
        longPressTimer = setTimeout(() => {
          showAdminActions(row);
        }, 600);
      }
    }, { passive: true });

    msgsContainer.addEventListener('touchmove', (e) => {
      if (!activeMsgRow) return;
      const moveX = e.touches[0].clientX - touchStartX;
      const moveY = e.touches[0].clientY - touchStartY;

      if (Math.abs(moveX) > 10 || Math.abs(moveY) > 10) {
        clearTimeout(longPressTimer);
      }

      if (moveX > 60 && Math.abs(moveY) < 30) {
        triggerReply(activeMsgRow);
        activeMsgRow = null;
      }
    }, { passive: true });

    msgsContainer.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      activeMsgRow = null;
    });

    msgsContainer.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.msg-row');
      const user = getUser();
      if (row && user && user.isAdmin) {
        e.preventDefault();
        showAdminActions(row);
      }
    });

    function triggerReply(row) {
      const msgArticle = row.querySelector('.msg');
      const msgText = msgArticle ? msgArticle.querySelector('span')?.textContent : '';
      const msgAuthor = msgArticle ? msgArticle.querySelector('b')?.textContent : 'User';
      showReplyPreview(msgAuthor, msgText);
    }

    function showAdminActions(row) {
      const msgKey = row.querySelector('.msg')?.dataset?.key;
      const actionModalId = 'bridgeActionModal';
      
      let modal = document.getElementById(actionModalId);
      if (!modal) {
        modal = document.createElement('div');
        modal.id = actionModalId;
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
        modal.innerHTML = `
          <div style="background:#151e30;padding:20px;border-radius:15px;width:280px;border:1px solid #394866;text-align:center;">
            <h3 style="margin-top:0;font-size:16px;color:#f1f3ff;">Admin Options</h3>
            <button id="bridgeReplyBtn" style="width:100%;margin-bottom:8px;background:#6d75ff;">Reply</button>
            <button id="bridgeDelBtn" style="width:100%;background:#a83d52;">Delete Message</button>
            <button id="bridgeCloseBtn" style="width:100%;margin-top:8px;background:#303b50;">Cancel</button>
          </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#bridgeCloseBtn').onclick = () => modal.remove();
      }

      modal.style.display = 'flex';
      modal.querySelector('#bridgeReplyBtn').onclick = () => {
        triggerReply(row);
        modal.style.display = 'none';
      };

      modal.querySelector('#bridgeDelBtn').onclick = async () => {
        modal.style.display = 'none';
        if (msgKey && window.firebase) {
          try {
            await firebase.database().ref('messages/' + msgKey).remove();
          } catch (err) {
            console.error('Delete failed', err);
          }
        }
      };
    }

    const observer = new MutationObserver(() => {
      formatMessageBubbles();
    });
    observer.observe(msgsContainer, { childList: true, subtree: true });
    formatMessageBubbles();
  }

  function formatMessageBubbles() {
    const messageSpans = document.querySelectorAll('#msgs .msg span');
    messageSpans.forEach(span => {
      const text = span.textContent;
      if (text.startsWith('[[reply:')) {
        const match = text.match(/^\[\[reply:(.*?)\|(.*?)\]\]([\s\S]*)$/);
        if (match) {
          const author = match[1];
          const quotedText = match[2];
          const actualMessage = match[3];

          span.innerHTML = `
            <div style="background:rgba(0,0,0,0.3); border-left:3px solid #55d9a0; padding:5px 8px; margin-bottom:6px; border-radius:4px; font-size:12px;">
              <div style="font-weight:bold; color:#55d9a0; margin-bottom:2px;">${escapeHtml(author)}</div>
              <div style="color:#b0bec5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(quotedText)}</div>
            </div>
            <div>${escapeHtml(actualMessage)}</div>
          `;
        }
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;') // Fixed syntax error here
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  initFeature();
  return () => {};
}
