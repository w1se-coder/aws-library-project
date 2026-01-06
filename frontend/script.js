// --- AYARLAR ---
const CONFIG = {
    userPoolId: 'eu-north-1_mSgPpFbTd', 
    clientId: '358evs3lh5npe0nea2uiu9tp5i', 
    // 👇 API Linkini Buraya Yapıştır
    apiUrl: 'https://f2s450v279.execute-api.eu-north-1.amazonaws.com/dev' 
};

// --- DEĞİŞKENLER ---
let books = [];
let favorites = []; 
let idToken = null; 
let currentUsername = null; // 👇 YENİ: Sabit kullanıcı adını burada tutacağız

// --- BAŞLANGIÇ ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    if (CONFIG.apiUrl) {
        fetchBooks();
    } else {
        console.warn("API URL eksik! Lütfen script.js dosyasını düzenleyin.");
    }
});

// --- API İŞLEMLERİ ---

// 1. Kitapları Getir
async function fetchBooks() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books`);
        if (!response.ok) throw new Error('Veri çekilemedi');
        books = await response.json();
        renderBooks(books);
    } catch (err) { console.error(err); }
}

// 2. Favorileri Getir (DÜZELTİLDİ: Username ile istek atıyor)
async function fetchFavorites() {
    if (!currentUsername) return; // Kullanıcı adı yoksa favori getirme
    try {
        const response = await fetch(`${CONFIG.apiUrl}/reading-lists`, {
            headers: { 
                'Authorization': idToken,
                'X-User-ID': currentUsername // 👇 ÖNEMLİ: Sabit kullanıcı adını gönderiyoruz
            }
        });
        if (response.ok) {
            const data = await response.json();
            favorites = data.map(item => item.bookId);
            // Eğer o an favoriler sayfasındaysak ekranı yenile
            if(document.getElementById('page-title').textContent === "Favorilerim"){
                showFavorites();
            } else {
                renderBooks(); 
            }
        }
    } catch (err) { console.error(err); }
}

// 3. Kitap Ekle/Güncelle
async function saveBookToBackend(bookData) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookData)
        });
        if (response.ok) { 
            await fetchBooks(); 
            alert("İşlem başarılı!"); 
        }
    } catch (err) { alert("Hata: " + err.message); }
}

// 4. Kitap Sil
async function deleteBookFromBackend(id) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        });
        if (response.ok) fetchBooks();
    } catch (err) { alert("Silinemedi: " + err.message); }
}

// 5. Favori İşlemi (DÜZELTİLDİ: Username ile işlem yapıyor)
async function toggleFavorite(bookId, bookTitle) {
    if (!currentUsername) {
        alert("Favorilere eklemek için lütfen giriş yapın.");
        showLoginModal();
        return;
    }
    const isFavorite = favorites.includes(bookId.toString());
    try {
        const method = isFavorite ? 'DELETE' : 'POST';
        const body = isFavorite ? { bookId } : { bookId, bookTitle };
        
        await fetch(`${CONFIG.apiUrl}/reading-lists`, {
            method: method,
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': idToken,
                'X-User-ID': currentUsername // 👇 ÖNEMLİ: Sabit ID
            },
            body: JSON.stringify(body)
        });
        
        if (isFavorite) {
            favorites = favorites.filter(id => id !== bookId.toString());
            if(document.getElementById('page-title').textContent === "Favorilerim") {
                showFavorites(); 
                return;
            }
        } else {
            favorites.push(bookId.toString());
        }
        renderBooks();
    } catch (err) { alert("Hata: " + err.message); }
}

// --- ARAYÜZ (UI) FONKSİYONLARI ---

function showAllBooks() {
    const title = document.getElementById('page-title');
    if(title) title.textContent = "Kütüphane Arşivi";

    const search = document.getElementById('search-input');
    if(search) search.value = '';

    const genre = document.getElementById('genre-filter');
    if(genre) genre.value = '';

    const status = document.getElementById('status-filter');
    if(status) status.value = '';

    renderBooks(books);
}

function showFavorites() {
    if (!currentUsername) { 
        alert("Favorilerinizi görmek için giriş yapmalısınız."); 
        showLoginModal();
        return; 
    }
    document.getElementById('page-title').textContent = "Favorilerim";
    
    const search = document.getElementById('search-input');
    if(search) search.value = '';
    
    const favBooks = books.filter(book => favorites.includes(book.id.toString()));
    
    if (favBooks.length === 0) {
        document.getElementById('book-grid').innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-500">
                <i class="fas fa-heart-broken text-4xl mb-3 text-slate-300"></i><br>
                Henüz favori kitabınız yok.
            </div>`;
    } else {
        renderBooks(favBooks);
    }
}

function toggleFilterDropdown() {
    const dropdown = document.getElementById('filter-dropdown');
    dropdown.classList.toggle('hidden');
}

function filterBooks() {
    renderBooks(books);
}

function renderBooks(bookList = books) {
    const grid = document.getElementById('book-grid');
    if(!grid) return;

    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const genreFilter = document.getElementById('genre-filter')?.value || '';
    const statusFilter = document.getElementById('status-filter')?.value || '';

    const filteredBooks = bookList.filter(book => {
        const matchesSearch = (book.title || '').toLowerCase().includes(searchTerm) || 
                              (book.author || '').toLowerCase().includes(searchTerm) ||
                              (book.isbn || '').includes(searchTerm);
        const matchesGenre = genreFilter === '' || book.genre === genreFilter;
        const matchesStatus = statusFilter === '' || (book.status || 'Müsait') === statusFilter;
        
        return matchesSearch && matchesGenre && matchesStatus;
    });

    if (filteredBooks.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">
            <i class="fas fa-search mb-2 text-2xl"></i><br>Aradığınız kriterlere uygun kitap bulunamadı.
        </div>`;
        return;
    }

    grid.innerHTML = filteredBooks.map(book => {
        const isFav = favorites.includes(book.id.toString());
        const heartClass = isFav ? "fas fa-heart text-red-500" : "far fa-heart text-slate-400";
        const statusText = book.status || 'Müsait';
        const statusColor = statusText === 'Ödünç Verilmiş' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';

        return `
        <div class="book-card bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full relative group transition-all duration-300 hover:shadow-md">
            <div class="h-64 overflow-hidden relative bg-slate-50 flex items-center justify-center p-4">
                <img src="${book.cover || 'https://placehold.co/300x450?text=Resim+Yok'}" 
                     class="max-h-full object-contain shadow-sm transition duration-500 group-hover:scale-105"
                     onerror="this.src='https://placehold.co/300x450?text=Resim+Yok';">
                
                <div class="absolute top-2 right-2 z-20">
                     <button onclick="toggleFavorite('${book.id}', '${book.title}')" class="bg-white/90 backdrop-blur-sm p-2 rounded-full shadow-sm hover:bg-white transition text-lg">
                        <i class="${heartClass}"></i>
                     </button>
                </div>
                
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center gap-2 z-10 backdrop-blur-[2px]">
                    <button onclick="openBookDetails('${book.id}')" class="bg-white text-slate-800 px-4 py-2 rounded-full font-medium text-xs hover:bg-blue-50 transition transform hover:scale-105">Detaylar</button>
                    ${idToken ? `<button onclick="openEditBookModal('${book.id}')" class="bg-slate-800 text-white p-2 rounded-full hover:bg-slate-700 transition" title="Düzenle"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
            
            <div class="p-4 flex-1 flex flex-col">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${statusColor}">${statusText}</span>
                    <span class="text-xs text-slate-400">${book.genre || 'Genel'}</span>
                </div>
                <h3 class="text-base font-bold text-slate-800 mb-1 line-clamp-1" title="${book.title}">${book.title}</h3>
                <p class="text-slate-500 text-xs mb-3">${book.author}</p>
            </div>
        </div>
    `}).join('');
}

// --- MODALLAR ---

function openBookDetails(id) {
    const book = books.find(b => b.id.toString() === id.toString());
    if (!book) return;
    
    document.getElementById('modal-book-image').src = book.cover || 'https://placehold.co/300x450';
    document.getElementById('modal-book-title').textContent = book.title;
    document.getElementById('modal-book-author').textContent = book.author;
    document.getElementById('modal-book-desc').textContent = book.description || "Açıklama yok.";
    document.getElementById('modal-book-isbn').textContent = book.isbn || '-';
    document.getElementById('modal-book-date').textContent = book.publishedYear || '-';
    document.getElementById('modal-book-genre').textContent = book.genre || 'GENEL';
    
    const borrowSection = document.getElementById('borrow-details');
    if (book.status === 'Ödünç Verilmiş') {
        borrowSection.classList.remove('hidden');
    } else {
        borrowSection.classList.add('hidden');
    }

    const actionsDiv = document.getElementById('modal-actions');
    if (idToken) {
        actionsDiv.innerHTML = `
            <button onclick="openEditBookModal('${book.id}'); closeBookModal()" class="flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-medium hover:bg-slate-200 transition">Düzenle</button>
            <button onclick="deleteBook('${book.id}'); closeBookModal()" class="flex-1 bg-red-50 text-red-600 py-3 rounded-lg font-medium hover:bg-red-100 transition">Sil</button>
        `;
    } else {
        actionsDiv.innerHTML = `<p class="text-sm text-slate-400 w-full text-center">İşlem yapmak için giriş yapmalısınız.</p>`;
    }

    document.getElementById('book-modal').classList.remove('hidden');
}
function closeBookModal() { document.getElementById('book-modal').classList.add('hidden'); }

function openAddBookModal() { 
    if(!idToken) { showLoginModal(); return; }
    document.getElementById('add-book-modal').classList.remove('hidden'); 
}
function closeAddBookModal() { document.getElementById('add-book-modal').classList.add('hidden'); }

document.getElementById('add-book-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newBook = {
        id: Date.now().toString(),
        title: document.getElementById('new-book-title').value,
        author: document.getElementById('new-book-author').value,
        cover: document.getElementById('new-book-cover').value,
        description: document.getElementById('new-book-desc').value,
        genre: document.getElementById('new-book-genre').value,
        isbn: document.getElementById('new-book-isbn').value
    };
    saveBookToBackend(newBook);
    closeAddBookModal();
    e.target.reset();
});

function openEditBookModal(id) {
    const book = books.find(b => b.id.toString() === id.toString());
    if (!book) return;

    document.getElementById('edit-book-id').value = book.id;
    document.getElementById('edit-book-title').value = book.title;
    document.getElementById('edit-book-author').value = book.author;
    document.getElementById('edit-book-cover').value = book.cover;
    document.getElementById('edit-book-genre').value = book.genre;
    document.getElementById('edit-book-isbn').value = book.isbn;
    document.getElementById('edit-book-desc').value = book.description;
    document.getElementById('edit-book-status').value = book.status || 'Müsait';

    document.getElementById('edit-book-modal').classList.remove('hidden');
}
function closeEditBookModal() { document.getElementById('edit-book-modal').classList.add('hidden'); }

document.getElementById('edit-book-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const updatedBook = {
        id: document.getElementById('edit-book-id').value,
        title: document.getElementById('edit-book-title').value,
        author: document.getElementById('edit-book-author').value,
        cover: document.getElementById('edit-book-cover').value,
        description: document.getElementById('edit-book-desc').value,
        genre: document.getElementById('edit-book-genre').value,
        isbn: document.getElementById('edit-book-isbn').value,
        status: document.getElementById('edit-book-status').value
    };
    saveBookToBackend(updatedBook);
    closeEditBookModal();
});

function deleteBook(id) {
    if(confirm("Bu kitabı kalıcı olarak silmek istediğinize emin misiniz?")) {
        deleteBookFromBackend(id);
    }
}

function showLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('login-modal').classList.add('hidden'); }
function showRegisterModal() { document.getElementById('register-modal').classList.remove('hidden'); }
function closeRegisterModal() { document.getElementById('register-modal').classList.add('hidden'); }
function closeVerifyModal() { document.getElementById('verify-modal').classList.add('hidden'); }
function enableDemoMode() { closeLoginModal(); alert("Demo modu: Sadece görüntüleme yapabilirsiniz."); }

// --- AI CHAT ---
function toggleChat() { 
    const w = document.getElementById('chat-widget');
    w.classList.toggle('closed'); w.classList.toggle('open');
}

document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = document.getElementById('message-input');
    const msg = inp.value.trim();
    if (!msg) return;
    
    addMessage(msg, 'user');
    inp.value = '';
    const loadId = addLoading();

    try {
        const res = await fetch(`${CONFIG.apiUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        removeMessage(loadId);
        addMessage(data.response || data.message || "Anlaşılamadı.", 'bot');
    } catch (err) {
        removeMessage(loadId);
        addMessage("Bağlantı hatası.", 'bot');
    }
});

function addMessage(text, sender) {
    const msgs = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    const bubbleColor = sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800';
    div.innerHTML = `<div class="${bubbleColor} rounded-2xl ${sender === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'} py-3 px-4 max-w-[85%] shadow-sm text-sm"><p>${text}</p></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}
function addLoading() {
    const id = 'l-'+Date.now();
    const msgs = document.getElementById('messages');
    const div = document.createElement('div'); div.id = id; div.className = 'flex justify-start';
    div.innerHTML = `<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none py-3 px-4 shadow-sm"><div class="flex space-x-1"><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.4s"></div></div></div>`;
    msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
    return id;
}
function removeMessage(id) { document.getElementById(id)?.remove(); }

// --- AUTH HANDLERS ---
document.getElementById('register-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value;
    const e_mail = document.getElementById('reg-email').value;
    const p = document.getElementById('reg-password').value;
    const errDiv = document.getElementById('register-error');

    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const attributeList = [ new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: e_mail }) ];

    userPool.signUp(u, p, attributeList, null, (err, result) => {
        if (err) { errDiv.textContent = err.message || JSON.stringify(err); errDiv.classList.remove('hidden'); return; }
        closeRegisterModal();
        document.getElementById('verify-username').value = u;
        document.getElementById('verify-modal').classList.remove('hidden');
    });
});

document.getElementById('verify-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('verify-username').value;
    const code = document.getElementById('verify-code').value;
    const errDiv = document.getElementById('verify-error');

    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: u, Pool: userPool });

    cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) { errDiv.textContent = err.message || JSON.stringify(err); errDiv.classList.remove('hidden'); return; }
        closeVerifyModal();
        alert("Hesap doğrulandı!");
        showLoginModal();
    });
});

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    try { await authenticate(u, p); closeLoginModal(); } catch (err) {
        const errDiv = document.getElementById('login-error');
        errDiv.textContent = "Hata: " + (err.message || err); errDiv.classList.remove('hidden');
    }
});

// 👇 DÜZELTİLEN YER: Login olunca username'i kaydet
function authenticate(username, password) {
    return new Promise((resolve, reject) => {
        const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
        const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: username, Pool: userPool });
        cognitoUser.authenticateUser(new AmazonCognitoIdentity.AuthenticationDetails({ Username: username, Password: password }), {
            onSuccess: function(result) {
                idToken = result.getIdToken().getJwtToken();
                currentUsername = username; // SABİT ADI ALDIK
                updateAuthUI(true, username);
                fetchFavorites();
                resolve();
            },
            onFailure: function(err) { reject(err); },
            newPasswordRequired: function() { reject({ message: "Yeni şifre gerekli." }); }
        });
    });
}

// 👇 DÜZELTİLEN YER: Sayfa yenilenince username'i hatırla
function checkAuthStatus() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
        currentUser.getSession(function(err, session) {
            if (session.isValid()) {
                idToken = session.getIdToken().getJwtToken();
                currentUsername = currentUser.getUsername(); // SABİT ADI ALDIK
                updateAuthUI(true, currentUser.getUsername());
                fetchFavorites();
            }
        });
    }
}

function logout() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const currentUser = userPool.getCurrentUser();
    if (currentUser) currentUser.signOut();
    idToken = null; 
    currentUsername = null; // SIFIRLA
    favorites = []; 
    updateAuthUI(false); 
    renderBooks();
}

function updateAuthUI(isLoggedIn, username = "") {
    const loginBtn = document.getElementById('login-btn-nav');
    const userInfo = document.getElementById('user-info');
    if (isLoggedIn) {
        loginBtn.classList.add('hidden'); userInfo.classList.remove('hidden');
        document.getElementById('user-name-display').textContent = username;
    } else {
        loginBtn.classList.remove('hidden'); userInfo.classList.add('hidden');
    }
}