console.log("Checkpoint 4: auth-manager.js is starting to load.");

import { onAuthStateChanged, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { showToast } from "./utils/toasts.js";

async function updateNav(user) {
    const signInLink = document.getElementById('signInLink');
    const userDropdown = document.getElementById('userDropdown');
    const scoutNavItem = document.getElementById('scout-nav-item');

    if (signInLink) signInLink.style.display = 'none';
    if (userDropdown) userDropdown.classList.add('d-none');
    if (scoutNavItem) scoutNavItem.style.display = 'none';

    if (user && !user.isAnonymous) {
        if (userDropdown) userDropdown.classList.remove('d-none');
        try {
            const userRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userRef);
            if (userDoc.exists() && (userDoc.data().isScout || userDoc.data().isAdmin)) {
                if (scoutNavItem) scoutNavItem.style.display = 'list-item';
            }
        } catch (error) {
            console.error("Error fetching user role for nav:", error);
        }
    } else {
        if (signInLink) signInLink.style.display = 'block';
    }
}

function handleChangePassword() {
    const savePasswordButton = document.getElementById('savePasswordButton');
    if (!savePasswordButton) return;

    savePasswordButton.addEventListener('click', () => {
        const newPassword = document.getElementById('newPassword').value;
        const user = auth.currentUser;

        if (!newPassword || newPassword.length < 6) {
            showToast('Password must be at least 6 characters.', 'error');
            return;
        }
        if (user) {
            updatePassword(user, newPassword).then(() => {
                showToast('Password updated successfully!', 'success');
                document.getElementById('newPassword').value = '';
                const modalEl = document.getElementById('changePasswordModal');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
            }).catch((error) => {
                showToast(`Error: ${error.message}`, 'error');
            });
        }
    });
}

export function initializeAuthAndNav() {
    onAuthStateChanged(auth, (user) => {
        updateNav(user);
    });

    const signOutLink = document.getElementById('signOutLink');
    signOutLink?.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
            await signOut(auth);
            history.pushState(null, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
            console.error("Error signing out:", error);
        }
    });

    handleChangePassword();
}