/**
 * src/js/pages/curator-panel.js
 * This file loads the curator panel HTML, toggles the view based on auth state,
 * and now fetches and renders data from Firestore.
 */

// Import Firestore functions
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase-config.js";

// Generic function to render items into a list
function renderItems(containerId, templateId, docs, configureItem) {
    const container = document.getElementById(containerId);
    const template = document.getElementById(templateId);
    if (!container || !template) {
        console.error(`Missing container #${containerId} or template #${templateId}`);
        return;
    }

    container.innerHTML = ''; // Clear "Loading..." message
    if (docs.length === 0) {
        container.innerHTML = '<p class="text-muted">No items to display.</p>';
        return;
    }

    docs.forEach(doc => {
        const clone = template.content.cloneNode(true);
        configureItem(clone, doc.data(), doc.id); // Pass clone, data, and doc ID to the config function
        container.appendChild(clone);
    });
}

// Functions to load data for each section

async function loadDrafts(user) {
    const q = query(
        collection(db, "memorials"),
        where("curatorId", "==", user.uid),
        where("status", "==", "draft"),
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    renderItems('draft-list-container', 'memorial-item-template', querySnapshot.docs, (clone, data, id) => {
        clone.querySelector('.memorial-name').textContent = data.name || 'Untitled Draft';
        clone.querySelector('.view-link').href = `/memorial?id=${id}`;
        clone.querySelector('.edit-link').href = `/memorial-form?id=${id}`;
    });
}

async function loadMyMemorials(user) {
    const q = query(
        collection(db, "memorials"),
        where("curatorId", "==", user.uid),
        where("status", "==", "approved"), // <-- THIS IS THE FIX
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    renderItems('memorial-list-container', 'memorial-item-template', querySnapshot.docs, (clone, data, id) => {
        clone.querySelector('.memorial-name').textContent = data.name;
        clone.querySelector('.view-link').href = `/memorial?id=${id}`;
        clone.querySelector('.edit-link').href = `/memorial-form?id=${id}`;
    });
}

async function loadPendingMemorials() {
    const q = query(
        collection(db, "memorials"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    renderItems('pending-list-container', 'pending-item-template', querySnapshot.docs, (clone, data, id) => {
        const submissionName = clone.querySelector('.submission-name');
        if (submissionName) submissionName.textContent = data.name || 'Unnamed Submission';
        
        const byline = clone.querySelector('.submission-byline');
        if (byline) byline.textContent = `Submitted by: ${data.submitterName || 'Unknown'}`;
        
        const thumbnail = clone.querySelector('.submission-thumbnail');
        if (thumbnail && data.mainPhoto) thumbnail.src = data.mainPhoto;
    });
}


async function loadPendingTributes() {
    const q = query(
        collection(db, "tributes"),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    renderItems('pending-tributes-container', 'pending-tribute-template', querySnapshot.docs, (clone, data, id) => {
        clone.querySelector('.tribute-message').textContent = data.message;
        clone.querySelector('.tribute-author').textContent = data.authorName;
        clone.querySelector('.tribute-memorial-name').textContent = data.memorialName;
    });
}

// Main export function
export async function loadCuratorPanel(appRoot, user) {
    try {
        const response = await fetch('/pages/curator-panel.html');
        if (!response.ok) {
            throw new Error('Failed to load curator panel HTML');
        }
        appRoot.innerHTML = await response.text();

        if (user) {
            const authSection = document.getElementById('auth-section');
            const dashboard = document.getElementById('dashboard');
            
            if (authSection) authSection.style.display = 'none';
            if (dashboard) dashboard.style.display = 'block';

            const curatorNameEl = document.getElementById('curator-name');
            if (curatorNameEl && user.displayName) {
                curatorNameEl.textContent = user.displayName;
            }
            
            // Call all the data-loading functions
            loadDrafts(user);
            loadMyMemorials(user);
            loadPendingMemorials();
            loadPendingTributes();
        }

    } catch (error) {
        console.error("Error loading curator panel:", error);
        appRoot.innerHTML = '<p class="text-center text-danger p-5">Could not load the curator panel.</p>';
    }
}