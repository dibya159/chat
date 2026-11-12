// Pool Feature: Admin Delete Message Handler (Except Owner)

export function initPoolFeature(chatAppInstance) {
    console.log("Pool feature initialized: Admin message deletion enabled.");

    // Long press event listener par message delete logic attach karna
    setupAdminDeleteHandler(chatAppInstance);
}

function setupAdminDeleteHandler(chatAppInstance) {
    // Apne chat message container ya message elements ko select karein
    document.addEventListener('contextmenu', (e) => {
        // Right-click ya long-press mobile par context menu / action popup ke liye
        const messageElement = e.target.closest('.message-item'); // Apne class name ke hisab se change kar lena
        if (!messageElement) return;

        const senderRole = messageElement.getAttribute('data-sender-role'); // e.g., 'owner', 'admin', 'user'
        const messageId = messageElement.getAttribute('data-message-id');
        const currentLoggedInUserRole = chatAppInstance.currentUser.role; // 'admin', 'owner', etc.

        // Check if current user is admin
        if (currentLoggedInUserRole === 'admin') {
            // Check if target message sender is NOT the owner
            if (senderRole !== 'owner') {
                e.preventDefault(); // Default menu rokein aur custom delete popup dikhayein
                showAdminDeletePrompt(messageId, chatAppInstance);
            } else {
                console.log("Admin cannot delete the Owner's message.");
            }
        }
    });

    // Mobile long press (touchstart / touchend) handling agar contextmenu standard kaam na kare
    let pressTimer;
    document.addEventListener('touchstart', (e) => {
        const messageElement = e.target.closest('.message-item');
        if (!messageElement) return;

        pressTimer = setTimeout(() => {
            const senderRole = messageElement.getAttribute('data-sender-role');
            const messageId = messageElement.getAttribute('data-message-id');
            const currentLoggedInUserRole = chatAppInstance.currentUser.role;

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
    // Apne Firebase database reference se message remove karne ka code
    // Example:
    // const messageRef = db.ref('chats/' + messageId);
    // messageRef.remove().then(() => {
    //     console.log("Message deleted successfully by admin.");
    // }).catch((error) => {
    //     console.error("Error deleting message: ", error);
    // });
    
    console.log(`Deleting message ID: ${messageId} from database.`);
}
