// IndexedDB setup
const DB_NAME = 'GlassNoteDB';
const DB_VERSION = 3; // Increased version to force upgrade
const NOTES_STORE = 'notes';
const LINKS_STORE = 'links';

let db;
let dbInitialized = false;
let useLocalStorageFallback = false;

// Initialize database with fallback to localStorage
function initDB() {
    return new Promise((resolve, reject) => {
        // Check if IndexedDB is supported
        if (!window.indexedDB) {
            console.warn('IndexedDB is not supported in this browser, using localStorage fallback');
            useLocalStorageFallback = true;
            resolve();
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Error opening database:', event.target.error);
            console.error('Error code:', event.target.errorCode);
            
            // Try to handle common issues
            if (event.target.error.name === 'UnknownError') {
                console.error('Possible causes:');
                console.error('- Browser storage is corrupted');
                console.error('- Insufficient storage space');
                console.error('- Database is blocked by another process');
                console.error('- Permissions issue');
                
                // Try deleting the database and recreating it
                const deleteReq = indexedDB.deleteDatabase(DB_NAME);
                deleteReq.onsuccess = () => {
                    console.log('Database deleted successfully, attempting to recreate...');
                    showToast('Base de datos corrompida. Recargando para intentar reparar...', 'warning');
                    setTimeout(() => window.location.reload(), 3000);
                };
                deleteReq.onerror = () => {
                    console.error('Failed to delete database:', deleteReq.error);
                    console.warn('Falling back to localStorage');
                    useLocalStorageFallback = true;
                    resolve();
                };
            } else {
                console.warn('Database error, falling back to localStorage:', event.target.error.message);
                useLocalStorageFallback = true;
                resolve();
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            
            // Check if database is properly connected
            if (!db) {
                console.warn('Database connection failed, falling back to localStorage');
                useLocalStorageFallback = true;
                resolve();
                return;
            }
            
            dbInitialized = true;
            console.log('Database initialized successfully');
            
            // Handle unexpected database closure
            db.onclose = () => {
                console.warn('Database connection closed unexpectedly');
                dbInitialized = false;
                showToast('Conexión con la base de datos cerrada. Recargando...', 'warning');
                setTimeout(() => window.location.reload(), 2000);
            };
            
            // Handle database version change
            db.onversionchange = () => {
                console.warn('Database version change detected');
                db.close();
                dbInitialized = false;
                showToast('La base de datos fue actualizada. Recargando...', 'info');
                setTimeout(() => window.location.reload(), 2000);
            };
            
            resolve();
        };

        request.onupgradeneeded = (event) => {
            console.log('Database upgrade needed');
            db = event.target.result;
            
            // Create notes store
            if (!db.objectStoreNames.contains(NOTES_STORE)) {
                console.log('Creating notes store');
                const noteStore = db.createObjectStore(NOTES_STORE, { keyPath: 'id', autoIncrement: true });
                noteStore.createIndex('title', 'title', { unique: false });
                noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                noteStore.createIndex('reminder', 'reminder', { unique: false });
            }
            
            // Create links store
            if (!db.objectStoreNames.contains(LINKS_STORE)) {
                console.log('Creating links store');
                const linkStore = db.createObjectStore(LINKS_STORE, { keyPath: 'id', autoIncrement: true });
                linkStore.createIndex('url', 'url', { unique: true });
                linkStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
            
            console.log('Database upgrade completed');
        };

        // Handle blocked state
        request.onblocked = (event) => {
            console.error('Database connection blocked:', event);
            console.warn('Falling back to localStorage');
            useLocalStorageFallback = true;
            resolve();
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
    if (!dbInitialized && !useLocalStorageFallback) return showToast('Base de datos no inicializada', 'danger');

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

// LocalStorage fallback functions
function saveNoteToLocalStorage(note) {
    let notes = JSON.parse(localStorage.getItem('glassnote_notes') || '[]');
    if (note.id) {
        // Update existing note
        const index = notes.findIndex(n => n.id === note.id);
        if (index !== -1) {
            notes[index] = note;
        }
    } else {
        // Add new note
        note.id = Date.now() + Math.random(); // Simple ID generation
        note.createdAt = new Date();
        notes.push(note);
    }
    localStorage.setItem('glassnote_notes', JSON.stringify(notes));
    return note.id;
}

function getNotesFromLocalStorage() {
    return JSON.parse(localStorage.getItem('glassnote_notes') || '[]');
}

function deleteNoteFromLocalStorage(id) {
    let notes = JSON.parse(localStorage.getItem('glassnote_notes') || '[]');
    notes = notes.filter(note => note.id !== id);
    localStorage.setItem('glassnote_notes', JSON.stringify(notes));
}

function saveNote(title, content) {
    if (useLocalStorageFallback) {
        const note = {
            title,
            content,
            reminder: reminderDateEl.value,
            updatedAt: new Date()
        };
        
        if (currentNoteId) {
            note.id = currentNoteId;
        }
        
        const id = saveNoteToLocalStorage(note);
        if (!currentNoteId) currentNoteId = id;
        loadNotes();
        // Clear the editor after saving
        createNewNote();
        showToast('Nota guardada correctamente', 'success');
        return;
    }
    
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
        // Clear the editor after saving
        createNewNote();
        showToast('Nota guardada correctamente', 'success');
    };
    request.onerror = (event) => {
        console.error('Error saving note:', event.target.error);
        showToast('Error al guardar la nota', 'danger');
    };
}

// LocalStorage fallback functions for links
function saveLinkToLocalStorage(link) {
    let links = JSON.parse(localStorage.getItem('glassnote_links') || '[]');
    if (link.id) {
        // Update existing link
        const index = links.findIndex(l => l.id === link.id);
        if (index !== -1) {
            links[index] = link;
        }
    } else {
        // Check if link already exists
        const existingLink = links.find(l => l.url === link.url);
        if (existingLink) {
            // Update existing link
            link.id = existingLink.id;
            link.createdAt = existingLink.createdAt;
            const index = links.findIndex(l => l.id === link.id);
            links[index] = link;
        } else {
            // Add new link
            link.id = Date.now() + Math.random(); // Simple ID generation
            link.createdAt = new Date();
            links.push(link);
        }
    }
    localStorage.setItem('glassnote_links', JSON.stringify(links));
    return link.id;
}

function getLinksFromLocalStorage() {
    return JSON.parse(localStorage.getItem('glassnote_links') || '[]');
}

function deleteLinkFromLocalStorage(id) {
    let links = JSON.parse(localStorage.getItem('glassnote_links') || '[]');
    links = links.filter(link => link.id !== id);
    localStorage.setItem('glassnote_links', JSON.stringify(links));
}

function saveLink(title, url) {
    if (useLocalStorageFallback) {
        const formattedUrl = formatURL(url);
        const link = {
            title,
            url: formattedUrl,
            updatedAt: new Date()
        };
        
        saveLinkToLocalStorage(link);
        loadLinks();
        // Clear the editor after saving
        createNewNote();
        showToast('Enlace guardado correctamente', 'success');
        return;
    }
    
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
            // Clear the editor after saving
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
    if (useLocalStorageFallback) {
        const links = getLinksFromLocalStorage();
        const linkIndex = links.findIndex(l => l.id === id);
        if (linkIndex !== -1) {
            links[linkIndex].title = title;
            links[linkIndex].url = formatURL(url);
            links[linkIndex].updatedAt = new Date();
            localStorage.setItem('glassnote_links', JSON.stringify(links));
            loadLinks();
            showToast('Enlace actualizado correctamente', 'success');
        }
        return;
    }
    
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
        if (useLocalStorageFallback) {
            // TODO: Implement localStorage fallback for links
            showToast('Eliminar enlaces no está disponible en modo de respaldo', 'warning');
        } else {
            deleteItem(LINKS_STORE, currentLinkId, 'Enlace eliminado', loadLinks);
        }
    } else if (currentNoteId) {
        if (useLocalStorageFallback) {
            deleteNoteFromLocalStorage(currentNoteId);
            createNewNote();
            loadNotes();
            showToast('Nota eliminada', 'success');
        } else {
            deleteItem(NOTES_STORE, currentNoteId, 'Nota eliminada', loadNotes);
        }
    } else {
        showToast('No hay nada seleccionado para eliminar', 'warning');
    }
}

function deleteItem(storeName, id, message, callback) {
    if (!confirm('¿Estás seguro de que quieres eliminar este elemento?')) return;

    if (useLocalStorageFallback) {
        if (storeName === NOTES_STORE) {
            deleteNoteFromLocalStorage(id);
        } else if (storeName === LINKS_STORE) {
            deleteLinkFromLocalStorage(id);
        }
        createNewNote();
        callback();
        showToast(message, 'success');
        return;
    }

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
    if (useLocalStorageFallback) {
        let notes = getNotesFromLocalStorage();
        if (query) {
            const lowerQuery = query.toLowerCase();
            notes = notes.filter(note =>
                note.title.toLowerCase().includes(lowerQuery) ||
                note.content.toLowerCase().includes(lowerQuery)
            );
        }
        // Sort notes: completed reminders first, then by updatedAt
        notes.sort((a, b) => {
            const now = new Date();
            const aIsCompletedReminder = a.reminder && new Date(a.reminder) < now;
            const bIsCompletedReminder = b.reminder && new Date(b.reminder) < now;
            
            // If one is a completed reminder and the other isn't, prioritize the completed reminder
            if (aIsCompletedReminder && !bIsCompletedReminder) return -1;
            if (!aIsCompletedReminder && bIsCompletedReminder) return 1;
            
            // If both are completed reminders or both aren't, sort by updatedAt (newest first)
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        displayNotes(notes);
        return;
    }
    
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
        // Sort notes: completed reminders first, then by updatedAt
        notes.sort((a, b) => {
            const now = new Date();
            const aIsCompletedReminder = a.reminder && new Date(a.reminder) < now;
            const bIsCompletedReminder = b.reminder && new Date(b.reminder) < now;
            
            // If one is a completed reminder and the other isn't, prioritize the completed reminder
            if (aIsCompletedReminder && !bIsCompletedReminder) return -1;
            if (!aIsCompletedReminder && bIsCompletedReminder) return 1;
            
            // If both are completed reminders or both aren't, sort by updatedAt (newest first)
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        displayNotes(notes);
    };
    request.onerror = (event) => console.error('Error loading notes:', event.target.error);
}

function loadLinks() {
    if (useLocalStorageFallback) {
        const links = getLinksFromLocalStorage().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        displayLinks(links);
        return;
    }
    
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
    if (useLocalStorageFallback) {
        const notes = getNotesFromLocalStorage();
        const note = notes.find(n => n.id === id);
        if (note) {
            currentNoteId = note.id;
            currentLinkId = null;
            noteTitleEl.value = note.title;
            noteContentEl.value = note.content;
            reminderDateEl.value = note.reminder || '';
            clearActiveNote();
            document.querySelector(`[data-note-id="${note.id}"]`)?.classList.add('active');
        }
        return;
    }
    
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
    if (useLocalStorageFallback) {
        const links = getLinksFromLocalStorage();
        const link = links.find(l => l.id === id);
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
        return;
    }
    
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
    if (useLocalStorageFallback) {
        const notes = getNotesFromLocalStorage();
        const now = new Date();
        notes.forEach(note => {
            if (note.reminder) {
                const reminderTime = new Date(note.reminder);
                if (reminderTime > now && reminderTime <= new Date(now.getTime() + 60 * 1000)) {
                    showToast(`Recordatorio: ${note.title}`, 'info', 10000);
                }
            }
        });
        loadNotes(searchInput.value); // Refresh list to show completed reminders at top
        return;
    }
    
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
        loadNotes(searchInput.value); // Refresh list to show completed reminders at top
    };

    setInterval(checkReminders, 60000); // Check every minute
}

function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('notificationToastContainer');
    const toastId = 'toast-' + Date.now();
    const toastHTML = `
        <div id="${toastId}" class="cristal-toast ${type}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="cristal-toast-header">
                <strong>Glass Note</strong>
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
    const timeoutId = setTimeout(() => {
        hideToast(toastEl);
    }, duration);
    
    // Close button event - using event delegation and ensuring proper binding
    const closeBtn = toastEl.querySelector('.btn-close');
    if (closeBtn) {
        // Try multiple event types to ensure compatibility
        ['click', 'mousedown', 'touchstart'].forEach(eventType => {
            closeBtn.addEventListener(eventType, function(e) {
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(timeoutId); // Clear the auto-hide timeout
                hideToast(toastEl);
            });
        });
    }
}

function hideToast(toastEl) {
    if (!toastEl || !toastEl.parentNode) return;
    
    // If already hidden, remove immediately
    if (toastEl.classList.contains('hide')) {
        try {
            toastEl.parentNode.removeChild(toastEl);
        } catch (e) {
            // Element might already be removed
        }
        return;
    }
    
    toastEl.classList.remove('show');
    toastEl.classList.add('hide');
    
    // Remove the toast after the animation completes
    setTimeout(() => {
        try {
            if (toastEl.parentNode) {
                toastEl.parentNode.removeChild(toastEl);
            }
        } catch (e) {
            // Element might already be removed
        }
    }, 300);
}

// Encryption/Decryption functions using Web Crypto API
async function encryptData(data, password) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Derive key from password
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    
    // Encrypt data
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        dataBuffer
    );
    
    // Combine salt, iv and encrypted data
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedArray.length);
    resultBuffer.set(salt, 0);
    resultBuffer.set(iv, salt.length);
    resultBuffer.set(encryptedArray, salt.length + iv.length);
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode(...resultBuffer));
}

async function decryptData(encryptedData, password) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Convert from base64
    const dataBuffer = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract salt, iv and encrypted data
    const salt = dataBuffer.slice(0, 16);
    const iv = dataBuffer.slice(16, 28);
    const encryptedBuffer = dataBuffer.slice(28);
    
    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );
    
    // Decrypt data
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encryptedBuffer
    );
    
    return decoder.decode(decryptedBuffer);
}

// Simple password dialog
function showPasswordDialog(title, callback) {
    const password = prompt(title);
    if (password !== null) { // User didn't cancel
        callback(password);
    }
}

// Helper function to pad numbers with leading zeros
function padZero(num) {
    return num.toString().padStart(2, '0');
}

// Helper function to get formatted date for filename
function getFormattedDate() {
    const now = new Date();
    const day = padZero(now.getDate());
    const month = padZero(now.getMonth() + 1);
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
}

function exportNotes() {
    // Ask user if they want encryption
    const useEncryption = confirm('¿Desea cifrar el archivo exportado con una contraseña?');
    
    // Generate formatted date for filename
    const dateStr = getFormattedDate();
    
    if (useLocalStorageFallback) {
        const notes = getNotesFromLocalStorage();
        if (notes.length === 0) return showToast('No hay notas para exportar', 'warning');

        let content = JSON.stringify({
            exportDate: new Date().toISOString(),
            notes: notes
        });

        if (useEncryption) {
            showPasswordDialog('Ingrese una contraseña para cifrar el archivo:', async (password) => {
                try {
                    const encryptedContent = await encryptData(content, password);
                    const exportData = JSON.stringify({
                        encrypted: true,
                        data: encryptedContent
                    });
                    
                    const blob = new Blob([exportData], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `GlassNote_Export_Cifrado_${dateStr}.txt`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    showToast('Notas exportadas y cifradas', 'success');
                } catch (error) {
                    console.error('Error encrypting data:', error);
                    showToast('Error al cifrar las notas', 'danger');
                }
            });
        } else {
            const blob = new Blob([content], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `GlassNote_Export_${dateStr}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Notas exportadas', 'success');
        }
        return;
    }
    
    const transaction = db.transaction([NOTES_STORE], 'readonly');
    const objectStore = transaction.objectStore(NOTES_STORE);
    const request = objectStore.getAll();

    request.onsuccess = (event) => {
        const notes = event.target.result;
        if (notes.length === 0) return showToast('No hay notas para exportar', 'warning');

        let content = JSON.stringify({
            exportDate: new Date().toISOString(),
            notes: notes
        });

        if (useEncryption) {
            showPasswordDialog('Ingrese una contraseña para cifrar el archivo:', async (password) => {
                try {
                    const encryptedContent = await encryptData(content, password);
                    const exportData = JSON.stringify({
                        encrypted: true,
                        data: encryptedContent
                    });
                    
                    const blob = new Blob([exportData], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `GlassNote_Export_Cifrado_${dateStr}.txt`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    showToast('Notas exportadas y cifradas', 'success');
                } catch (error) {
                    console.error('Error encrypting data:', error);
                    showToast('Error al cifrar las notas', 'danger');
                }
            });
        } else {
            const blob = new Blob([content], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `GlassNote_Export_${dateStr}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Notas exportadas', 'success');
        }
    };
}

function importNotes(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            
            // Try to parse as JSON first (for encrypted files)
            let data;
            try {
                data = JSON.parse(content);
            } catch (jsonError) {
                // If JSON parsing fails, it might be an encrypted file stored as plain text
                // In this case, we'll treat the whole content as the encrypted data
                data = {
                    encrypted: true,
                    data: content.trim()
                };
            }
            
            let notesToImport = [];
            
            // Check if file is encrypted
            if (data.encrypted) {
                const password = prompt('Ingrese la contraseña para descifrar el archivo:');
                if (!password) {
                    showToast('Se requiere contraseña para importar notas cifradas', 'warning');
                    return;
                }
                
                try {
                    const decryptedContent = await decryptData(data.data, password);
                    const decryptedData = JSON.parse(decryptedContent);
                    notesToImport = decryptedData.notes;
                } catch (error) {
                    console.error('Error decrypting data:', error);
                    showToast('Error al descifrar el archivo. Contraseña incorrecta o archivo dañado.', 'danger');
                    return;
                }
            } else {
                notesToImport = data.notes || [];
            }
            
            if (!Array.isArray(notesToImport) || notesToImport.length === 0) {
                showToast('No se encontraron notas para importar', 'warning');
                return;
            }
            
            let importedCount = 0;
            
            // Import notes
            if (useLocalStorageFallback) {
                notesToImport.forEach(note => {
                    // Ensure note has required fields
                    note.updatedAt = note.updatedAt ? new Date(note.updatedAt) : new Date();
                    note.createdAt = note.createdAt ? new Date(note.createdAt) : new Date();
                    
                    saveNoteToLocalStorage(note);
                    importedCount++;
                });
                loadNotes();
            } else {
                // For IndexedDB
                notesToImport.forEach(note => {
                    // Ensure note has required fields
                    note.updatedAt = note.updatedAt ? new Date(note.updatedAt) : new Date();
                    note.createdAt = note.createdAt ? new Date(note.createdAt) : new Date();
                    
                    saveNote(note.title, note.content);
                    importedCount++;
                });
            }
            
            showToast(`Importadas ${importedCount} notas`, 'success');
        } catch (error) {
            console.error('Error importing notes:', error);
            showToast('Error al importar notas. Archivo inválido o dañado.', 'danger');
        }
    };
    reader.readAsText(file);
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