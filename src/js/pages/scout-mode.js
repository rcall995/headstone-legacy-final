import { auth, db, storage, functions } from '../firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, addDoc, serverTimestamp, doc, setDoc, GeoPoint } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showModal, hideModal } from '../utils/modal-manager.js';
import { showToast } from '../utils/toasts.js';

let map;
let multiPinMap;
let capturedPins = [];
let scoutPhotoFiles = [];
let firstPhotoFileForOcr = null;
let pinnedLocation = null;

const transcribeHeadstoneImage = httpsCallable(functions, 'transcribeHeadstoneImage');

// --- NEW: UI Cleanup Functions ---
function enterScoutMode() {
    // This function applies the full-screen styles by adding a class to the body.
    document.body.classList.add('scout-mode-active');
    console.log("Entered Scout Mode.");
}

function exitScoutMode() {
    // This is the cleanup function that restores the normal UI by removing the class.
    document.body.classList.remove('scout-mode-active');
    console.log("Exited Scout Mode: UI restored.");
}

// --- NEW: A dedicated function for the "Skip Photo" workflow ---
async function savePinAsDraft(coordinates) {
    const user = auth.currentUser;
    if (!user) {
        showToast("You must be signed in to save a pin.", "error");
        return null;
    }
    
    try {
        const newMemorial = {
            curatorId: user.uid,
            createdAt: serverTimestamp(),
            location: new GeoPoint(coordinates.lat, coordinates.lng),
            status: 'draft', // New pins should ALWAYS start as drafts
            name: 'Untitled Memorial',
            tier: 'memorial',
            tierSortOrder: 4,
        };
        const docRef = await addDoc(collection(db, 'memorials'), newMemorial);
        showToast("New draft saved! You can add details later from your Curator Panel.", "success");
        return docRef.id;
    } catch (error) {
        console.error("Error saving pin as draft:", error);
        showToast("Could not save the pin.", "error");
        return null;
    }
}

// --- (Your existing functions from here, with corrections) ---

function generateSlugId(name) {
    if (!name || name.trim() === '') {
        return `memorial-${Math.random().toString(36).substring(2, 10)}`;
    }
    const slug = name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `${slug}-${randomSuffix}`;
}

function navigateToStep(step) {
    const wizard = document.getElementById('scout-wizard');
    if (wizard) {
        wizard.className = `step-${step}`;
    }
}

function initScoutMap() {
    try {
        mapboxgl.accessToken = process.env.VITE_MAPBOX_ACCESS_TOKEN;
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [-98.5, 39.8],
            zoom: 3.5
        });
        map.addControl(new mapboxgl.NavigationControl());
    } catch (error) {
        console.error("Single-Pin Map initialization failed:", error);
    }
}

function initMultiPinMap() {
    try {
        mapboxgl.accessToken = process.env.VITE_MAPBOX_ACCESS_TOKEN;
        multiPinMap = new mapboxgl.Map({
            container: 'multi-pin-map',
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [-98.5, 39.8],
            zoom: 3.5
        });
        multiPinMap.addControl(new mapboxgl.NavigationControl());
    } catch (error) {
        console.error("Multi-Pin Map initialization failed:", error);
    }
}

function renderCapturedPins() {
    const list = document.getElementById('captured-pins-list');
    const finishBtn = document.getElementById('finish-batch-btn');
    if (!list || !finishBtn) return;
    if (capturedPins.length === 0) {
        list.innerHTML = `<small class="text-muted">No pins captured yet.</small>`;
        finishBtn.disabled = true;
    } else {
        list.innerHTML = '';
        capturedPins.forEach((pin, index) => {
            const thumb = document.createElement('img');
            thumb.className = 'captured-pin-thumb';
            thumb.src = URL.createObjectURL(pin.photoFile);
            thumb.title = `Pin ${index + 1}`;
            list.appendChild(thumb);
        });
        finishBtn.disabled = false;
    }
}

async function handleAddPinAndPhoto() {
    const photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoInput.capture = 'environment';
    photoInput.style.display = 'none';
    document.body.appendChild(photoInput);
    photoInput.addEventListener('change', () => {
        if (photoInput.files && photoInput.files[0]) {
            const photoFile = photoInput.files[0];
            const location = multiPinMap.getCenter();
            capturedPins.push({ location, photoFile });
            renderCapturedPins();
        }
        photoInput.remove();
    });
    photoInput.click();
}

async function handleFinishBatch() {
    const finishBtn = document.getElementById('finish-batch-btn');
    finishBtn.disabled = true;
    finishBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        showToast("Please sign in as a curator to save a batch of pins.", 'error');
        finishBtn.disabled = false;
        finishBtn.textContent = 'Finish & Save Batch';
        return;
    }
    showToast(`Uploading ${capturedPins.length} drafts...`, 'info');
    const promises = capturedPins.map(async (pin) => {
        const photoPath = `memorials/pending/${Date.now()}-${pin.photoFile.name}`;
        const storageRef = ref(storage, photoPath);
        const uploadResult = await uploadBytes(storageRef, pin.photoFile);
        const photoURL = await getDownloadURL(uploadResult.ref);
        const memorialData = {
            location: { lat: pin.location.lat, lng: pin.location.lng },
            photos: [photoURL],
            mainPhoto: photoURL,
            createdAt: serverTimestamp(),
            status: 'draft', // CORRECTED STATUS
            curatorId: user.uid,
            tier: 'memorial',
            tierSortOrder: 4,
            name: 'Untitled Draft'
        };
        const newMemorialId = generateSlugId(`draft-${Date.now()}`);
        const docRef = doc(db, 'memorials', newMemorialId);
        return setDoc(docRef, memorialData);
    });
    try {
        await Promise.all(promises);
        showToast(`${capturedPins.length} drafts saved! Add details from your Curator Panel.`, 'success');
        capturedPins = [];
        history.pushState(null, '', '/curator-panel');
        window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
        console.error("Error saving batch:", error);
        showToast("An error occurred while saving the batch.", "error");
    } finally {
        finishBtn.disabled = false;
        finishBtn.textContent = 'Finish & Save Batch';
    }
}

function handlePhotoPreviews(files) {
    const user = auth.currentUser;
    const isCurator = user && !user.isAnonymous;
    const previewContainer = document.getElementById('scout-photo-preview');
    if (!previewContainer) return;
    scoutPhotoFiles = Array.from(files);
    firstPhotoFileForOcr = null;
    const transcribeBtn = document.getElementById('transcribe-button');
    const usePhotoBtn = document.getElementById('use-photo-button');
    const transcribeHelper = document.getElementById('transcribe-helper');
    if (transcribeBtn) transcribeBtn.disabled = true;
    if (usePhotoBtn) usePhotoBtn.style.display = 'none';
    if (transcribeHelper) transcribeHelper.style.display = 'none';
    if (scoutPhotoFiles.length > 0) {
        firstPhotoFileForOcr = scoutPhotoFiles[0];
        if (usePhotoBtn) usePhotoBtn.style.display = 'block';
        if (isCurator) {
            if (transcribeBtn) transcribeBtn.disabled = false;
        } else {
            if (transcribeHelper) transcribeHelper.style.display = 'block';
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Headstone preview" style="width: 100%; height: 100%; object-fit: contain;">`;
        };
        reader.readAsDataURL(scoutPhotoFiles[0]);
    }
}

async function handleOcr() {
    const transcribeBtn = document.getElementById('transcribe-button');
    if (!firstPhotoFileForOcr || !transcribeBtn || transcribeBtn.disabled) return;
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        showToast("You must be signed in to use this feature.", 'error');
        return;
    }
    transcribeBtn.disabled = true;
    transcribeBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Transcribing...`;
    try {
        const filePath = `transcriptions/${user.uid}/${Date.now()}-${firstPhotoFileForOcr.name}`;
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, firstPhotoFileForOcr);
        const publicUrl = await getDownloadURL(uploadResult.ref);
        const result = await transcribeHeadstoneImage({ imageUrl: publicUrl });
        const text = result.data.text;
        
        document.getElementById('ocr-full-text').value = text;
        document.getElementById('ocr-results-wrapper').style.display = 'block';

        const lines = text.split('\n');
        const nameInput = document.getElementById('scout-name');
        if (nameInput) nameInput.value = lines[0] || '';
        const dateRegex = /(\d{4})\s*[-–—]\s*(\d{4})/;
        const match = text.match(dateRegex);
        if (match) {
            const birthInput = document.getElementById('scout-birth-date');
            const deathInput = document.getElementById('scout-death-date');
            if (birthInput) birthInput.value = match[1];
            if (deathInput) deathInput.value = match[2];
        }
        showToast('Transcription complete! Please review for accuracy.', 'success');
        navigateToStep(3);
    } catch (error) {
        console.error("OCR Error:", error);
        showToast(`Could not transcribe text: ${error.message}`, 'error');
    } finally {
        if (transcribeBtn) {
            transcribeBtn.disabled = false;
            transcribeBtn.innerHTML = `<i class="fas fa-magic"></i> Transcribe`;
        }
    }
}

async function saveMemorialData(curatorId = null, contributorInfo = null) {
    try {
        if (!pinnedLocation) {
            throw new Error("Location pin was not set before submitting.");
        }
        const photoURLs = [];
        if (scoutPhotoFiles.length > 0) {
            const uploadPromises = scoutPhotoFiles.map(file => {
                const storageRef = ref(storage, `memorials/submissions/${Date.now()}-${file.name}`);
                return uploadBytes(storageRef, file).then(snapshot => getDownloadURL(snapshot.ref));
            });
            const urls = await Promise.all(uploadPromises);
            photoURLs.push(...urls);
        }
        const memorialName = document.getElementById('scout-name')?.value || 'Untitled Draft';
        const memorialData = {
            name: memorialName,
            name_lowercase: memorialName.toLowerCase(),
            birthDate: document.getElementById('scout-birth-date')?.value || '',
            deathDate: document.getElementById('scout-death-date')?.value || '',
            location: { lat: pinnedLocation.lat, lng: pinnedLocation.lng },
            photos: photoURLs,
            mainPhoto: photoURLs.length > 0 ? photoURLs[0] : null,
            createdAt: serverTimestamp(),
            tier: 'memorial',
            tierSortOrder: 4
        };

        if (curatorId) {
            memorialData.status = 'draft'; // CORRECTED STATUS
            memorialData.curatorId = curatorId;
        } else {
            memorialData.status = 'pending'; // CORRECTED STATUS
            memorialData.submitterName = contributorInfo.name;
            memorialData.submitterEmail = contributorInfo.email;
        }
        const newMemorialId = generateSlugId(memorialName);
        const docRef = doc(db, 'memorials', newMemorialId);
        await setDoc(docRef, memorialData);
        
        showToast('Submission successful!', 'success');
        
        document.getElementById('pin-form')?.reset();
        document.getElementById('scout-photo-preview').innerHTML = '<div class="placeholder-box"><i class="fas fa-camera fa-3x text-muted"></i></div>';
        scoutPhotoFiles = [];
        pinnedLocation = null;
        navigateToStep(1);

    } catch (error) {
        console.error("Error saving pin:", error);
        showToast("There was an error saving the draft.", "error");
    }
}

async function handlePinFormSubmit(event) {
    event.preventDefault();
    const saveButton = document.getElementById('wizard-submit-button');
    if (!saveButton) return;
    saveButton.disabled = true;
    saveButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Saving...`;
    
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        showModal('contributorModal');
        saveButton.disabled = false;
        saveButton.textContent = 'Submit';
        return;
    }
    
    await saveMemorialData(user.uid);
    saveButton.disabled = false;
    saveButton.textContent = 'Submit';
}

async function handleGuestContribution() {
    const submitButton = document.getElementById('submitContributionButton');
    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Submitting...`;
    
    const contributorName = document.getElementById('contributorName')?.value;
    const contributorEmail = document.getElementById('contributorEmail')?.value;
    if (!contributorName || !contributorEmail) {
        showToast('Please provide your name and email.', 'info');
        submitButton.disabled = false;
        submitButton.textContent = 'Submit for Review';
        return;
    }
    
    await saveMemorialData(null, { name: contributorName, email: contributorEmail });
    hideModal('contributorModal');
    document.getElementById('contributorForm')?.reset();
    submitButton.disabled = false;
    submitButton.textContent = 'Submit for Review';
}

function setupEventListeners() {
    // This is the "Set Pin & Add Photo" button in your wizard.
    document.getElementById('set-pin-button')?.addEventListener('click', () => {
        pinnedLocation = map.getCenter();
        navigateToStep(2);
    });

    // --- NEW: Event Listener for the "Skip Photo" button ---
    document.getElementById('skip-photo-button')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const coordinates = map.getCenter();
        if (!coordinates) {
            showToast("Please set a pin on the map first.", "info");
            return;
        }
        // Use the new helper function to save and get the new ID
        const newId = await savePinAsDraft({ lat: coordinates.lat, lng: coordinates.lng });
        if (newId) {
            // Navigate to the curator panel to see the new draft
            history.pushState(null, '', '/curator-panel');
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
    });

    document.getElementById('gps-button')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            (position) => { if (map) map.flyTo({ center: [position.coords.longitude, position.latitude], zoom: 18 }); },
            (err) => { showToast(`Error getting location: ${err.message}`, 'error'); }
        );
    });
    
    document.getElementById('back-to-location')?.addEventListener('click', (e) => { e.preventDefault(); navigateToStep(1); });
    document.getElementById('use-photo-button')?.addEventListener('click', () => navigateToStep(3));
    document.getElementById('scout-photos')?.addEventListener('change', (e) => handlePhotoPreviews(e.target.files));
    document.getElementById('transcribe-button')?.addEventListener('click', handleOcr);
    
    document.getElementById('back-to-photo')?.addEventListener('click', (e) => { e.preventDefault(); navigateToStep(2); });
    document.getElementById('pin-form')?.addEventListener('submit', handlePinFormSubmit);
    
    document.getElementById('submitContributionButton')?.addEventListener('click', handleGuestContribution);

    const wizardUI = document.getElementById('scout-wizard');
    const multiPinUI = document.getElementById('multi-pin-mode');
    const wizardBtn = document.getElementById('wizard-mode-btn');
    const multiPinBtn = document.getElementById('multi-pin-mode-btn');

    wizardBtn?.addEventListener('click', () => {
        if (wizardUI) wizardUI.style.display = 'block';
        if (multiPinUI) multiPinUI.style.display = 'none';
        wizardBtn.classList.add('active', 'btn-primary');
        wizardBtn.classList.remove('btn-outline-primary');
        multiPinBtn.classList.remove('active', 'btn-primary');
        multiPinBtn.classList.add('btn-outline-primary');
    });
    multiPinBtn?.addEventListener('click', () => {
        if (multiPinUI) multiPinUI.style.display = 'flex';
        if (wizardUI) wizardUI.style.display = 'none';
        multiPinBtn.classList.add('active', 'btn-primary');
        multiPinBtn.classList.remove('btn-outline-primary');
        wizardBtn.classList.remove('active', 'btn-primary');
        wizardBtn.classList.add('btn-outline-primary');
        if (!multiPinMap) initMultiPinMap();
    });

    document.getElementById('add-pin-btn')?.addEventListener('click', handleAddPinAndPhoto);
    document.getElementById('finish-batch-btn')?.addEventListener('click', handleFinishBatch);
    document.getElementById('multi-pin-gps-btn')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            (position) => { if (multiPinMap) multiPinMap.flyTo({ center: [position.coords.longitude, position.latitude], zoom: 18 }); },
            (err) => { showToast(`Error getting location: ${err.message}`, 'error'); }
        );
    });
}

// --- Main export function, MODIFIED ---
export async function loadScoutModePage(appRoot, onUnload) {
    try {
        const response = await fetch('/pages/scout-mode.html');
        if (!response.ok) throw new Error('HTML content for Scout Mode not found');
        appRoot.innerHTML = await response.text();
        
        enterScoutMode(); // Apply full-screen styles
        
        if (onUnload) { // Register the cleanup function
            onUnload(exitScoutMode);
        }

        pinnedLocation = null;
        capturedPins = [];

        if (typeof mapboxgl !== 'undefined') {
            initScoutMap();
            setupEventListeners();
        } else {
            throw new Error("Mapbox library has not loaded yet.");
        }
    } catch (error) {
        console.error("Failed to load Scout Mode page:", error);
        appRoot.innerHTML = `<div class="alert alert-danger m-3" role="alert"><h4 class="alert-heading">Error</h4><p>Could not load Scout Mode. Please ensure you have a stable internet connection and try again.</p><hr><a href="/" class="btn btn-secondary">Go back to Homepage</a></div>`;
        exitScoutMode(); // Run cleanup on error
    }
}