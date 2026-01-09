// --- AYARLAR ---
const CONFIG = {
    userPoolId: 'eu-north-1_mSgPpFbTd', 
    clientId: '358evs3lh5npe0nea2uiu9tp5i', 
    apiUrl: 'https://f2s450v279.execute-api.eu-north-1.amazonaws.com/dev' 
};

// --- YÖNETİCİ AYARI ---
// Bu kullanıcı adıyla giriş yaparsan SÜPER YETKİLİ olursun.
const ADMIN_USERNAME = "admin"; 

// --- DEĞİŞKENLER ---
let books = [];
let idToken = null; 
let currentUsername = null; 
let isAdmin = false; 

// --- BAŞLANGIÇ ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus(); 
    fetchBooks();
});

// ==========================================
// 1. EKRAN YÖNETİMİ
// ==========================================
function switchView(viewName) {
    document.getElementById('view-library').classList.add('hidden');
    document.getElementById('view-all-lists').classList.add('hidden');
    document.getElementById('view-single-list').classList.add('hidden');
    document.getElementById('view-admin').classList.add('hidden');

    if (viewName === 'library') {
        document.getElementById('view-library').classList.remove('hidden');
    } else if (viewName === 'lists') {
        document.getElementById('view-all-lists').classList.remove('hidden');
    } else if (viewName === 'detail') {
        document.getElementById('view-single-list').classList.remove('hidden');
    } else if (viewName === 'admin') {
        if(!isAdmin) { alert("Bu sayfaya erişim yetkiniz yok!"); showLibraryView(); return; }
        document.getElementById('view-admin').classList.remove('hidden');
        loadAdminDashboard(); 
    }
}

function showLibraryView() { switchView('library'); fetchBooks(); }
function showReadingLists() { getReadingLists(); }
function showAdminDashboard() { switchView('admin'); }
function showFavorites() { 
    alert("Favoriler artık 'Koleksiyonlarım' altında yönetiliyor."); 
    showReadingLists(); 
}

// ==========================================
// 2. KİTAP İŞLEMLERİ (DÜZELTİLEN KISIM)
// ==========================================
async function fetchBooks() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books`);
        books = await response.json();
        renderBooks(books);
    } catch (err) { console.error(err); }
}

// 👇 YENİ FONKSİYON: Butona tıklayınca bu çalışacak (Form submit yerine)
async function submitAddBook() {
    // 1. Yetki Kontrolü
    if (!isAdmin) { 
        alert("⛔️ Yetkisiz İşlem: Sadece yöneticiler kitap ekleyebilir."); 
        return; 
    }

    // 2. Verileri Inputlardan Al
    const title = document.getElementById('new-book-title').value;
    const author = document.getElementById('new-book-author').value;
    const cover = document.getElementById('new-book-cover').value;
    const genre = document.getElementById('new-book-genre').value;
    const desc = document.getElementById('new-book-desc').value;
    const isbn = document.getElementById('new-book-isbn').value; // İsteğe bağlı

    // 3. Boş Alan Kontrolü
    if(!title || !author || !cover) {
        alert("Lütfen Kitap Adı, Yazar ve Kapak Resmi alanlarını doldurun.");
        return;
    }

    const newBook = {
        id: Date.now().toString(),
        title: title, 
        author: author, 
        cover: cover, 
        description: desc, 
        genre: genre,
        isbn: isbn
    };

    // 4. API'ye Gönder
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newBook)
        });
        
        if (response.ok) { 
            await fetchBooks(); 
            closeAddBookModal();
            // Formu temizle
            document.getElementById('new-book-title').value = '';
            document.getElementById('new-book-author').value = '';
            document.getElementById('new-book-cover').value = '';
            document.getElementById('new-book-desc').value = '';
            document.getElementById('new-book-isbn').value = '';
            alert("Kitap başarıyla eklendi! 🎉"); 
        } else {
            alert("Sunucu hatası oluştu.");
        }
    } catch (err) { alert("Hata: " + err.message); }
}

// Kitap Ekleme için eski fonksiyonu (saveBookToBackend) kaldırdık, 
// yukarıdaki submitAddBook artık her şeyi yapıyor.

async function deleteBookFromBackend(id) {
    if (!isAdmin) { alert("Yetkisiz işlem."); return; }
    try {
        const response = await fetch(`${CONFIG.apiUrl}/books/${id}`, { method: 'DELETE' });
        if (response.ok) { alert("Kitap silindi."); fetchBooks(); }
    } catch (err) { alert("Hata: " + err.message); }
}

// ==========================================
// 3. ADMİN PANELİ
// ==========================================
async function loadAdminDashboard() {
    document.getElementById('admin-total-books').textContent = books.length;
    try {
        const res = await fetch(`${CONFIG.apiUrl}/reading-lists`);
        const allLists = await res.json();
        const validLists = allLists.filter(l => l.name && l.name !== 'undefined');
        
        document.getElementById('admin-total-lists').textContent = validLists.length;
        const uniqueUsers = [...new Set(validLists.map(l => l.userId))];
        document.getElementById('admin-total-users').textContent = uniqueUsers.length;

        const usersTable = document.getElementById('admin-users-table');
        usersTable.innerHTML = uniqueUsers.map(u => `
            <tr class="bg-white border-b hover:bg-slate-50">
                <td class="px-6 py-4 font-medium">${u}</td>
                <td class="px-6 py-4"><span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Aktif</span></td>
            </tr>`).join('');

        const listsTable = document.getElementById('admin-lists-table');
        listsTable.innerHTML = validLists.map(list => `
            <tr class="bg-white border-b hover:bg-slate-50">
                <td class="px-6 py-4 font-bold text-slate-700">${list.name}</td>
                <td class="px-6 py-4 text-xs text-slate-500">${list.userId}</td>
                <td class="px-6 py-4">${list.bookIds ? list.bookIds.length : 0} Kitap</td>
                <td class="px-6 py-4 text-xs">${new Date(list.createdAt).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="openListDetails('${list.id}', '${list.name}', '', '', '${list.userId}')" class="text-blue-600 hover:underline mr-3 text-xs font-bold">GİT</button>
                    <button onclick="deleteReadingList('${list.id}')" class="text-red-600 hover:underline text-xs font-bold">SİL</button>
                </td>
            </tr>`).join('');
    } catch (err) { console.error("Admin verisi hatası", err); }
}

// ==========================================
// 4. KOLEKSİYONLAR
// ==========================================
async function getReadingLists() {
    if (!currentUsername) { alert("Lütfen giriş yapın."); showLoginModal(); return; }
    switchView('lists');
    const grid = document.getElementById('lists-grid');
    grid.innerHTML = '<div class="col-span-full text-center py-12"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600 mx-auto"></div></div>';

    try {
        const response = await fetch(`${CONFIG.apiUrl}/reading-lists`);
        const allLists = await response.json();
        // Sadece benim listelerim (Admin olsam bile koleksiyonlar sayfasında kendi listemi göreyim)
        const myLists = allLists.filter(l => l.userId === currentUsername && l.name && l.name !== 'undefined');
        renderAllLists(myLists);
    } catch (err) { console.error(err); }
}

function renderAllLists(lists) {
    const grid = document.getElementById('lists-grid');
    const emptyState = document.getElementById('no-lists-state');
    grid.innerHTML = '';

    if (!lists || lists.length === 0) {
        if(emptyState) emptyState.classList.remove('hidden');
        return;
    }
    if(emptyState) emptyState.classList.add('hidden');

    grid.innerHTML = lists.map(list => `
        <div onclick="openListDetails('${list.id}', '${list.name}', '${list.description || ''}', '${list.createdAt || ''}', '${list.userId}')" 
             class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-lg hover:border-violet-300 cursor-pointer transition group">
            <div class="flex justify-between items-start mb-4">
                <div class="bg-violet-50 w-12 h-12 rounded-xl flex items-center justify-center text-violet-600"><i class="fas fa-layer-group"></i></div>
                <span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full font-bold">${list.bookIds ? list.bookIds.length : 0} Kitap</span>
            </div>
            <h3 class="text-xl font-bold text-slate-800 mb-1">${list.name}</h3>
            <p class="text-xs text-slate-400">Oluşturan: ${list.userId === currentUsername ? 'Sen' : list.userId}</p>
        </div>`).join('');
}

async function createReadingList() {
    if (!currentUsername) { alert("Giriş yapın."); showLoginModal(); return; }
    const listName = prompt("Koleksiyon Adı:");
    if (!listName) return;
    const newListData = { userId: currentUsername, name: listName, description: "Kullanıcı koleksiyonu", bookIds: [] };
    try {
        const response = await fetch(`${CONFIG.apiUrl}/reading-lists`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newListData)
        });
        if (response.ok) {
            if (document.getElementById('add-to-folder-modal') && !document.getElementById('add-to-folder-modal').classList.contains('hidden')) {
                 openAddToFolderModal(selectedBookForFolder);
            } else {
                 getReadingLists();
            }
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// 5. DETAY SAYFASI
// ==========================================
async function openListDetails(listId, name, desc, date, ownerId) {
    switchView('detail');
    document.getElementById('detail-list-name').textContent = name;
    document.getElementById('detail-owner').textContent = (ownerId === currentUsername) ? "Sen" : ownerId;
    
    const deleteBtn = document.getElementById('btn-delete-list');
    if (isAdmin || ownerId === currentUsername) {
        deleteBtn.classList.remove('hidden');
        deleteBtn.replaceWith(deleteBtn.cloneNode(true));
        document.getElementById('btn-delete-list').onclick = () => deleteReadingList(listId);
    } else {
        deleteBtn.classList.add('hidden');
    }

    const grid = document.getElementById('detail-books-grid');
    grid.innerHTML = '<p class="col-span-full text-center py-10 text-slate-400">Yükleniyor...</p>';

    try {
        const listsRes = await fetch(`${CONFIG.apiUrl}/reading-lists`);
        const allLists = await listsRes.json();
        const currentList = allLists.find(l => String(l.id) === String(listId));
        if (!currentList) { grid.innerHTML = 'Liste bulunamadı.'; return; }
        document.getElementById('detail-book-count').textContent = currentList.bookIds ? currentList.bookIds.length : 0;

        const booksRes = await fetch(`${CONFIG.apiUrl}/books`);
        const allBooks = await booksRes.json();
        const listBooks = allBooks.filter(book => (currentList.bookIds || []).includes(String(book.id)));
        renderListBooks(listBooks, listId, ownerId); 
    } catch (err) { console.error(err); }
}

function renderListBooks(bookList, listId, ownerId) {
    const grid = document.getElementById('detail-books-grid');
    if (bookList.length === 0) { grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500">Liste boş.</div>`; return; }
    grid.innerHTML = bookList.map(book => `
        <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group">
            <div class="h-48 relative bg-slate-50 p-4 flex justify-center"><img src="${book.cover}" class="h-full object-contain shadow-md transition group-hover:scale-105"></div>
            <div class="p-4 flex-1 flex flex-col"><h4 class="font-bold text-slate-900 line-clamp-1">${book.title}</h4><p class="text-slate-500 text-sm mb-4">${book.author}</p>
                ${(isAdmin || ownerId === currentUsername) ? `<button onclick="removeItemFromList('${listId}', '${book.id}', '${ownerId}')" class="mt-auto w-full py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 text-sm font-bold">Listeden Çıkar</button>` : ''}
            </div>
        </div>`).join('');
}

async function removeItemFromList(listId, bookId, ownerId) {
    if(!confirm("Kitabı çıkarmak istiyor musun?")) return;
    await toggleBookInFolder(listId, bookId, true); 
    const name = document.getElementById('detail-list-name').textContent;
    openListDetails(listId, name, '', '', ownerId);
}

async function deleteReadingList(listId) {
    if (!confirm("Bu listeyi silmek istediğine emin misin?")) return;
    try {
        const response = await fetch(`${CONFIG.apiUrl}/reading-lists/${listId}`, { method: "DELETE" });
        if (response.ok) { 
            alert("Liste silindi."); 
            if(document.getElementById('view-admin').classList.contains('hidden')) getReadingLists();
            else loadAdminDashboard();
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// 6. ANA SAYFA KİTAP LİSTELEME
// ==========================================
function renderBooks(bookList) {
    const grid = document.getElementById('book-grid');
    if(!grid) return;
    const heroAddBtn = document.getElementById('btn-add-book-hero');
    if(heroAddBtn) { if(isAdmin) heroAddBtn.classList.remove('hidden'); else heroAddBtn.classList.add('hidden'); }

    grid.innerHTML = bookList.map(book => `
        <div class="book-card bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full relative group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div class="h-72 overflow-hidden relative bg-slate-50 flex items-center justify-center p-6"><img src="${book.cover || 'https://placehold.co/300x450'}" class="max-h-full object-contain shadow-lg transition duration-500 group-hover:scale-105">
                <div class="absolute top-3 right-3 z-20 translate-x-10 group-hover:translate-x-0 transition duration-300"><button onclick="openAddToFolderModal('${book.id}')" class="bg-white/90 backdrop-blur-md w-10 h-10 rounded-full shadow-lg hover:bg-violet-600 hover:text-white transition text-violet-600 flex items-center justify-center"><i class="far fa-bookmark"></i></button></div>
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-300 flex items-center justify-center gap-3 z-10 backdrop-blur-[2px]">
                    <button onclick="openBookDetails('${book.id}')" class="bg-white text-slate-900 px-5 py-2.5 rounded-full font-bold text-sm hover:scale-105 transition shadow-lg">İncele</button>
                    ${isAdmin ? `<button onclick="openEditBookModal('${book.id}')" class="bg-slate-800 text-white w-10 h-10 rounded-full hover:bg-black transition flex items-center justify-center"><i class="fas fa-edit"></i></button>` : ''}
                </div>
            </div>
            <div class="p-5 flex-1 flex flex-col"><span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-violet-50 text-violet-600 mb-2 block w-fit">${book.genre || 'Genel'}</span><h3 class="text-lg font-bold text-slate-800 mb-1 line-clamp-1">${book.title}</h3><p class="text-slate-500 text-sm">${book.author}</p></div>
        </div>`).join('');
}

function filterBooks() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    const genreFilter = document.getElementById('genre-filter')?.value || '';
    const filtered = books.filter(book => {
        const matchesSearch = (book.title || '').toLowerCase().includes(searchTerm) || (book.author || '').toLowerCase().includes(searchTerm);
        const matchesGenre = genreFilter === '' || book.genre === genreFilter;
        return matchesSearch && matchesGenre;
    });
    renderBooks(filtered);
}
function toggleFilterDropdown() { document.getElementById('filter-dropdown').classList.toggle('hidden'); }

// ==========================================
// 7. KLASÖRE EKLEME (BOOKMARK)
// ==========================================
let selectedBookForFolder = null; 
async function openAddToFolderModal(bookId) {
    if (!currentUsername) { alert("Giriş yapın."); showLoginModal(); return; }
    selectedBookForFolder = bookId;
    document.getElementById('add-to-folder-modal').classList.remove('hidden');
    const container = document.getElementById('folder-selection-list');
    container.innerHTML = '<div class="text-center py-4"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600 mx-auto"></div></div>';
    
    try {
        const response = await fetch(`${CONFIG.apiUrl}/reading-lists`);
        const allLists = await response.json();
        const myLists = allLists.filter(l => l.userId === currentUsername && l.name && l.name !== 'undefined');
        if (myLists.length === 0) { container.innerHTML = '<p class="text-center text-sm text-slate-400">Henüz listen yok.</p>'; return; }
        container.innerHTML = myLists.map(list => {
            const isAdded = list.bookIds && list.bookIds.includes(String(bookId));
            return `
            <div onclick="toggleBookInFolder('${list.id}', '${bookId}', ${isAdded})" 
                 class="flex items-center justify-between p-3 border rounded-xl cursor-pointer mb-2 transition ${isAdded ? 'bg-green-50 border-green-200' : 'hover:bg-slate-50 border-slate-100'}">
                <div class="flex items-center gap-3">
                    <i class="fas fa-folder text-violet-500"></i>
                    <span class="font-bold text-sm text-slate-700">${list.name}</span>
                </div>
                ${isAdded ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="far fa-circle text-slate-300"></i>'}
            </div>`;
        }).join('');
    } catch (err) { console.error(err); }
}

function closeFolderModal() { document.getElementById('add-to-folder-modal').classList.add('hidden'); }

async function toggleBookInFolder(listId, bookId, isAdded) {
    const action = isAdded ? "remove" : "add"; 
    await fetch(`${CONFIG.apiUrl}/reading-lists/${listId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, bookId: String(bookId) }) });
    if(!document.getElementById('add-to-folder-modal').classList.contains('hidden')) openAddToFolderModal(bookId);
}

// ==========================================
// 8. MODAL YÖNETİMİ
// ==========================================
function openBookDetails(id) {
    const book = books.find(b => b.id.toString() === id.toString());
    if (!book) return;
    document.getElementById('modal-book-image').src = book.cover;
    document.getElementById('modal-book-title').textContent = book.title;
    document.getElementById('modal-book-author').textContent = book.author;
    document.getElementById('modal-book-desc').textContent = book.description || "-";
    document.getElementById('modal-book-isbn').textContent = book.isbn || '-';
    
    const actionsDiv = document.getElementById('modal-actions');
    if (isAdmin) {
        actionsDiv.innerHTML = `<button onclick="openEditBookModal('${book.id}'); closeBookModal()" class="flex-1 bg-slate-800 text-white py-2 rounded-lg">Düzenle</button><button onclick="deleteBookFromBackend('${book.id}'); closeBookModal()" class="flex-1 bg-red-600 text-white py-2 rounded-lg">Sil</button>`;
    } else {
        actionsDiv.innerHTML = `<button onclick="openAddToFolderModal('${book.id}'); closeBookModal()" class="w-full bg-violet-600 text-white py-3 rounded-lg hover:bg-violet-700 font-bold transition">Koleksiyona Ekle</button>`;
    }
    document.getElementById('book-modal').classList.remove('hidden');
}

function closeBookModal() { document.getElementById('book-modal').classList.add('hidden'); }

function openAddBookModal() { 
    if(!currentUsername) { alert("Önce giriş yapmalısınız."); showLoginModal(); return; }
    document.getElementById('add-book-modal').classList.remove('hidden'); 
}
function closeAddBookModal() { document.getElementById('add-book-modal').classList.add('hidden'); }

// DİKKAT: Eski event listener kaldırıldı. HTML'deki onclick="submitAddBook()" çalışacak.

function openEditBookModal(id) {
    const book = books.find(b => b.id.toString() === id.toString());
    if (!book) return;
    document.getElementById('edit-book-id').value = book.id;
    document.getElementById('edit-book-title').value = book.title;
    document.getElementById('edit-book-author').value = book.author;
    document.getElementById('edit-book-cover').value = book.cover;
    document.getElementById('edit-book-desc').value = book.description;
    document.getElementById('edit-book-genre').value = book.genre;
    document.getElementById('edit-book-isbn').value = book.isbn;
    document.getElementById('edit-book-modal').classList.remove('hidden');
}
function closeEditBookModal() { document.getElementById('edit-book-modal').classList.add('hidden'); }

// Edit işlemi için de yeni bir fonksiyon (opsiyonel, şimdilik listener kalsın çünkü sorun add-book'taydı)
document.getElementById('edit-book-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    // Admin değilse durdur (Backend'de de kontrol var ama UI için ek güvenlik)
    if (!isAdmin) { alert("Yetkisiz işlem."); return; }

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
    
    // Eski save fonksiyonu yerine fetch ile gönderiyoruz
    fetch(`${CONFIG.apiUrl}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBook)
    }).then(async (res) => {
        if(res.ok) {
            await fetchBooks();
            closeEditBookModal();
            alert("Kitap güncellendi.");
        } else {
            alert("Güncelleme başarısız.");
        }
    }).catch(err => alert("Hata: " + err.message));
});

// ==========================================
// 9. AUTHENTICATION (KAYIT & GİRİŞ & DOĞRULAMA)
// ==========================================
function showLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('login-modal').classList.add('hidden'); }
function showRegisterModal() { document.getElementById('register-modal').classList.remove('hidden'); }
function closeRegisterModal() { document.getElementById('register-modal').classList.add('hidden'); }

// KAYIT OL
document.getElementById('register-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value;
    const e_mail = document.getElementById('reg-email').value;
    const p = document.getElementById('reg-password').value;
    const errDiv = document.getElementById('register-error');

    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const attributeList = [ new AmazonCognitoIdentity.CognitoUserAttribute({ Name: 'email', Value: e_mail }) ];

    userPool.signUp(u, p, attributeList, null, (err, result) => {
        if (err) { if(errDiv) { errDiv.textContent = err.message; errDiv.classList.remove('hidden'); } return; }
        closeRegisterModal();
        document.getElementById('verify-username').value = u;
        document.getElementById('verify-modal').classList.remove('hidden');
    });
});

// DOĞRULAMA
document.getElementById('verify-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('verify-username').value;
    const code = document.getElementById('verify-code').value;
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: u, Pool: userPool });

    cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) { alert("Hata: " + err.message); return; }
        document.getElementById('verify-modal').classList.add('hidden');
        alert("Hesap doğrulandı! Giriş yapabilirsiniz.");
        showLoginModal();
    });
});

// GİRİŞ YAP
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser({ Username: u, Pool: userPool });
    
    cognitoUser.authenticateUser(new AmazonCognitoIdentity.AuthenticationDetails({ Username: u, Password: p }), {
        onSuccess: function(result) {
            idToken = result.getIdToken().getJwtToken();
            currentUsername = u;
            isAdmin = (u.toLowerCase() === ADMIN_USERNAME.toLowerCase()); 
            updateAuthUI(true, u);
            closeLoginModal();
            fetchBooks(); 
        },
        onFailure: function(err) { alert("Giriş Hatası: " + err.message); },
        newPasswordRequired: function() { alert("Yeni şifre gerekli."); }
    });
});

function checkAuthStatus() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
        currentUser.getSession(function(err, session) {
            if (session.isValid()) {
                idToken = session.getIdToken().getJwtToken();
                currentUsername = currentUser.getUsername();
                isAdmin = (currentUsername.toLowerCase() === ADMIN_USERNAME.toLowerCase());
                updateAuthUI(true, currentUsername);
            }
        });
    }
}

function logout() {
    const userPool = new AmazonCognitoIdentity.CognitoUserPool({ UserPoolId: CONFIG.userPoolId, ClientId: CONFIG.clientId });
    const currentUser = userPool.getCurrentUser();
    if (currentUser) currentUser.signOut();
    idToken = null; currentUsername = null; isAdmin = false;
    updateAuthUI(false);
    fetchBooks();
    showLibraryView();
    alert("Çıkış yapıldı.");
}

function updateAuthUI(isLoggedIn, username = "") {
    const loginBtn = document.getElementById('login-btn-nav');
    const userInfo = document.getElementById('user-info');
    const adminLink = document.getElementById('admin-link');
    
    if (isLoggedIn) {
        loginBtn.classList.add('hidden'); 
        userInfo.classList.remove('hidden');
        if(document.getElementById('user-name-display')) document.getElementById('user-name-display').textContent = username;
        
        if(isAdmin && adminLink) adminLink.classList.remove('hidden');
        else if(adminLink) adminLink.classList.add('hidden');
    } else {
        loginBtn.classList.remove('hidden'); 
        userInfo.classList.add('hidden');
        if(adminLink) adminLink.classList.add('hidden');
    }
}

// --- CHAT ---
function toggleChat() { 
    const w = document.getElementById('chat-widget');
    if(w) { w.classList.toggle('closed'); w.classList.toggle('open'); }
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
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        removeMessage(loadId);
        addMessage(data.response || "...", 'bot');
    } catch (err) { removeMessage(loadId); addMessage("Hata.", 'bot'); }
});

function addMessage(text, sender) {
    const msgs = document.getElementById('messages');
    if(!msgs) return;
    const div = document.createElement('div');
    div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    const bubbleColor = sender === 'user' ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-800';
    div.innerHTML = `<div class="${bubbleColor} rounded-2xl ${sender === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'} py-3 px-4 max-w-[85%] shadow-sm text-sm"><p>${text}</p></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}
function addLoading() {
    const id = 'l-'+Date.now();
    const msgs = document.getElementById('messages');
    if(!msgs) return;
    const div = document.createElement('div'); div.id = id; div.className = 'flex justify-start';
    div.innerHTML = `<div class="bg-white border border-slate-200 rounded-2xl rounded-tl-none py-3 px-4 shadow-sm"><div class="flex space-x-1"><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.4s"></div></div></div>`;
    msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
    return id;
}
function removeMessage(id) { const el = document.getElementById(id); if(el) el.remove(); }