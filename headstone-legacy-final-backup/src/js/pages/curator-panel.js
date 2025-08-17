import { auth, db, functions } from '../firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, sendPasswordResetEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, setDoc, deleteDoc, updateDoc, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../utils/toasts.js';

let changePasswordModalInstance;

function renderList(containerId, templateId, items, configureItem) {
    const container = document.getElementById(containerId);
    const template = document.getElementById(templateId);
    if (!container || !template) return;
    container.innerHTML = '';
    if (items.length === 0) {
        const defaultMessages = {
            'memorial-list-container': 'You have not created any memorials.',
            'pending-list-container': 'No pending memorial submissions.',
            'pending-tributes-container': 'No pending tributes to review.',
            'draft-list-container': 'You have no pending drafts.'
        };
        container.innerHTML = `<p class="text-muted">${defaultMessages[containerId] || 'Nothing to show.'}</p>`;
        return;
    }
    items.forEach(item => {
        const clone = template.content.cloneNode(true);
        configureItem(clone, item);
        container.appendChild(clone);
    });
}

async function approveTribute(memorialId, tributeId) {
    const tributeRef = doc(db, 'memorials', memorialId, 'tributes', tributeId);
    try {
        await updateDoc(tributeRef, { status: 'approved' });
        showToast('Tribute approved.', 'success');
    } catch (error) {
        console.error("Error approving tribute:", error);
        showToast("Failed to approve tribute.", 'error');
    }
}

async function rejectTribute(memorialId, tributeId) {
    if (confirm('Are you sure you want to reject and delete this tribute?')) {
        const tributeRef = doc(db, 'memorials', memorialId, 'tributes', tributeId);
        try {
            await deleteDoc(tributeRef);
            showToast('Tribute rejected and deleted.', 'success');
        } catch (error) {
            console.error("Error rejecting tribute:", error);
            showToast("Failed to reject tribute.", 'error');
        }
    }
}

function listenForPendingTributes(userId) {
    const memorialsRef = collection(db, 'memorials');
    const userMemorialsQuery = query(memorialsRef, where('curatorId', '==', userId));

    onSnapshot(userMemorialsQuery, (memorialSnapshot) => {
        if (memorialSnapshot.empty) {
            renderList('pending-tributes-container', 'pending-tribute-template', [], () => {});
            return;
        }
        memorialSnapshot.forEach(memorialDoc => {
            const memorial = { id: memorialDoc.id, ...memorialDoc.data() };
            const tributesRef = collection(db, 'memorials', memorial.id, 'tributes');
            const pendingTributesQuery = query(tributesRef, where('status', '==', 'pending'));

            onSnapshot(pendingTributesQuery, (tributeSnapshot) => {
                const tributes = tributeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderList('pending-tributes-container', 'pending-tribute-template', tributes, (clone, tribute) => {
                    clone.querySelector('.tribute-message').textContent = `“${tribute.message}”`;
                    clone.querySelector('.tribute-author').textContent = tribute.name;
                    clone.querySelector('.tribute-memorial-name').textContent = memorial.name;
                    clone.querySelector('.approve-tribute-btn').addEventListener('click', () => approveTribute(memorial.id, tribute.id));
                    clone.querySelector('.reject-tribute-btn').addEventListener('click', () => rejectTribute(memorial.id, tribute.id));
                });
            });
        });
    });
}

async function loadOnThisDay(userId) {
    const today = new Date();
    const monthDay = `${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
    const memorialsRef = collection(db, 'memorials');
    const birthQuery = query(memorialsRef, where('curatorId', '==', userId), where('birthMonthDay', '==', monthDay));
    const deathQuery = query(memorialsRef, where('curatorId', '==', userId), where('deathMonthDay', '==', monthDay));
    const [birthSnapshot, deathSnapshot] = await Promise.all([getDocs(birthQuery), getDocs(deathQuery)]);
    const anniversaries = [];
    birthSnapshot.forEach(doc => { anniversaries.push({ id: doc.id, type: 'Birthday', ...doc.data() }); });
    deathSnapshot.forEach(doc => { anniversaries.push({ id: doc.id, type: 'Anniversary', ...doc.data() }); });
    const container = document.getElementById('on-this-day-list');
    const section = document.getElementById('on-this-day-section');
    if (!container || !section) return;
    container.innerHTML = '';
    if (anniversaries.length > 0) {
        section.style.display = 'block';
        anniversaries.forEach(item => {
            const memorialAge = today.getFullYear() - new Date(item.deathDate).getFullYear();
            let text = item.type === 'Birthday' ? `It's ${item.name}'s birthday.` : `Remembering ${item.name}, who passed ${memorialAge} year(s) ago today.`;
            const a = document.createElement('a');
            a.href = `/memorial?id=${item.id}`;
            a.className = 'list-group-item list-group-item-action';
            a.innerHTML = `<i class="fas ${item.type === 'Birthday' ? 'fa-birthday-cake' : 'fa-dove'} fa-fw me-2"></i> ${text}`;
            container.appendChild(a);
        });
    } else {
        section.style.display = 'none';
    }
}

async function approveSubmission(submission) {
    const user = auth.currentUser;
    if (!user) {
        showToast("You must be signed in to approve submissions.", 'error');
        return;
    }
    const approveBtn = document.querySelector(`.approve-btn[data-id="${submission.id}"]`);
    if(approveBtn) approveBtn.disabled = true;
    try {
        const approveAndLink = httpsCallable(functions, 'approveAndLinkSubmission');
        await approveAndLink({
            submissionId: submission.id,
            curatorId: user.uid
        });
        showToast('Submission approved and linked!', 'success');
    } catch (error) {
        console.error("Error approving submission via Cloud Function: ", error);
        showToast(`Failed to approve: ${error.message}`, 'error');
        if(approveBtn) approveBtn.disabled = false;
    }
}

async function deleteSubmission(docId) {
    if (confirm('Are you sure you want to delete this submission? This cannot be undone.')) {
        const docRef = doc(db, 'memorials', docId);
        try {
            await deleteDoc(docRef);
            showToast('Submission deleted.', 'success');
        } catch (error) {
            console.error("Error deleting submission: ", error);
            showToast("Failed to delete the submission.", 'error');
        }
    }
}

function listenForPendingSubmissions() {
    const memorialsRef = collection(db, 'memorials');
    const q = query(memorialsRef, where('status', '==', 'pending_approval'));
    onSnapshot(q, (querySnapshot) => {
        const submissions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const container = document.getElementById('pending-list-container');
        if (!container) return;
        renderList('pending-list-container', 'pending-item-template', submissions, (clone, submission) => {
            const thumbnailUrl = (submission.photos && submission.photos.length > 0) ? submission.photos[0] : 'https://placehold.co/60';
            clone.querySelector('.submission-thumbnail').src = thumbnailUrl;
            clone.querySelector('.submission-name').textContent = submission.name || 'No Name';
            clone.querySelector('.submission-byline').textContent = `Submitted by: ${submission.submittedByName || 'Anonymous'}`;
            const locationLink = clone.querySelector('.location-link');
            if (submission.location && submission.location.lat && submission.location.lng) {
                locationLink.href = `https://www.google.com/maps?q=${submission.location.lat},${submission.location.lng}`;
            } else {
                locationLink.style.display = 'none';
            }
            const approveBtn = clone.querySelector('.approve-btn');
            if (approveBtn) {
                approveBtn.dataset.id = submission.id;
                approveBtn.addEventListener('click', () => approveSubmission(submission));
            }
            clone.querySelector('.delete-btn')?.addEventListener('click', () => deleteSubmission(submission.id));
        });
    }, (error) => {
        console.error("Error loading pending submissions:", error);
    });
}

async function deleteMemorial(memorialId) {
    const warningMessage = "Are you sure you want to permanently delete this memorial?\n\nAll associated photos, tributes, and data will be lost forever. This action cannot be undone.";
    if (confirm(warningMessage)) {
        try {
            await deleteDoc(doc(db, "memorials", memorialId));
            showToast("Memorial permanently deleted.", "success");
        } catch (error) {
            console.error("Error deleting memorial:", error);
            showToast("Failed to delete memorial.", "error");
        }
    }
}

async function loadCuratorData(user) {
    const memorialsRef = collection(db, 'memorials');
    const q = query(memorialsRef, where('curatorId', '==', user.uid));
    
    onSnapshot(q, (querySnapshot) => {
        let memorials = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        memorials.sort((a, b) => {
            const orderA = a.tierSortOrder || 4;
            const orderB = b.tierSortOrder || 4;
            if (orderA < orderB) return -1;
            if (orderA > orderB) return 1;
            if (a.name && b.name) {
                return a.name.localeCompare(b.name);
            }
            return 0;
        });

        const approvedMemorials = memorials.filter(memorial => memorial.status === 'approved' || !memorial.status);

        renderList('memorial-list-container', 'memorial-item-template', approvedMemorials, (clone, memorial) => {
            clone.querySelector('.memorial-name').textContent = memorial.name;
            clone.querySelector('.view-link').href = `/memorial?id=${memorial.id}`;
            clone.querySelector('.edit-link').href = `/memorial-form?id=${memorial.id}`;
            
            const deleteBtn = clone.querySelector('.delete-link');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => deleteMemorial(memorial.id));
            }

            const badge = clone.querySelector('.tier-badge');
            const tier = memorial.tier || 'memorial';
            if (badge) {
                let badgeClass = 'bg-secondary';
                if (tier === 'historian') badgeClass = 'bg-primary';
                if (tier === 'legacy') badgeClass = 'bg-info text-dark';
                if (tier === 'storyteller') badgeClass = 'bg-success';
                
                badge.className = `tier-badge ms-2 badge ${badgeClass}`;
                badge.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
            }
        });
    }, (error) => {
        console.error("Error fetching curator memorials:", error);
    });
}

function listenForDraftSubmissions(user) {
    const memorialsRef = collection(db, 'memorials');
    const q = query(memorialsRef, where('curatorId', '==', user.uid), where('status', '==', 'pending_details'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (querySnapshot) => {
        const drafts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        renderList('draft-list-container', 'memorial-item-template', drafts, (clone, draft) => {
            const name = draft.name || `[No Name] - ${new Date(draft.createdAt?.toDate()).toLocaleDateString()}`;
            clone.querySelector('.memorial-name').textContent = name;
            
            clone.querySelector('.view-link').style.display = 'none';
            clone.querySelector('.delete-link').style.display = 'none';
            
            const editBtn = clone.querySelector('.edit-link');
            editBtn.textContent = 'Add Details';
            editBtn.href = `/memorial-form?id=${draft.id}`;
        });
    }, (error) => {
        console.error("Error fetching draft submissions:", error);
    });
}

async function checkUserRole(uid) {
    const scoutModeButton = document.getElementById('scout-mode-button');
    const pendingSection = document.getElementById('pending-section');

    if (scoutModeButton) scoutModeButton.style.display = 'none';
    if (pendingSection) pendingSection.style.display = 'none';
    
    const userRef = doc(db, 'users', uid);
    try {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.isScout || userData.isAdmin) {
                if (scoutModeButton) scoutModeButton.style.display = 'inline-block';
            }
            if (userData.isAdmin) {
                if (pendingSection) pendingSection.style.display = 'block';
                listenForPendingSubmissions();
            }
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
    }
}

function showDashboard(user) {
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    if (!authSection || !dashboard) return; 

    authSection.style.display = 'none';
    dashboard.style.display = 'block';
    document.getElementById('curator-name').textContent = user.displayName || user.email;
    
    checkUserRole(user.uid); 
    loadCuratorData(user);
    listenForPendingTributes(user.uid);
    loadOnThisDay(user.uid);
    listenForDraftSubmissions(user);
}

function showAuthSection() {
    const authSection = document.getElementById('auth-section');
    const dashboard = document.getElementById('dashboard');
    if (!authSection || !dashboard) return;

    authSection.style.display = 'block';
    dashboard.style.display = 'none';
}

function addCuratorPanelEventListeners() {
    document.getElementById('signInForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showToast(`Sign in failed: ${error.message}`, 'error');
        }
    });

    document.getElementById('signUpForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signUpName').value;
        const email = document.getElementById('signUpEmail').value;
        const password = document.getElementById('signUpPassword').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await updateProfile(user, { displayName: name });
            await setDoc(doc(db, "users", user.uid), { 
                displayName: name,
                email, 
                createdAt: new Date(),
                isScout: false,
                isAdmin: false 
            });
        } catch (error) {
            showToast(`Sign up failed: ${error.message}`, 'error');
        }
    });
    
    document.getElementById('signOutButton')?.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = '/'; 
        } catch (error) {
            console.error("Sign out error", error);
        }
    });
    
    document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value;
        if (!email) {
            showToast('Please enter your email address.', 'info');
            return;
        }
        sendPasswordResetEmail(auth, email)
            .then(() => showToast('Password reset email sent!', 'success'))
            .catch((error) => showToast(`Error: ${error.message}`, 'error'));
    });

    const changePasswordButton = document.getElementById('changePasswordButton');
    if (changePasswordButton) {
        const changePasswordModalEl = document.getElementById('changePasswordModal');
        changePasswordModalInstance = bootstrap.Modal.getOrCreateInstance(changePasswordModalEl);
        
        document.getElementById('savePasswordButton')?.addEventListener('click', () => {
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
                    changePasswordModalInstance.hide();
                }).catch((error) => {
                    showToast(`Error: ${error.message}`, 'error');
                });
            }
        });
    }

    document.getElementById('show-signup')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('login-form').style.display = 'none'; document.getElementById('signup-form').style.display = 'block'; });
    document.getElementById('show-signin')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signup-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; });
}

export async function loadCuratorPanel(appRoot) {
    try {
        const response = await fetch('/pages/curator-panel.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        addCuratorPanelEventListeners();
        onAuthStateChanged(auth, (user) => {
            if (window.location.pathname.startsWith('/curator-panel')) {
                if (user && !user.isAnonymous) {
                    showDashboard(user);
                } else {
                    showAuthSection();
                }
            }
        });
    } catch (error) {
        console.error("Failed to load curator panel:", error);
    }
}