export default async function ({ root, bridge, getUser, on }) {
  let currentUser = getUser();

  on('login', (user) => {
    currentUser = user;
    initFeature();
  });

  on('logout', () => {
    currentUser = null;
  });

  function initFeature() {
    const msgsContainer = document.getElementById('msgs');
    if (!msgsContainer) return;

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
      // Admin/Owner ke liye long press (600ms) par delete & reply menu khulega
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

      // Members aur Admin/Owner dono ke liye Right Swipe (>60px) par reply trigger hoga
      if (moveX > 60 && Math.abs(moveY) < 30) {
        triggerReply(activeMsgRow);
        activeMsgRow = null;
      }
    }, { passive: true });

    msgsContainer.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      activeMsgRow = null;
    });

    // Desktop testing ke liye right click support
    msgsContainer.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.msg-row');
      const user = getUser();
      if (row && user && user.isAdmin) {
        e.preventDefault();
        showAdminActions(row);
      }
    });
  }

  function triggerReply(row) {
    const msgArticle = row.querySelector('.msg');
    const msgText = msgArticle ? msgArticle.querySelector('span')?.textContent : '';
    const msgAuthor = msgArticle ? msgArticle.querySelector('b')?.textContent : 'User';
    
    const chatInput = document.getElementById('text');
    if (chatInput) {
      chatInput.value = `[Replying to ${msgAuthor}: "${msgText.slice(0, 30)}..."] `;
      chatInput.focus();
    }
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

  initFeature();

  return () => {};
}
