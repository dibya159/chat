```html
<!-- ... existing code ... -->
            <!-- Messages Stream -->
            <div id="messages-container" class="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/40">
                <!-- Messages populated via JS -->
            </div>

            <!-- Message Input Footer -->
            <footer class="p-4 border-t border-slate-200 bg-white">
                <form id="message-form" onsubmit="sendMessage(event)" class="flex items-center gap-3">
                    <button type="button" class="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition"><i class="fa-solid fa-paperclip text-lg"></i></button>
                    <button type="button" class="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition"><i class="fa-regular fa-face-smile text-lg"></i></button>
                    <input type="text" id="message-input" placeholder="Type a message..." autocomplete="off" class="flex-1 bg-slate-100 border-none rounded-full px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 placeholder-slate-400">
                    <button type="submit" class="bg-indigo-600 text-white w-11 h-11 rounded-full flex items-center justify-center hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition transform active:scale-95"><i class="fa-solid fa-paper-plane text-sm"></i></button>
                </form>
            </footer>
        </main>
    </div>

    <!-- "Seen By" Modal -->
    <div id="seen-modal" class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden modal-animation border border-slate-100">
            <!-- Modal Header -->
            <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs"><i class="fa-solid fa-check-double"></i></div>
                    <h3 class="font-bold text-slate-900 text-base">Seen by</h3>
                </div>
                <button onclick="closeSeenModal()" class="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-200/50 transition"><i class="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <!-- Modal Body (List of users) -->
            <div id="seen-list" class="max-h-80 overflow-y-auto divide-y divide-slate-100 p-2">
                <!-- Populated dynamically -->
            </div>
            <!-- Modal Footer -->
            <div class="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button onclick="closeSeenModal()" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold rounded-xl transition">Close</button>
            </div>
        </div>
    </div>

    <!-- Notification Toast -->
    <div id="toast" class="fixed bottom-6 right-6 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xl transform translate-y-24 opacity-0 transition-all duration-300 z-50 flex items-center gap-3 text-sm">
        <i class="fa-solid fa-circle-check text-emerald-400 text-base"></i>
        <span id="toast-message">Action successful</span>
    </div>

    <script>
<!-- ... existing code ... -->
        // Current User Profile (with Owner/Admin privileges)
        const currentUser = {
            name: "Alex Morgan",
            isAdmin: true, // Owner/Admin can always view seen list
            avatar: "https://placehold.co/100x100/4f46e5/ffffff?text=ME"
        };

        // Mock Data Store
        const chats = [
            {
                id: 1,
                name: "Dev Team Sync",
                type: "group",
                avatar: "https://placehold.co/100x100/3b82f6/ffffff?text=DEV",
                subtitle: "Alex: Let's ship the new update...",
                time: "10:42 AM",
                unread: 2,
                onlineCount: "4 members, 3 online",
                messages: [
                    {
                        id: mId(),
                        sender: "Sarah Jenkins",
                        senderAvatar: "https://placehold.co/100x100/f59e0b/ffffff?text=SJ",
                        isMe: false,
                        text: "Hey team! Have we completed the read receipt feature audit?",
                        time: "10:30 AM",
                        seenBy: [
                            { name: "Alex Morgan (You)", avatar: "https://placehold.co/100x100/4f46e5/ffffff?text=ME", time: "10:32 AM" },
                            { name: "David Kim", avatar: "https://placehold.co/100x100/10b981/ffffff?text=DK", time: "10:33 AM" },
                            { name: "Elena Rostova", avatar: "https://placehold.co/100x100/ec4899/ffffff?text=ER", time: "10:35 AM" }
                        ]
                    },
                    {
                        id: mId(),
                        sender: "Alex Morgan",
                        senderAvatar: "https://placehold.co/100x100/4f46e5/ffffff?text=ME",
                        isMe: true,
                        text: "Yes! Building the modal preview right now with exact timestamps and avatars.",
                        time: "10:41 AM",
                        seenBy: [
                            { name: "Sarah Jenkins", avatar: "https://placehold.co/100x100/f59e0b/ffffff?text=SJ", time: "10:41 AM" },
                            { name: "David Kim", avatar: "https://placehold.co/100x100/10b981/ffffff?text=DK", time: "10:42 AM" }
                        ]
                    }
                ]
            },
            {
                id: 2,
                name: "Sarah Jenkins",
                type: "dm",
                avatar: "https://placehold.co/100x100/f59e0b/ffffff?text=SJ",
                subtitle: "Double checkmarks working perfectly!",
                time: "9:15 AM",
                unread: 0,
                onlineCount: "Online",
                messages: [
                    {
                        id: mId(),
                        sender: "Sarah Jenkins",
                        senderAvatar: "https://placehold.co/100x100/f59e0b/ffffff?text=SJ",
                        isMe: false,
                        text: "Hi Alex! Did you check the new wireframes?",
                        time: "9:00 AM",
                        status: "seen"
                    },
                    {
                        id: mId(),
                        sender: "Alex Morgan",
                        senderAvatar: "https://placehold.co/100x100/4f46e5/ffffff?text=ME",
                        isMe: true,
                        text: "Checking them right now. They look super clean!",
                        time: "9:10 AM",
                        status: "seen",
                        seenTime: "9:12 AM"
                    }
                ]
            }
        ];

        let activeChatId = 1;
        let currentFilter = 'all';

        function mId() {
            return '_' + Math.random().toString(36).substr(2, 9);
        }

        // Render Sidebar Chat List
        function renderChatList() {
            const listEl = document.getElementById('chat-list');
            listEl.innerHTML = '';

            const filteredChats = chats.filter(chat => {
                if (currentFilter === 'dm') return chat.type === 'dm';
                if (currentFilter === 'group') return chat.type === 'group';
                return true;
            });

            filteredChats.forEach(chat => {
                const isActive = chat.id === activeChatId;
                const item = document.createElement('div');
                item.className = `p-3.5 flex items-center space-x-3 cursor-pointer transition ${isActive ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'}`;
                item.onclick = () => switchChat(chat.id);

                item.innerHTML = `
                    <div class="relative flex-shrink-0">
                        <img src="${chat.avatar}" class="w-12 h-12 rounded-full object-cover shadow-sm">
                        ${chat.type === 'group' ? '<span class="absolute -bottom-1 -right-1 bg-indigo-600 text-white text-[9px] px-1 rounded-full font-bold">GRP</span>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="font-semibold text-slate-900 text-sm truncate">${chat.name}</h4>
                            <span class="text-[11px] text-slate-400 flex-shrink-0">${chat.time}</span>
                        </div>
                        <p class="text-xs text-slate-500 truncate">${chat.subtitle}</p>
                    </div>
                    ${chat.unread > 0 ? `<span class="bg-indigo-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0">${chat.unread}</span>` : ''}
                `;
                listEl.appendChild(item);
            });
        }

        // Switch Active Chat
        function switchChat(id) {
            activeChatId = id;
            const chat = chats.find(c => c.id === id);
            if (!chat) return;

            chat.unread = 0;

            document.getElementById('header-avatar').src = chat.avatar;
            document.getElementById('header-title').innerText = chat.name;
            document.getElementById('header-subtitle').innerText = chat.onlineCount;

            renderChatList();
            renderMessages();

            if (window.innerWidth < 768) {
                document.getElementById('sidebar').classList.add('hidden');
                document.getElementById('chat-main').classList.remove('hidden');
            }
        }

        // Render Messages in Active Chat with 'Seen by' and timestamp integration
        function renderMessages() {
            const container = document.getElementById('messages-container');
            container.innerHTML = '';
            const chat = chats.find(c => c.id === activeChatId);
            if (!chat) return;

            chat.messages.forEach(msg => {
                const msgDiv = document.createElement('div');
                msgDiv.className = `flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} mb-4`;

                let seenSectionHtml = '';
                if (chat.type === 'group') {
                    const seenCount = msg.seenBy ? msg.seenBy.length : 0;
                    let avatarsHtml = '';
                    if (msg.seenBy && msg.seenBy.length > 0) {
                        const displayAvatars = msg.seenBy.slice(0, 3);
                        avatarsHtml = `<div class="flex -space-x-1.5 overflow-hidden mr-1.5">
                            ${displayAvatars.map(s => `<img src="${s.avatar}" class="w-4 h-4 rounded-full border border-white object-cover">`).join('')}
                        </div>`;
                    }
                    seenSectionHtml = `
                        <div class="mt-1 flex items-center gap-2">
                            <span class="text-[11px] text-slate-400">${msg.time}</span>
                            <button onclick="openSeenModal(${chat.id}, '${msg.id}')" class="inline-flex items-center text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 shadow-2xs transition group">
                                ${avatarsHtml}
                                <span class="group-hover:text-indigo-600 transition">Seen by ${seenCount}</span>
                                <i class="fa-solid fa-chevron-right text-[9px] ml-1 text-slate-400"></i>
                            </button>
                        </div>
                    `;
                } else if (chat.type === 'dm' && msg.isMe) {
                    seenSectionHtml = `
                        <div class="mt-1 flex items-center space-x-1 text-[11px] text-slate-400">
                            <span>${msg.time}</span>
                            <span class="text-indigo-600 font-bold" title="Seen"><i class="fa-solid fa-check-double text-xs"></i></span>
                        </div>
                    `;
                } else {
                    seenSectionHtml = `<span class="mt-1 text-[11px] text-slate-400">${msg.time}</span>`;
                }

                msgDiv.innerHTML = `
                    <div class="flex items-end space-x-2 max-w-[85%] md:max-w-[70%] ${msg.isMe ? 'flex-row-reverse space-x-reverse' : ''}">
                        ${!msg.isMe ? `<img src="${msg.senderAvatar}" class="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-1">` : ''}
                        <div>
                            ${!msg.isMe && chat.type === 'group' ? `<span class="text-[11px] font-semibold text-slate-600 ml-1 mb-0.5 block">${msg.sender}</span>` : ''}
                            <div class="p-3.5 rounded-2xl shadow-sm text-sm ${msg.isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200/60 rounded-bl-none'}">
                                <p class="leading-relaxed">${msg.text}</p>
                            </div>
                            <div class="flex ${msg.isMe ? 'justify-end' : 'justify-start'}">
                                ${seenSectionHtml}
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(msgDiv);
            });

            container.scrollTop = container.scrollHeight;
        }

        // Send Message
        function sendMessage(e) {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const text = input.value.trim();
            if (!text) return;

            const chat = chats.find(c => c.id === activeChatId);
            if (!chat) return;

            const newMsg = {
                id: mId(),
                sender: "Alex Morgan",
                senderAvatar: "https://placehold.co/100x100/4f46e5/ffffff?text=ME",
                isMe: true,
                text: text,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: "seen",
                seenBy: chat.type === 'group' ? [
                    { name: "Sarah Jenkins", avatar: "https://placehold.co/100x100/f59e0b/ffffff?text=SJ", time: "Just now" }
                ] : undefined
            };

            chat.messages.push(newMsg);
            chat.subtitle = `You: ${text}`;
            chat.time = "Just now";
            input.value = '';

            renderMessages();
            renderChatList();
            showToast("Message sent successfully");
        }

        // Filter Chats
        function filterChats(type) {
            currentFilter = type;
            ['all', 'dm', 'group'].forEach(t => {
                const btn = document.getElementById(`tab-${t}`);
                if (t === type) {
                    btn.className = "flex-1 py-3 text-center border-b-2 border-indigo-600 text-indigo-600 font-semibold transition";
                } else {
                    btn.className = "flex-1 py-3 text-center border-b-2 border-transparent hover:text-slate-700 transition";
                }
            });
            renderChatList();
        }

        // Open "Seen by" Modal with Permission Validation logic
        function openSeenModal(chatId, messageId) {
            const chat = chats.find(c => c.id === chatId);
            if (!chat) return;
            const message = chat.messages.find(m => m.id === messageId);
            if (!message || !message.seenBy) return;

            // Permission Check: Only admin/owner or users who have seen the message can view the list
            const hasRead = message.seenBy.some(u => u.name.includes("Alex Morgan")) || message.isMe;
            if (!currentUser.isAdmin && !hasRead) {
                showToast("You must read or send the message to view who seen it.");
                return;
            }

            const listEl = document.getElementById('seen-list');
            listEl.innerHTML = '';

            message.seenBy.forEach(user => {
                const row = document.createElement('div');
                row.className = "flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition";
                row.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <img src="${user.avatar}" class="w-10 h-10 rounded-full object-cover border border-slate-200">
                        <div>
                            <h5 class="font-semibold text-slate-900 text-sm">${user.name}</h5>
                            <span class="text-xs text-emerald-600 flex items-center gap-1"><i class="fa-solid fa-check-double text-[10px]"></i> Seen</span>
                        </div>
                    </div>
                    <span class="text-xs text-slate-400 font-medium">${user.time}</span>
                `;
                listEl.appendChild(row);
            });

            document.getElementById('seen-modal').classList.remove('hidden');
        }

        function closeSeenModal() {
            document.getElementById('seen-modal').classList.add('hidden');
        }

        function showToast(message) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-message').innerText = message;
            toast.classList.remove('translate-y-24', 'opacity-0');
            setTimeout(() => {
                toast.classList.add('translate-y-24', 'opacity-0');
            }, 3000);
        }

        window.onload = function() {
            renderChatList();
            switchChat(1);

            document.getElementById('back-btn').onclick = function() {
                document.getElementById('sidebar').classList.remove('hidden');
                document.getElementById('chat-main').classList.add('hidden');
            };
        };
    </script>
</body>
</html>
```
