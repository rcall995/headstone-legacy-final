import { db, auth, storage, functions } from '../firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getDoc, doc, collection, addDoc, query, orderBy, getDocs, serverTimestamp, deleteDoc, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showModal, hideModal } from '../utils/modal-manager.js';
import { showToast } from '../utils/toasts.js';

const upgradeMemorialTier = httpsCallable(functions, 'upgradeMemorialTier');
let memorialDataForSharing = null;

function formatDate(dateString) {
    if (!dateString) return '';
    if (/^\d{4}$/.test(dateString.trim())) {
        return dateString.trim();
    }
    const date = new Date(`${dateString}T00:00:00`);
    if (isNaN(date.getTime())) {
        return dateString;
    }
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleDateString(undefined, options);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return 'Just now';
    return timestamp.toDate().toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function initMap(container, primaryLocation) {
    if (!container || !primaryLocation) return;
    mapboxgl.accessToken = "pk.eyJ1IjoicmNhbGwxNDA3MiIsImEiOiJjbWUzcmwybmkwOXFyMnRwejhiNG10OXZyIn0.pCk3N77xIXzxh_RmBbnWaA";
    const map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [primaryLocation.lng, primaryLocation.lat],
        zoom: 15
    });
    new mapboxgl.Marker().setLngLat([primaryLocation.lng, primaryLocation.lat]).addTo(map);
}

function getAuthUser() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

async function deleteTribute(memorialId, tributeId) {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

async function renderTributes(appRoot, memorialId, currentUser, curatorId) {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

async function handleTributeSubmit(memorialId) {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

async function handleShare() {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

async function renderMemorial(appRoot, memorialId, data) {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

function addEventListeners(appRoot, memorialId, data) {
    // ... (rest of function is unchanged, so it has been omitted for brevity)
}

export async function loadMemorialPage(appRoot, memorialId, setListener) {
    try {
        const response = await fetch('/pages/memorial-template.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        document.body.className = 'memorial-page-body';
        
        let listenersAttached = false;
        let mapInitialized = false; 

        if (memorialId) {
            const docRef = doc(db, 'memorials', memorialId);
            const unsubscribe = onSnapshot(docRef, async (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    await renderMemorial(appRoot, memorialId, data);
                    if (!listenersAttached) {
                        addEventListeners(appRoot, memorialId, data);
                        listenersAttached = true;
                    }
                    if (!mapInitialized && data.location) {
                        setTimeout(() => {
                            initMap(appRoot.querySelector('#map-container'), data.location);
                            mapInitialized = true;
                        }, 100);
                    }
                } else {
                    appRoot.querySelector('#memorial-layout-container').style.display = 'none';
                    appRoot.querySelector('#no-memorial-message').style.display = 'block';
                }
            }, (error) => {
                console.error("Error listening to memorial document:", error);
            });
            setListener(unsubscribe);
        } else {
            appRoot.querySelector('#memorial-layout-container').style.display = 'none';
            appRoot.querySelector('#no-memorial-message').style.display = 'block';
        }
    } catch (error) {
        console.error("Failed to load memorial page:", error);
    }
}