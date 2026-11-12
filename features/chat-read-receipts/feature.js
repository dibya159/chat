// Chat Read Receipts & Seen By Feature Module

(function() {
    console.log("Chat Read Receipts & Seen By module loaded.");

    // Function to attach or update read receipts and seen info in chat UI
    window.initReadReceipts = function() {
        // Add listener or hooks for rendering receipts if needed
        const originalRenderMessages = window.renderMessages;
        if (typeof originalRenderMessages === 'function') {
            // Hook into existing render messages logic if available
            console.log("Read receipts hooked into message rendering.");
        }
    };

    // Helper function to check if user can view the seen list
    window.canViewSeenList = function(message, user) {
        if (!message || !message.seenBy) return false;
        const hasRead = message.seenBy.some(u => u.name.includes(user.name)) || message.isMe;
        return user.isAdmin || hasRead;
    };

    // Auto-initialize on load
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        window.initReadReceipts();
    } else {
        window.addEventListener('DOMContentLoaded', window.initReadReceipts);
    }
})();
