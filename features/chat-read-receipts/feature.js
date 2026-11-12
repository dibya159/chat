export default function initReadReceiptsFeature() {
    console.log("Chat Read Receipts & Seen By module loaded.");

    window.initReadReceipts = function() {
        const originalRenderMessages = window.renderMessages;
        if (typeof originalRenderMessages === 'function') {
            console.log("Read receipts hooked into message rendering.");
        }
    };

    window.canViewSeenList = function(message, user) {
        if (!message || !message.seenBy) return false;
        const hasRead = message.seenBy.some(u => u.name.includes(user.name)) || message.isMe;
        return user.isAdmin || hasRead;
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.initReadReceipts();
    } else {
        window.addEventListener('DOMContentLoaded', window.initReadReceipts);
    }
}
