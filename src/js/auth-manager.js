/**
 * src/js/auth-manager.js
 * Manages all user authentication actions like sign-in, sign-up, sign-out,
 * and updates the navigation UI based on the user's auth state.
 */

import {
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    updatePassword,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { showToast } from "./utils/toasts.js";

// --- CORE AUTHENTICATION FUNCTIONS ---

export async function signIn(email, password) { // <-- EXPORT ADDED
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

export async function signUp(name, email, password) { // <-- EXPORT ADDED
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        
        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: user.email,
            createdAt: serverTimestamp(),
            isScout: false,
            isAdmin: false
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
        const modalElement = document.getElementById('changePasswordModal');
        if (modalElement) {
            const modal = bootstrap.Modal.getInstance(modalElement);
            if (modal) {
                modal.hide();
            }
        }
    } catch (error) {
        console.error("Password change error:", error);
        showToast(`Error changing password: ${error.message}`, 'error');
    }
}

// --- UI MANAGEMENT ---

export async function updateNav(user) {
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

export function initializeAuthEventListeners() {
    document.getElementById('signOutLink')?.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
            await signOut(auth);
            showToast('You have been signed out.', 'info');
            window.location.href = '/';
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    document.getElementById('signInForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;
        const success = await signIn(email, password);
        if (success) {
            window.location.href = '/';
        }
    });

    document.getElementById('signUpForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signUpName').value;
        const email = document.getElementById('signUpEmail').value;
        const password = document.getElementById('signUpPassword').value;
        const success = await signUp(name, email, password);
        if (success) {
            window.location.href = '/curator-panel';
        }
    });

    document.getElementById('savePasswordButton')?.addEventListener('click', () => {
        const newPassword = document.getElementById('newPassword').value;
        changePassword(newPassword);
    });

    document.getElementById('show-signup')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
    });

    document.getElementById('show-signin')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';
    });
}