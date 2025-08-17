import { initializeAuthAndNav } from './auth-manager.js';
import { loadHomePage } from './pages/home.js';
import { loadMemorialPage } from './pages/memorial-template.js';
import { loadCuratorPanel } from './pages/curator-panel.js';
import { loadMemorialFormPage } from './pages/memorial-form.js';
import { loadScoutModePage } from './pages/scout-mode.js';
import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils/toasts.js';
import { captureInstallPrompt, getInstallPrompt, resetInstallPrompt } from './utils/pwa-manager.js';

let currentMemorialListener = null;

function getCurrentUser() {
    return new Promise((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        });
    });
}

async function loadStaticPage(appRoot, pageName) {
    try {
        const response = await fetch(`/pages/${pageName}.html`);
        if (!response.ok) throw new Error(`Page not found: ${pageName}.html`);
        appRoot.innerHTML = await response.text();
    } catch (error) {
        console.error("Error loading static page:", error);
        appRoot.innerHTML = `<p class="text-center text-danger">Could not load page.</p>`;
    }
}

async function router() {
    if (currentMemorialListener) {
        currentMemorialListener(); 
        currentMemorialListener = null;
    }

    document.body.className = '';
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const appRoot = document.getElementById('app-root');
    if (!appRoot) {
        console.error("Fatal Error: #app-root element not found.");
        return;
    }
    appRoot.innerHTML = '<div class="text-center p-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    const user = await getCurrentUser();

    switch (path) {
        case '/': loadHomePage(appRoot); break;
        case '/memorial': loadMemorialPage(appRoot, urlParams.get('id'), (listener) => { currentMemorialListener = listener; }); break;
        case '/curator-panel': loadCuratorPanel(appRoot); break;
        case '/memorial-form': loadMemorialFormPage(appRoot, urlParams); break;
        
        case '/scout-mode':
            if (user && !user.isAnonymous) {
                const userRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists() && (userDoc.data().isScout || userDoc.data().isAdmin)) {
                    loadScoutModePage(appRoot);
                } else {
                    showToast("You are not authorized to access the Scout Program.", "error");
                    history.pushState(null, '', '/');
                    router();
                }
            } else {
                showToast("Please sign in to use Scout Mode.", "info");
                history.pushState(null, '', '/curator-panel');
                router();
            }
            break;
            
        case '/get-started': loadStaticPage(appRoot, 'get-started'); break;
        case '/scout': loadStaticPage(appRoot, 'scout'); break;
        default: appRoot.innerHTML = `<div class="text-center p-5"><h2>Page Not Found</h2><p>The page you are looking for does not exist.</p><a href="/" class="btn btn-primary">Go to Homepage</a></div>`; break;
    }
}

function initializeInstallPrompts() {
    const installPwaItem = document.getElementById('installPwaItem');
    const installPwaButton = document.getElementById('installPwaButton');
    const installIosItem = document.getElementById('installIosItem');

    window.addEventListener('beforeinstallprompt', (e) => {
        captureInstallPrompt(e);
    });

    window.addEventListener('pwa-prompt-available', () => {
        if (installPwaItem) installPwaItem.classList.remove('d-none');
    });

    if (installPwaButton) {
        installPwaButton.addEventListener('click', async () => {
            const deferredPrompt = getInstallPrompt();
            if (!deferredPrompt) return;
            
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            resetInstallPrompt();
            if (installPwaItem) installPwaItem.classList.add('d-none');
        });
    }

    const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos() && !window.navigator.standalone) {
         if (installIosItem) installIosItem.classList.remove('d-none');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAuthAndNav();
    initializeInstallPrompts();
    
    document.body.addEventListener('click', e => {
        const anchor = e.target.closest('a');
        if (!anchor || !anchor.hasAttribute('href') || anchor.hasAttribute('target')) return;
        
        const href = anchor.getAttribute('href');
        if (href.startsWith('/')) {
            e.preventDefault();
            history.pushState(null, '', anchor.href);
            router();
        } else if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
    
    window.addEventListener('popstate', router);
    
    router();
});