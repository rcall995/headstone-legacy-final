import { auth, db, storage, functions } from '../firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getDoc, setDoc, doc, collection, query, where, getDocs, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showToast } from '../utils/toasts.js';

const geocodeAddress = httpsCallable(functions, 'geocodeAddress');
const generateBioFromPrompts = httpsCallable(functions, 'generateBioFromPrompts');

let mediaFiles = { mainPhoto: null, photos: [], videos: [] };
let existingMedia = { mainPhoto: null, photos: [], videos: [] };
let deletedMedia = { photos: [], videos: [] };
let draggedItem = null;
let linkRelativeModalInstance;
let currentRelativeRow = null;

async function handleGenerateBio(appRoot) {
    const generateBtn = appRoot.querySelector('#generate-bio-btn');
    const memorialName = appRoot.querySelector('#memorial-name').value;
    const bioTextarea = appRoot.querySelector('#memorial-bio');

    if (!memorialName) {
        showToast("Please enter the person's name first.", "info");
        return;
    }

    const hobbies = appRoot.querySelector('#prompt-hobbies').value.trim();
    const memory = appRoot.querySelector('#prompt-memory').value.trim();
    const personality = appRoot.querySelector('#prompt-personality').value.trim();

    const promptData = [
        hobbies ? `Hobbies and passions: ${hobbies}` : '',
        memory ? `A favorite memory: ${memory}` : '',
        personality ? `Personality traits: ${personality}` : ''
    ].filter(Boolean).join('\n- ');

    if (!promptData) {
        showToast("Please answer at least one question to generate the biography.", "info");
        return;
    }

    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Generating...`;

    try {
        const result = await generateBioFromPrompts({ name: memorialName, promptData });
        if (result.data.biography) {
            bioTextarea.value = result.data.biography;
            showToast("Biography generated! You can edit it below.", "success");
        }
    } catch (error) {
        console.error("Error generating biography:", error);
        showToast("Could not generate biography. Please try again.", "error");
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<i class="fas fa-magic"></i> Write Biography with AI ✨`;
    }
}

function generateSlugId(name) {
    if (!name || name.trim() === '') {
        return `memorial-${Math.random().toString(36).substring(2, 10)}`;
    }
    const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${slug}-${randomSuffix}`;
}

function resetState() {
    mediaFiles = { mainPhoto: null, photos: [], videos: [] };
    existingMedia = { mainPhoto: null, photos: [], videos: [] };
    deletedMedia = { photos: [], videos: [] };
    draggedItem = null;
    linkRelativeModalInstance = null;
    currentRelativeRow = null;
}

function getAuthUser() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

function displayMediaPreview(appRoot, containerId, fileOrUrl, isExisting = false) {
    const previewContainer = appRoot.querySelector(`#${containerId}`);
    if (!previewContainer) return;
    const src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    const previewItem = document.createElement('div');
    previewItem.className = 'col-4 media-preview-item';
    previewItem.innerHTML = `<img src="${src}" class="img-fluid rounded"><button type="button" class="btn btn-danger btn-sm remove-media-btn">×</button>`;
    previewContainer.appendChild(previewItem);
    previewItem.querySelector('.remove-media-btn').addEventListener('click', () => {
        if (isExisting) {
            if (containerId === 'main-photo-preview') {
                existingMedia.mainPhoto = null;
            } else {
                const index = existingMedia.photos.indexOf(fileOrUrl);
                if (index > -1) {
                    deletedMedia.photos.push(existingMedia.photos.splice(index, 1)[0]);
                }
            }
        } else {
             if (containerId === 'main-photo-preview') {
                mediaFiles.mainPhoto = null;
            } else {
                const index = mediaFiles.photos.indexOf(fileOrUrl);
                if (index > -1) mediaFiles.photos.splice(index, 1);
            }
        }
        previewItem.remove();
    });
}

function addDynamicField(appRoot, type, values = {}) {
    const container = appRoot.querySelector(`#${type}-container`);
    if (!container) return;
    if (type === 'relatives') {
        const template = appRoot.querySelector('#relative-input-template');
        if (!template) return;
        const newField = template.content.cloneNode(true);
        newField.querySelector('.relative-name-input').value = values.name || '';
        newField.querySelector('.relative-relationship-input').value = values.relationship || '';
        newField.querySelector('.relative-memorial-id').value = values.memorialId || '';
        const linkBtn = newField.querySelector('.link-btn');
        if (values.memorialId) {
            linkBtn.textContent = 'Linked ✔';
            linkBtn.classList.add('btn-success');
            linkBtn.classList.remove('btn-outline-primary');
        }
        linkBtn.addEventListener('click', (e) => {
            currentRelativeRow = e.target.closest('.dynamic-input-group');
            if (linkRelativeModalInstance) linkRelativeModalInstance.show();
        });
        newField.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.target.closest('.dynamic-input-group').remove();
        });
        container.appendChild(newField);
    } else {
        const newField = document.createElement('div');
        newField.className = 'row g-2 mb-2 dynamic-input-group align-items-center';
        let fieldsHtml = '';
        if (type === 'milestones') {
            newField.setAttribute('draggable', 'true');
            fieldsHtml = `<div class="col-1 text-center"><i class="fas fa-grip-vertical drag-handle"></i></div><div class="col-md-3"><input type="text" class="form-control milestone-year-input" placeholder="Year" value="${values.year || ''}"></div><div class="col-md-6"><input type="text" class="form-control milestone-desc-input" placeholder="Description" value="${values.description || ''}"></div><div class="col-md-2"><button type="button" class="btn btn-outline-danger btn-sm w-100 remove-btn"><i class="fas fa-trash"></i></button></div>`;
        } else if (type === 'quotes') {
            fieldsHtml = `<div class="col-md-10"><input type="text" class="form-control quote-input" placeholder="Quote" value="${values.quote || ''}"></div><div class="col-md-2"><button type="button" class="btn btn-outline-danger btn-sm w-100 remove-btn"><i class="fas fa-trash"></i></button></div>`;
        }
        newField.innerHTML = fieldsHtml;
        container.appendChild(newField);
        newField.querySelector('.remove-btn').addEventListener('click', () => newField.remove());
    }
}

async function searchMemorials(searchTerm) {
    const resultsContainer = document.getElementById('relative-search-results');
    resultsContainer.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm"></div></div>';
    const lowerCaseTerm = searchTerm.toLowerCase();

    if (lowerCaseTerm.length < 2) {
        resultsContainer.innerHTML = '<p class="text-muted text-center">Please type at least 2 characters.</p>';
        return;
    }
    
    try {
        const memorialsRef = collection(db, 'memorials');
        const q = query(
            memorialsRef,
            where('status', '==', 'approved'),
            where('name_lowercase', '>=', lowerCaseTerm),
            where('name_lowercase', '<=', lowerCaseTerm + '\uf8ff'),
            limit(10)
        );

        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            resultsContainer.innerHTML = '<p class="text-muted text-center">No memorials found.</p>';
            return;
        }

        resultsContainer.innerHTML = '';
        querySnapshot.forEach(doc => {
            const memorial = { id: doc.id, ...doc.data() };
            const resultItem = document.createElement('a');
            resultItem.href = '#';
            resultItem.className = 'list-group-item list-group-item-action relative-search-result-item';
            resultItem.innerHTML = `<strong>${memorial.name}</strong><br><small>${memorial.birthDate || ''} - ${memorial.deathDate || ''}</small>`;
            resultItem.addEventListener('click', (e) => {
                e.preventDefault();
                if (currentRelativeRow) {
                    currentRelativeRow.querySelector('.relative-name-input').value = memorial.name;
                    currentRelativeRow.querySelector('.relative-memorial-id').value = memorial.id;
                    const linkBtn = currentRelativeRow.querySelector('.link-btn');
                    linkBtn.textContent = 'Linked ✔';
                    linkBtn.classList.add('btn-success');
                    linkBtn.classList.remove('btn-outline-primary');
                }
                if (linkRelativeModalInstance) linkRelativeModalInstance.hide();
            });
            resultsContainer.appendChild(resultItem);
        });
    } catch (error) {
        console.error("Error searching memorials:", error);
        resultsContainer.innerHTML = `<p class="text-center text-danger">Search failed. Please check the console for errors.</p>`;
    }
}

async function saveMemorial(e, memorialId, appRoot) {
    e.preventDefault();
    const form = e.target;
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    const currentUser = await getAuthUser();
    if (!currentUser) {
        showToast("You must be signed in to save a memorial.", "error");
        return;
    }

    const saveButton = appRoot.querySelector('#save-memorial-button');
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;

    try {
        const memorialName = appRoot.querySelector('#memorial-name').value;
        const newMemorialId = memorialId ? memorialId : generateSlugId(memorialName);
        const docRef = doc(db, 'memorials', newMemorialId);
        const birthDate = appRoot.querySelector('#memorial-birth-date').value;
        const deathDate = appRoot.querySelector('#memorial-death-date').value;
        const getMonthDay = (dateStr) => {
            if (!dateStr || !dateStr.includes('-') || dateStr.length < 8) return null;
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return null; 
                return `${(date.getUTCMonth() + 1).toString().padStart(2, '0')}-${date.getUTCDate().toString().padStart(2, '0')}`;
            } catch (e) { return null; }
        };
        const memorialData = {
            name: memorialName,
            name_lowercase: memorialName.toLowerCase(),
            title: appRoot.querySelector('#memorial-title').value,
            birthDate: birthDate,
            deathDate: deathDate,
            birthMonthDay: getMonthDay(birthDate),
            deathMonthDay: getMonthDay(deathDate),
            bio: appRoot.querySelector('#memorial-bio').value,
            tier: appRoot.querySelector('#memorial-tier').value,
            curatorId: currentUser.uid,
            status: 'approved',
            cemeteryName: appRoot.querySelector('#memorial-cemetery-name').value,
            cemeteryAddress: appRoot.querySelector('#memorial-cemetery-address').value,
            relatives: Array.from(appRoot.querySelectorAll('#relatives-container .dynamic-input-group')).map(group => ({
                name: group.querySelector('.relative-name-input').value,
                relationship: group.querySelector('.relative-relationship-input').value,
                memorialId: group.querySelector('.relative-memorial-id').value || null
            })),
            milestones: Array.from(appRoot.querySelectorAll('#milestones-container .dynamic-input-group')).map(group => ({
                year: group.querySelector('.milestone-year-input').value,
                description: group.querySelector('.milestone-desc-input').value,
            })),
            quotes: Array.from(appRoot.querySelectorAll('#quotes-container .dynamic-input-group')).map(group => ({
                quote: group.querySelector('.quote-input').value,
            })),
            photos: [...existingMedia.photos],
        };
        
        if (!memorialId) {
            memorialData.tierSortOrder = 4;
        }

        if (mediaFiles.mainPhoto) {
            const photoRef = ref(storage, `memorials/${newMemorialId}/main-photo.jpg`);
            await uploadBytes(photoRef, mediaFiles.mainPhoto);
            memorialData.mainPhoto = await getDownloadURL(photoRef);
        } else if (existingMedia.mainPhoto) {
            memorialData.mainPhoto = existingMedia.mainPhoto;
        } else {
            memorialData.mainPhoto = null;
        }
        if (mediaFiles.photos.length > 0) {
            const uploadPromises = mediaFiles.photos.map((file, index) => {
                const photoRef = ref(storage, `memorials/${newMemorialId}/photo-${Date.now()}-${index}`);
                return uploadBytes(photoRef, file).then(snapshot => getDownloadURL(snapshot.ref));
            });
            const newUrls = await Promise.all(uploadPromises);
            memorialData.photos.push(...newUrls);
        }
        if (memorialData.tier === 'historian' && memorialData.cemeteryAddress) {
            try {
                const result = await geocodeAddress({ address: memorialData.cemeteryAddress });
                memorialData.location = result.data;
            } catch (error) {
                console.error("Geocoding failed:", error);
            }
        }
        await setDoc(docRef, memorialData, { merge: true });
        showToast('Memorial saved successfully!', 'success');
        history.pushState(null, '', `/memorial?id=${newMemorialId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
        console.error("Error saving memorial:", error);
        showToast("There was an error saving the memorial.", 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Memorial';
    }
}

async function deleteMemorial(memorialId) {
    const warningMessage = "Are you sure you want to permanently delete this memorial?\n\nAll associated photos, tributes, and data will be lost forever. This action cannot be undone.";
    if (confirm(warningMessage)) {
        try {
            await deleteDoc(doc(db, "memorials", memorialId));
            showToast("Memorial permanently deleted.", "success");
            history.pushState(null, '', '/curator-panel');
            window.dispatchEvent(new PopStateEvent('popstate'));
        } catch (error) {
            console.error("Error deleting memorial:", error);
            showToast("Failed to delete memorial.", "error");
        }
    }
}

async function populateFormForEdit(appRoot, memorialId) {
    const docRef = doc(db, 'memorials', memorialId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        appRoot.querySelector('#form-title').textContent = 'Edit Your Memorial';
        appRoot.querySelector('#memorial-name').value = data.name || '';
        appRoot.querySelector('#memorial-title').value = data.title || '';
        appRoot.querySelector('#memorial-tier').value = data.tier || 'memorial';
        appRoot.querySelector('#memorial-birth-date').value = data.birthDate || '';
        appRoot.querySelector('#memorial-death-date').value = data.deathDate || '';
        appRoot.querySelector('#memorial-bio').value = data.bio || '';
        appRoot.querySelector('#memorial-cemetery-name').value = data.cemeteryName || '';
        appRoot.querySelector('#memorial-cemetery-address').value = data.cemeteryAddress || '';
        if (data.mainPhoto) {
            existingMedia.mainPhoto = data.mainPhoto;
            displayMediaPreview(appRoot, 'main-photo-preview', data.mainPhoto, true);
        }
        if (data.photos && data.photos.length > 0) {
            existingMedia.photos = [...data.photos];
            existingMedia.photos.forEach(url => displayMediaPreview(appRoot, 'photos-preview', url, true));
        }
        if (data.relatives && data.relatives.length > 0) {
            data.relatives.forEach(r => addDynamicField(appRoot, 'relatives', r));
        }
        if (data.milestones && data.milestones.length > 0) {
            data.milestones.forEach(m => addDynamicField(appRoot, 'milestones', m));
        }
        if (data.quotes && data.quotes.length > 0) {
            data.quotes.forEach(q => addDynamicField(appRoot, 'quotes', q));
        }
        adjustFormForTier(appRoot, data.tier);
        const deleteBtn = appRoot.querySelector('#delete-memorial-button');
        if (deleteBtn) {
            deleteBtn.style.display = 'block';
        }
    }
}

// THIS IS THE CORRECTED, MORE RESILIENT FUNCTION
function adjustFormForTier(appRoot, tier) {
    // Find elements safely by checking if they exist before accessing properties
    const memorialPhotosEl = appRoot.querySelector('#memorial-photos');
    const additionalPhotos = memorialPhotosEl ? memorialPhotosEl.parentElement : null;
    
    const videosSection = appRoot.querySelector('#videos-section');
    const milestonesSection = appRoot.querySelector('#milestones-section');
    const quotesSection = appRoot.querySelector('#quotes-section');
    const historianFields = appRoot.querySelector('#historian-fields');

    // Hide everything first
    if (additionalPhotos) additionalPhotos.style.display = 'none';
    if (videosSection) videosSection.style.display = 'none';
    if (milestonesSection) milestonesSection.style.display = 'none';
    if (quotesSection) quotesSection.style.display = 'none';
    if (historianFields) historianFields.style.display = 'none';

    // Show sections based on tier
    if (tier === 'storyteller' || tier === 'legacy' || tier === 'historian') {
        if (additionalPhotos) additionalPhotos.style.display = 'block';
        if (milestonesSection) milestonesSection.style.display = 'block';
        if (quotesSection) quotesSection.style.display = 'block';
    }
    if (tier === 'legacy' || tier === 'historian') {
        if (videosSection) videosSection.style.display = 'block';
    }
    if (tier === 'historian') {
        if (historianFields) historianFields.style.display = 'block';
    }
}

async function initializePage(appRoot, urlParams) {
    resetState();
    const currentUser = await getAuthUser();
    if (!currentUser) {
        showToast("Sign in as a curator to save your work.", 'info');
    }
    const memorialId = urlParams.get('id');
    const tier = urlParams.get('tier');
    if (memorialId) {
        await populateFormForEdit(appRoot, memorialId);
    } else if (tier) {
        const memorialTierInput = appRoot.querySelector('#memorial-tier');
        if (memorialTierInput) memorialTierInput.value = tier;
        adjustFormForTier(appRoot, tier);
    } else {
        const memorialTierInput = appRoot.querySelector('#memorial-tier');
        if (memorialTierInput) memorialTierInput.value = 'memorial';
        adjustFormForTier(appRoot, 'memorial');
    }
    const linkModalEl = document.getElementById('linkRelativeModal');
    if (linkModalEl) {
        linkRelativeModalInstance = new bootstrap.Modal(linkModalEl);
        const searchInput = document.getElementById('relativeSearchInput');
        searchInput.addEventListener('input', (e) => searchMemorials(e.target.value));
        linkModalEl.addEventListener('hidden.bs.modal', () => {
            searchInput.value = '';
            document.getElementById('relative-search-results').innerHTML = '';
        });
    }
    const navigateTo = (path) => {
        history.pushState(null, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };
    appRoot.querySelector('#generate-bio-btn')?.addEventListener('click', () => handleGenerateBio(appRoot));
    appRoot.querySelector('#memorialForm').addEventListener('submit', (e) => saveMemorial(e, memorialId, appRoot));
    appRoot.querySelector('#go-back-button').addEventListener('click', () => navigateTo('/curator-panel'));
    appRoot.querySelector('#cancel-memorial-button').addEventListener('click', () => navigateTo('/curator-panel'));
    const deleteBtn = appRoot.querySelector('#delete-memorial-button');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (memorialId) {
                deleteMemorial(memorialId);
            }
        });
    }
    appRoot.querySelector('#add-relative-button')?.addEventListener('click', () => addDynamicField(appRoot, 'relatives'));
    appRoot.querySelector('#add-milestone-button')?.addEventListener('click', () => addDynamicField(appRoot, 'milestones', {}));
    appRoot.querySelector('#add-quote-button')?.addEventListener('click', () => addDynamicField(appRoot, 'quotes', {}));
    appRoot.querySelector('#memorial-main-photo')?.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            mediaFiles.mainPhoto = e.target.files[0];
            appRoot.querySelector('#main-photo-preview').innerHTML = '';
            displayMediaPreview(appRoot, 'main-photo-preview', mediaFiles.mainPhoto);
        }
    });
    appRoot.querySelector('#memorial-photos')?.addEventListener('change', (e) => {
        mediaFiles.photos = Array.from(e.target.files);
        appRoot.querySelector('#photos-preview').innerHTML = '';
        existingMedia.photos.forEach(url => displayMediaPreview(appRoot, 'photos-preview', url, true));
        mediaFiles.photos.forEach(file => displayMediaPreview(appRoot, 'photos-preview', file));
    });
}

export async function loadMemorialFormPage(appRoot, urlParams) {
    try {
        const response = await fetch('/pages/memorial-form.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        await initializePage(appRoot, urlParams);
    } catch (error) {
        console.error("Failed to load memorial form page:", error);
    }
}