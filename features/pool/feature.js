// Pool Feature: Admin Delete Message Handler (Except Owner)

export default function initPoolFeature(chatAppInstance) {
    console.log("Pool feature initialized: Admin message deletion enabled.");

    // Long press/context menu event listener attach karna
    setupAdminDeleteHandler(chatAppInstance);
}

function setupAdminDeleteHandler(chatAppInstance) {
    // Desktop right-click / context menu handler
    document.addEventListener('contextmenu', (e) => {
        const messageElement = e.target.closest('.message-item'); // Apne message container class ke hisab se check karein
        if (!messageElement) return;

        const senderRole = messageElement.getAttribute('data-sender-role'); // e.g., 'owner', 'admin', 'user'
        const messageId = messageElement.getAttribute('data-message-id');
        const currentLoggedInUserRole = chatAppInstance?.currentUser?.role;

        // Check if current user is admin and target message sender is NOT the owner
        if (currentLoggedInUserRole === 'admin') {
            if (senderRole !== 'owner') {
                e.preventDefault();
                showAdminDeletePrompt(messageId, chatAppInstance);
            } else {
                console.log("Admin cannot delete the Owner's message.");
            }
        }
    });

    // Mobile long press handling
    let pressTimer;
    document.addEventListener('touchstart', (e) => {
        const messageElement = e.target.closest('.message-item');
        if (!messageElement) return;

        pressTimer = setTimeout(() => {
            const senderRole = messageElement.getAttribute('data-sender-role');
            const messageId = messageElement.getAttribute('data-message-id');
            const currentLoggedInUserRole = chatAppInstance?.currentUser?.role;

            if (currentLoggedInUserRole === 'admin' && senderRole !== 'owner') {
                showAdminDeletePrompt(messageId, chatAppInstance);
            }
        }, 600); // 600ms long press duration
    });

    document.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });
}

function showAdminDeletePrompt(messageId, chatAppInstance) {
    if (confirm("Admin Action: Do you want to delete this message?")) {
        deleteMessageFromFirebase(messageId, chatAppInstance);
    }
}

function deleteMessageFromFirebase(messageId, chatAppInstance) {
    // Yahan apna Firebase delete logic lagayein
    // Example: firebase.database().ref('messages/' + messageId).remove();
    console.log(`Deleting message ID: ${messageId} from database.`);
}
