// IndexedDB setup
const DB_NAME = 'CristalNotesDB';
const DB_VERSION = 2;
const NOTES_STORE = 'notes';
const LINKS_STORE = 'links';

let db;
let dbInitialized = false;

// Initialize database
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Error opening database:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            dbInitialized = true;
            console.log('Database initialized successfully');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(NOTES_STORE)) {
                const noteStore = db.createObjectStore(NOTES_STORE, { keyPath: 'id', autoIncrement: true });
                noteStore.createIndex('title', 'title', { unique: false });
                noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(LINKS_STORE)) {
                const linkStore = db.createObjectStore(LINKS_STORE, { keyPath: 'id', autoIncrement: true });
                linkStore.createIndex('url', 'url', { unique: true });
                linkStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };
    });
}

// DOM Elements
const notesListEl = document.getElementById('notesList');
const linksListEl = document.querySelector('#linksPanel #linksList');
const noteTitleEl = document.getElementById('noteTitle');
const noteContentEl = document.getElementById('noteContent');
const reminderDateEl = document.getElementById('reminderDate');
const saveNoteBtn = document.getElementById('saveNoteBtn');
const copyNoteBtn = document.getElementById('copyNoteBtn');
const deleteNoteBtn = document.getElementById('deleteNoteBtn');
const newNoteBtn = document.getElementById('newNoteBtn');
const searchInput = document.getElementById('searchInput');
const themeToggle = document.getElementById('themeToggle');
const exportNotesBtn = document.getElementById('exportNotesBtn');
const importNotesBtn = document.getElementById('importNotesBtn');
const importFileInput = document.getElementById('importFileInput');

let currentNoteId = null;
let currentLinkId = null;

// --- Theme Manager ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeIcon = themeToggle.querySelector('i');
    themeIcon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// --- Event Listeners ---
function setupEventListeners() {
    themeToggle.addEventListener('click', toggleTheme);
    newNoteBtn.addEventListener('click', createNewNote);
    saveNoteBtn.addEventListener('click', saveNoteOrLink);
    copyNoteBtn.addEventListener('click', copyNoteContent);
    deleteNoteBtn.addEventListener('click', deleteNoteOrLink);
    searchInput.addEventListener('input', () => loadNotes(searchInput.value));
    exportNotesBtn.addEventListener('click', exportNotes);
    importNotesBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importNotes);
}

// --- Core App Logic ---

document.addEventListener('DOMContentLoaded', () => {
    initDB().then(() => {
        setupEventListeners();
        initTheme();
        loadNotes();
        loadLinks();
        checkReminders();
        noteTitleEl.focus();
    }).catch(error => {
        console.error('Failed to initialize database:', error);
        showToast('Error al inicializar la base de datos', 'danger');
    });
});

function createNewNote() {
    currentNoteId = null;
    currentLinkId = null;
    noteTitleEl.value = '';
    noteContentEl.value = '';
    reminderDateEl.value = '';
    clearActiveNote();
    noteTitleEl.focus();
}

function saveNoteOrLink() {
    if (!dbInitialized) return showToast('Base de datos no inicializada', 'danger');

    const title = noteTitleEl.value.trim();
    const content = noteContentEl.value.trim();

    if (!title && !content) {
        return showToast('La nota o el enlace no puede estar vacío', 'warning');
    }

    if (currentLinkId) {
        updateLink(currentLinkId, title, content);
    } else if (isURL(content)) {
        saveLink(title || 'Enlace sin título', content);
    } else {
        saveNote(title || 'Sin título', content);
    }
}

function saveNote(title, content) {
    const transaction = db.transaction([NOTES_STORE], 'readwrite');
    const objectStore = transaction.objectStore(NOTES_STORE);

    const note = {
        title,
        content,
        reminder: reminderDateEl.value,
        updatedAt: new Date()
    };

    let request;
    if (currentNoteId) {
        note.id = currentNoteId;
        request = objectStore.put(note);
    } else {
        note.createdAt = new Date();
        request = objectStore.add(note);
    }

    request.onsuccess = (event) => {
        if (!currentNoteId) currentNoteId = event.target.result;
        loadNotes();
        showToast('Nota guardada correctamente', 'success');
    };
    request.onerror = (event) => {
        console.error('Error saving note:', event.target.error);
        showToast('Error al guardar la nota', 'danger');
    };
}

function saveLink(title, url) {
    const transaction = db.transaction([LINKS_STORE], 'readwrite');
    const objectStore = transaction.objectStore(LINKS_STORE);
    const urlIndex = objectStore.index('url');

    const formattedUrl = formatURL(url);

    const getRequest = urlIndex.get(formattedUrl);
    getRequest.onsuccess = (event) => {
        const existingLink = event.target.result;
        const link = {
            title,
            url: formattedUrl,
            updatedAt: new Date()
        };

        let request;
        if (existingLink) {
            link.id = existingLink.id;
            link.createdAt = existingLink.createdAt;
            request = objectStore.put(link);
        } else {
            link.createdAt = new Date();
            request = objectStore.add(link);
        }

        request.onsuccess = () => {
            loadLinks();
            createNewNote();
            showToast('Enlace guardado correctamente', 'success');
        };
        request.onerror = (e) => {
            console.error('Error saving link:', e.target.error);
            showToast('Error al guardar el enlace', 'danger');
        };
    };
}

function updateLink(id, title, url) {
    const transaction = db.transaction([LINKS_STORE], 'readwrite');
    const objectStore = transaction.objectStore(LINKS_STORE);
    const request = objectStore.get(id);

    request.onsuccess = (event) => {
        const link = event.target.result;
        if (link) {
            link.title = title;
            link.url = formatURL(url);
            link.updatedAt = new Date();

            const updateRequest = objectStore.put(link);
            updateRequest.onsuccess = () => {
                createNewNote();
                loadLinks();
                showToast('Enlace actualizado correctamente', 'success');
            };
            updateRequest.onerror = (e) => {
                console.error('Error updating link:', e.target.error);
                showToast('Error al actualizar el enlace', 'danger');
            };
        }
    };
}

function deleteNoteOrLink() {
    if (currentLinkId) {
        deleteItem(LINKS_STORE, currentLinkId, 'Enlace eliminado', loadLinks);
    } else if (currentNoteId) {
        deleteItem(NOTES_STORE, currentNoteId, 'Nota eliminada', loadNotes);
    } else {
        showToast('No hay nada seleccionado para eliminar', 'warning');
    }
}

function deleteItem(storeName, id, message, callback) {
    if (!confirm('¿Estás seguro de que quieres eliminar este elemento?')) return;

    const transaction = db.transaction([storeName], 'readwrite');
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
        createNewNote();
        callback();
        showToast(message, 'success');
    };
    request.onerror = (event) => {
        console.error(`Error deleting item from ${storeName}:`, event.target.error);
        showToast('Error al eliminar', 'danger');
    };
}

function loadNotes(query = '') {
    if (!dbInitialized) return;
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const objectStore = transaction.objectStore(NOTES_STORE);
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        let notes = event.target.result;
        if (query) {
            const lowerQuery = query.toLowerCase();
            notes = notes.filter(note =>
                note.title.toLowerCase().includes(lowerQuery) ||
                note.content.toLowerCase().includes(lowerQuery)
            );
        }
        notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        displayNotes(notes);
    };
    request.onerror = (event) => console.error('Error loading notes:', event.target.error);
}

function loadLinks() {
    if (!dbInitialized) return;
    const transaction = db.transaction([LINKS_STORE], 'readonly');
    const objectStore = transaction.objectStore(LINKS_STORE);
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        const links = event.target.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        displayLinks(links);
    };
    request.onerror = (event) => console.error('Error loading links:', event.target.error);
}

function displayNotes(notes) {
    notesListEl.innerHTML = '';
    if (notes.length === 0) {
        notesListEl.innerHTML = `<div class="empty-state"><i class="fas fa-sticky-note"></i><p>${searchInput.value ? 'No se encontraron notas' : 'No hay notas'}</p></div>`;
        return;
    }

    const now = new Date();
    notes.forEach(note => {
        const isCompletedReminder = note.reminder && new Date(note.reminder) < now;
        const noteEl = document.createElement('div');
        noteEl.className = `note-item ${note.id === currentNoteId ? 'active' : ''} ${note.reminder ? (isCompletedReminder ? 'completed-reminder' : 'reminder') : ''}`;
        noteEl.dataset.noteId = note.id;
        noteEl.innerHTML = `
            <h3>${escapeHTML(note.title)}</h3>
            <p>${escapeHTML(note.content.substring(0, 100))}</p>
            <div class="note-meta">
                <span>${formatDate(note.updatedAt)}</span>
                ${note.reminder ? `<i class="fas ${isCompletedReminder ? 'fa-check-circle' : 'fa-bell'} text-warning"></i>` : ''}
            </div>
        `;
        noteEl.addEventListener('click', () => loadNote(note.id));
        notesListEl.appendChild(noteEl);
    });
}

function displayLinks(links) {
    linksListEl.innerHTML = '';
    if (links.length === 0) {
        linksListEl.innerHTML = '<div class="empty-state"><i class="fas fa-link"></i><p>No hay enlaces</p></div>';
        return;
    }

    links.forEach(link => {
        const linkEl = document.createElement('div');
        linkEl.className = 'note-item';
        linkEl.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <h3 class="text-truncate" style="max-width: 80%;">${escapeHTML(link.title)}</h3>
                <button class="btn btn-sm btn-outline-secondary edit-link-btn"><i class="fas fa-edit"></i></button>
            </div>
            <div class="note-meta mt-2">
                <span>${formatDate(link.createdAt)}</span>
            </div>
        `;
        linkEl.querySelector('.edit-link-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editLink(link.id);
        });
        linkEl.addEventListener('click', () => window.open(link.url, '_blank'));
        linksListEl.appendChild(linkEl);
    });
}

function loadNote(id) {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const objectStore = transaction.objectStore(NOTES_STORE);
    const request = objectStore.get(id);

    request.onsuccess = (event) => {
        const note = event.target.result;
        if (note) {
            currentNoteId = note.id;
            currentLinkId = null;
            noteTitleEl.value = note.title;
            noteContentEl.value = note.content;
            reminderDateEl.value = note.reminder || '';
            clearActiveNote();
            document.querySelector(`[data-note-id="${note.id}"]`)?.classList.add('active');
        }
    };
}

function editLink(id) {
    const transaction = db.transaction([LINKS_STORE], 'readonly');
    const objectStore = transaction.objectStore(LINKS_STORE);
    const request = objectStore.get(id);

    request.onsuccess = (event) => {
        const link = event.target.result;
        if (link) {
            currentLinkId = link.id;
            currentNoteId = null;
            noteTitleEl.value = link.title;
            noteContentEl.value = link.url;
            reminderDateEl.value = '';
            showToast(`Editando enlace: ${link.title}`, 'info');
            const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('linksPanel'));
            offcanvas?.hide();
            noteTitleEl.focus();
        }
    };
}

// --- Utility Functions ---

function clearActiveNote() {
    document.querySelectorAll('.note-item.active').forEach(item => item.classList.remove('active'));
}

function copyNoteContent() {
    if (!noteContentEl.value.trim()) return showToast('No hay contenido para copiar', 'warning');
    navigator.clipboard.writeText(noteContentEl.value)
        .then(() => showToast('Contenido copiado', 'success'))
        .catch(() => showToast('Error al copiar', 'danger'));
}

function checkReminders() {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const objectStore = transaction.objectStore(NOTES_STORE);
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        const notes = event.target.result;
        const now = new Date();
        notes.forEach(note => {
            if (note.reminder) {
                const reminderTime = new Date(note.reminder);
                if (reminderTime > now && reminderTime <= new Date(now.getTime() + 60 * 1000)) {
                    showToast(`Recordatorio: ${note.title}`, 'info', 10000);
                }
            }
        });
        loadNotes(searchInput.value); // Refresh list to show completed reminders
    };

    setInterval(checkReminders, 60000); // Check every minute
}

function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('notificationToastContainer');
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="cristal-toast ${type}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="cristal-toast-header">
                <strong>Cristal Notes</strong>
                <button type="button" class="btn-close" aria-label="Close"></button>
            </div>
            <div class="cristal-toast-body">
                ${message}
            </div>
        </div>
    `;
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    const toastEl = document.getElementById(toastId);
    
    // Show the toast with animation
    setTimeout(() => {
        toastEl.classList.add('show');
    }, 10);
    
    // Auto hide after duration
    setTimeout(() => {
        hideToast(toastEl);
    }, duration);
    
    // Close button event
    const closeBtn = toastEl.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => {
        hideToast(toastEl);
    });
}

function hideToast(toastEl) {
    toastEl.classList.remove('show');
    toastEl.classList.add('hide');
    setTimeout(() => {
        if (toastEl.parentNode) {
            toastEl.parentNode.removeChild(toastEl);
        }
    }, 300);
}

function exportNotes() {
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const objectStore = transaction.objectStore(NOTES_STORE);
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        const notes = event.target.result;
        if (notes.length === 0) return showToast('No hay notas para exportar', 'warning');

        let content = `Cristal Notes Export - ${new Date().toLocaleString()}\n\n`;
        notes.forEach(note => {
            content += `----------\nTitle: ${note.title}\nContent: ${note.content}\nReminder: ${note.reminder || 'None'}\nCreated: ${note.createdAt}\nUpdated: ${note.updatedAt}\n----------\n`;
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `CristalNotes_Export_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Notas exportadas', 'success');
    };
}

function importNotes(event) {
    showToast('La función de importación aún no está implementada.', 'info');
    importFileInput.value = ''; // Reset input
}

function isURL(str) {
    const pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
        '((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))' + // OR ip (v4) address
        '(:[0-9]+)?(\\/[-a-zA-Z0-9%_.~+]*)*' + // port and path
        '(\\?[;&a-zA-Z0-9%_.~+=-]*)?' + // query string
        '(\\#[-a-zA-Z0-9_]*)?$', 'i'); // fragment locator
    return !!pattern.test(str);
}

function formatURL(url) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'http://' + url;
    }
    return url;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHTML(str) {
    return str.replace(/[&<>\"']/g, function (tag) {
        const tagsToReplace = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return tagsToReplace[tag] || tag;
    });
}