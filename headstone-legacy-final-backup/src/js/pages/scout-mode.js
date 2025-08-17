import { auth, db, storage, functions } from '../firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { collection, addDoc, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showModal, hideModal } from '../utils/modal-manager.js';
import { showToast } from '../utils/toasts.js';
import { getInstallPrompt, resetInstallPrompt } from '../utils/pwa-manager.js';

let map;
let multiPinMap;
let capturedPins = [];
let scoutPhotoFiles = [];
let firstPhotoFileForOcr = null;
let pinnedLocation = null;

const transcribeHeadstoneImage = httpsCallable(functions, 'transcribeHeadstoneImage');

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

function initScoutMap(appRoot) {
    try {
        mapboxgl.accessToken = "pk.eyJ1IjoicmNhbGwxNDA3MiIsImEiOiJjbWUzcmwybmkwOXFyMnRwejhiNG10OXZyIn0.pCk3N77xIXzxh_RmBbnWaA";
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
        mapboxgl.accessToken = "pk.eyJ1IjoicmNhbGwxNDA3MiIsImEiOiJjbWUzcmwybmkwOXFyMnRwejhiNG10OXZyIn0.pCk3N77xIXzxh_RmBbnWaA";
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
    showToast(`Uploading ${capturedPins.length} pins...`, 'info');
    const promises = capturedPins.map(async (pin) => {
        const photoPath = `memorials/pending/${Date.now()}-${pin.photoFile.name}`;
        const storageRef = ref(storage, photoPath);
        const uploadResult = await uploadBytes(storageRef, pin.photoFile);
        const photoURL = await getDownloadURL(uploadResult.ref);
        const memorialData = {
            location: { lat: pin.location.lat, lng: pin.location.lng },
            photos: [photoURL],
            createdAt: serverTimestamp(),
            status: 'pending_details',
            curatorId: user.uid,
            tier: 'memorial',
            tierSortOrder: 4
        };
        const newMemorialId = generateSlugId(`memorial-${Date.now()}`);
        const docRef = doc(db, 'memorials', newMemorialId);
        return setDoc(docRef, memorialData);
    });
    try {
        await Promise.all(promises);
        showToast(`${capturedPins.length} pins saved! Add details from your Curator Panel.`, 'success');
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

function setupScoutInstallButton() {
    const installButton = document.getElementById('add-scout-mode-button');
    const showInstallButton = () => {
        const deferredPrompt = getInstallPrompt();
        if (deferredPrompt && installButton) {
            installButton.style.display = 'inline-block';
        }
    };
    window.addEventListener('pwa-prompt-available', showInstallButton);
    showInstallButton();
    if (installButton) {
        installButton.addEventListener('click', async () => {
            const deferredPrompt = getInstallPrompt();
            if (!deferredPrompt) {
                showToast("Installation not available.", "info");
                return;
            }
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            resetInstallPrompt();
            installButton.style.display = 'none';
        });
    }
}

function setupEventListeners() {
    const handleSetPin = (nextStep) => {
        if (map) {
            pinnedLocation = map.getCenter();
            navigateToStep(nextStep);
        } else {
            showToast('Map not initialized. Please refresh.', 'error');
        }
    };
    document.getElementById('set-pin-button')?.addEventListener('click', () => handleSetPin(2));
    document.getElementById('skip-photo-button')?.addEventListener('click', () => handleSetPin(3));
    document.getElementById('gps-button')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            (position) => { if (map) map.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 18 }); },
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
            previewContainer.innerHTML = `<img src="${e.target.result}" alt="Headstone preview">`;
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
        const ocrWrapper = document.getElementById('ocr-results-wrapper');
        const ocrTextArea = document.getElementById('ocr-full-text');
        if (ocrWrapper && ocrTextArea) {
            ocrTextArea.value = text;
            ocrWrapper.style.display = 'block';
        }
        showToast('Transcription complete! Please review for accuracy.', 'success');
        navigateToStep(3);
    } catch (error) {
        console.error("OCR Error:", error);
        showToast(`Could not transcribe text: ${error.message}`, 'error');
    } finally {
        if (transcribeBtn) {
            transcribeBtn.disabled = false;
            transcribeBtn.innerHTML = `<i class="fas fa-magic"></i> Transcribe Text`;
        }
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

async function saveMemorialData(curatorId = null, contributorInfo = null) {
    try {
        if (!pinnedLocation) {
            showToast('Location not set. Please go back and set the pin on the map.', 'error');
            throw new Error("Location pin was not set before submitting.");
        }
        const photoURLs = [];
        if (scoutPhotoFiles.length > 0) {
            const uploadPromises = scoutPhotoFiles.map(file => {
                const storageRef = ref(storage, `memorials/pending/${Date.now()}-${file.name}`);
                return uploadBytes(storageRef, file).then(snapshot => getDownloadURL(snapshot.ref));
            });
            const urls = await Promise.all(uploadPromises);
            photoURLs.push(...urls);
        }
        const memorialName = document.getElementById('scout-name')?.value;
        const memorialData = {
            name: memorialName,
            birthDate: document.getElementById('scout-birth-date')?.value,
            deathDate: document.getElementById('scout-death-date')?.value,
            location: { lat: pinnedLocation.lat, lng: pinnedLocation.lng },
            photos: photoURLs,
            createdAt: serverTimestamp(),
            tier: 'memorial',
            tierSortOrder: 4
        };
        const urlParams = new URLSearchParams(window.location.search);
        const sourceId = urlParams.get('sourceId');
        if (sourceId) {
            memorialData.sourceMemorialId = sourceId;
            memorialData.relationshipToSource = document.getElementById('scout-relationship')?.value || 'Relative';
        }
        if (curatorId) {
            memorialData.status = 'approved';
            memorialData.curatorId = curatorId;
        } else {
            memorialData.status = 'pending_approval';
            memorialData.submittedByName = contributorInfo.name;
            memorialData.submittedByEmail = contributorInfo.email;
        }
        const newMemorialId = generateSlugId(memorialName);
        const docRef = doc(db, 'memorials', newMemorialId);
        await setDoc(docRef, memorialData);
        showToast('The new memorial pin has been saved.', 'success');
        navigateToStep(1);
        document.getElementById('pin-form')?.reset();
        document.getElementById('scout-photo-preview').innerHTML = '<div class="placeholder-box"><i class="fas fa-camera fa-3x text-muted"></i></div>';
        scoutPhotoFiles = [];
        pinnedLocation = null;
    } catch (error) {
        console.error("Error saving pin:", error);
    }
}

export async function loadScoutModePage(appRoot) {
    try {
        const response = await fetch('/pages/scout-mode.html');
        if (!response.ok) throw new Error('HTML content for Scout Mode not found');
        appRoot.innerHTML = await response.text();
        document.body.id = 'scout-mode-body';
        pinnedLocation = null;
        const wizardUI = document.getElementById('scout-wizard');
        const multiPinUI = document.getElementById('multi-pin-mode');
        const wizardBtn = document.getElementById('wizard-mode-btn');
        const multiPinBtn = document.getElementById('multi-pin-mode-btn');
        wizardBtn?.addEventListener('click', () => {
            if(wizardUI) wizardUI.style.display = 'block';
            if(multiPinUI) multiPinUI.style.display = 'none';
            wizardBtn.classList.add('active', 'btn-primary');
            wizardBtn.classList.remove('btn-outline-primary');
            multiPinBtn.classList.remove('active', 'btn-primary');
            multiPinBtn.classList.add('btn-outline-primary');
        });
        multiPinBtn?.addEventListener('click', () => {
            if(multiPinUI) multiPinUI.style.display = 'flex';
            if(wizardUI) wizardUI.style.display = 'none';
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
                 (position) => { if (multiPinMap) multiPinMap.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 18 }); },
                 (err) => { showToast(`Error getting location: ${err.message}`, 'error'); }
            );
        });
        const urlParams = new URLSearchParams(window.location.search);
        const prefilledName = urlParams.get('name');
        const nameInput = document.getElementById('scout-name');
        if (prefilledName && nameInput) {
            nameInput.value = prefilledName;
        }
        const sourceId = urlParams.get('sourceId');
        const relationshipWrapper = document.getElementById('relationship-wrapper');
        if (sourceId && relationshipWrapper) {
            relationshipWrapper.style.display = 'block';
        }
        if (typeof mapboxgl !== 'undefined') {
            initScoutMap(appRoot);
            setupEventListeners();
            setupScoutInstallButton();
        } else {
            throw new Error("Mapbox library has not loaded yet.");
        }
    } catch (error) {
        console.error("Failed to load Scout Mode page:", error);
        appRoot.innerHTML = `<div class="alert alert-danger m-3" role="alert"><h4 class="alert-heading">Error</h4><p>Could not load Scout Mode. Please ensure you have a stable internet connection and try again.</p><hr><a href="/" class="btn btn-secondary">Go back to Homepage</a></div>`;
    }
}