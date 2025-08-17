/**
 * src/js/app.js
 * FINAL COMBINED VERSION
 * This file contains all application logic for routing, authentication,
 * and UI management to eliminate module-loading race conditions.
 */
// Add this block to the very top of src/js/app.js

const buildTimestamp = "August 17, 2025, 1127";
console.log(
  `%c✅ Headstone Legacy Deployed \n%cBuild Time: ${buildTimestamp}`,
  "color: #28a745; font-size: 1.2em; font-weight: bold;",
  "color: #6c757d; font-size: 1em;"
);

// ... your existing code (import statements, etc.) starts here
// --- IMPORTS ---
import {
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    updatePassword,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils/toasts.js';

// Page loading functions
import { loadHomePage } from './pages/home.js';
import { loadMemorialPage } from './pages/memorial-template.js';
import { loadCuratorPanel } from './pages/curator-panel.js';
import { loadMemorialFormPage } from './pages/memorial-form.js';
import { loadScoutModePage } from './pages/scout-mode.js';
import { captureInstallPrompt, getInstallPrompt, resetInstallPrompt } from './utils/pwa-manager.js';


// --- GLOBAL STATE ---
let currentUser = null;
let authInitialized = false;
let currentMemorialListener = null;
let currentScoutModeListener = null; // --- ADD THIS ---


// --- CORE AUTH FUNCTIONS ---
// (No changes to signIn, signUp, changePassword)
async function signIn(email, password) {
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Login successful!', 'success');
        return true;
    } catch (error) {
        console.error("Sign-in error:", error.code, error.message);
        showToast("Failed to sign in. Please check your email and password.", 'error');
        return false;
    }
}

async function signUp(name, email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, "users", user.uid), {
            name, email, createdAt: serverTimestamp(), isScout: false, isAdmin: false
        });
        showToast('Account created successfully! Please sign in.', 'success');
        return true;
    } catch (error) {
        console.error("Sign-up error:", error.code, error.message);
        showToast(`Could not create account: ${error.message}`, 'error');
        return false;
    }
}

async function changePassword(newPassword) {
    if (!auth.currentUser) {
        showToast('You must be signed in to change your password.', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters long.', 'error');
        return;
    }
    try {
        await updatePassword(auth.currentUser, newPassword);
        showToast('Password updated successfully.', 'success');
        const modalEl = document.getElementById('changePasswordModal');
        if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    } catch (error) {
        console.error("Password change error:", error);
        showToast(`Error changing password: ${error.message}`, 'error');
    }
}


// --- UI MANAGEMENT ---
// (No changes to updateNav)
async function updateNav(user) {
    const signInLink = document.getElementById('signInLink');
    const userDropdown = document.getElementById('userDropdown');
    const scoutNavItem = document.getElementById('scout-nav-item');

    if (user && !user.isAnonymous) {
        if (signInLink) signInLink.style.display = 'none';
        if (userDropdown) userDropdown.classList.remove('d-none');

        try {
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists() && (userDoc.data().isScout || userDoc.data().isAdmin)) {
                if (scoutNavItem) scoutNavItem.style.display = 'list-item';
            } else {
                if (scoutNavItem) scoutNavItem.style.display = 'none';
            }
        } catch (error) {
            console.error("Error fetching user role for nav:", error);
            if (scoutNavItem) scoutNavItem.style.display = 'none';
        }
    } else {
        if (signInLink) signInLink.style.display = 'block';
        if (userDropdown) userDropdown.classList.add('d-none');
        if (scoutNavItem) scoutNavItem.style.display = 'none';
    }
}


// --- ROUTING & PAGE LOADING ---
// (No changes to loadStaticPage)
async function loadStaticPage(appRoot, pageName) {
    try {
        const response = await fetch(`/pages/${pageName}.html`);
        if (!response.ok) throw new Error(`Page not found: /pages/${pageName}.html`);
        appRoot.innerHTML = await response.text();
    } catch (error) {
        console.error("Error loading static page:", error);
        appRoot.innerHTML = `<p class="text-center text-danger p-5">Could not load page.</p>`;
    }
}

async function router() {
    // --- ADD THIS BLOCK TO RUN CLEANUP ---
    if (currentScoutModeListener) {
        currentScoutModeListener();
        currentScoutModeListener = null;
    }
    if (currentMemorialListener) {
        currentMemorialListener();
        currentMemorialListener = null;
    }

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const appRoot = document.getElementById('app-root');
    if (!appRoot) {
        console.error("Fatal Error: #app-root element not found.");
        return;
    }

    appRoot.innerHTML = '<div class="text-center p-5"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    switch (path) {
        case '/': loadHomePage(appRoot); break;
        case '/memorial': loadMemorialPage(appRoot, urlParams.get('id'), (l) => { currentMemorialListener = l; }); break;
        case '/curator-panel':
            if (currentUser && !currentUser.isAnonymous) {
                const userRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists() && (userDoc.data().isScout || userDoc.data().isAdmin)) {
                    loadCuratorPanel(appRoot, currentUser);
                } else {
                    showToast("You are not authorized to view the curator panel.", "error");
                    history.pushState(null, '', '/');
                    router();
                }
            } else {
                loadCuratorPanel(appRoot, null);
            }
            break;
        case '/memorial-form': loadMemorialFormPage(appRoot, urlParams); break;
        case '/scout-mode':
            if (currentUser && !currentUser.isAnonymous) {
                const userRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists() && (userDoc.data().isScout || userDoc.data().isAdmin)) {
                    // --- UPDATE THIS CALL TO PASS A CALLBACK ---
                    loadScoutModePage(appRoot, (cleanupFunc) => {
                        currentScoutModeListener = cleanupFunc;
                    });
                } else {
                    showToast("You are not authorized for this page.", "error");
                    history.pushState(null, '', '/'); router();
                }
            } else {
                showToast("Please sign in to access Scout Mode.", "info");
                history.pushState(null, '', '/curator-panel'); router();
            }
            break;
        case '/get-started': loadStaticPage(appRoot, 'get-started'); break;
        case '/scout': loadStaticPage(appRoot, 'scout'); break;
        default: appRoot.innerHTML = `<div class="text-center p-5"><h2>404 - Page Not Found</h2></div>`; break;
    }
}


// --- INITIALIZATION ---
// (No changes to initializeEventListeners or the entry point)
function initializeEventListeners() {
    document.body.addEventListener('submit', async (e) => {
        if (e.target.id === 'signInForm') {
            e.preventDefault();
            const email = document.getElementById('signInEmail').value;
            const password = document.getElementById('signInPassword').value;
            if (await signIn(email, password)) {
                history.pushState(null, '', '/');
                router();
            }
        }
        if (e.target.id === 'signUpForm') {
            e.preventDefault();
            const name = document.getElementById('signUpName').value;
            const email = document.getElementById('signUpEmail').value;
            const password = document.getElementById('signUpPassword').value;
            if (await signUp(name, email, password)) {
                history.pushState(null, '', '/curator-panel');
                router();
            }
        }
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target;

        if (target.id === 'signOutLink') {
            e.preventDefault();
            signOut(auth).then(() => {
                showToast('You have been signed out.', 'info');
                window.location.href = '/';
            });
        }
        if (target.id === 'savePasswordButton') {
            changePassword(document.getElementById('newPassword').value);
        }
        if (target.id === 'show-signup') {
            e.preventDefault();
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('signup-form').style.display = 'block';
        }
        if (target.id === 'show-signin') {
            e.preventDefault();
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('signup-form').style.display = 'none';
        }

        const anchor = target.closest('a');
        if (authInitialized && anchor && anchor.getAttribute('href')?.startsWith('/') && !anchor.hasAttribute('target')) {
            if (anchor.id !== 'show-signup' && anchor.id !== 'show-signin' && anchor.id !== 'signOutLink') {
                e.preventDefault();
                history.pushState(null, '', anchor.href);
                router();
            }
        }
    });
    
    const installPwaItem = document.getElementById('installPwaItem');
    const installPwaButton = document.getElementById('installPwaButton');
    window.addEventListener('beforeinstallprompt', (e) => {
        captureInstallPrompt(e);
        if (installPwaItem) installPwaItem.classList.remove('d-none');
    });
    if (installPwaButton) {
        installPwaButton.addEventListener('click', async () => {
            const prompt = getInstallPrompt();
            if (!prompt) return;
            prompt.prompt();
            await prompt.userChoice;
            resetInstallPrompt();
            if (installPwaItem) installPwaItem.classList.add('d-none');
        });
    }

    window.addEventListener('popstate', () => {
        if (authInitialized) router();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();

    onAuthStateChanged(auth, (user) => {
        const wasLoggedIn = !!currentUser;
        const isLoggedIn = !!user;
        currentUser = user;
        updateNav(user);

        if (!authInitialized) {
            authInitialized = true;
            router();
        } else if (wasLoggedIn !== isLoggedIn) {
            router();
        }
    });
});