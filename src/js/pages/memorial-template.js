import { db, auth } from '../firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// This is the corrected, interactive map function
function initMap(container, primaryLocation) {
    if (!container || !primaryLocation || typeof mapboxgl === 'undefined') {
        console.error("Map container, location, or Mapbox GL JS is missing.");
        return;
    }
    try {
        mapboxgl.accessToken = process.env.VITE_MAPBOX_ACCESS_TOKEN;
        const map = new mapboxgl.Map({
            container: container,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [primaryLocation.lng, primaryLocation.lat],
            zoom: 15,
            interactive: true // Map is now fully interactive
        });

        // Add zoom and rotation controls
        map.addControl(new mapboxgl.NavigationControl());

        new mapboxgl.Marker()
            .setLngLat([primaryLocation.lng, primaryLocation.lat])
            .addTo(map);

    } catch (error) {
        console.error("Error initializing memorial map:", error);
        container.innerHTML = `<p class="text-danger text-center">Could not load map.</p>`;
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    if (/^\d{4}$/.test(dateString.trim())) {
        return dateString.trim();
    }
    const date = new Date(`${dateString}T00:00:00`);
    if (isNaN(date.getTime())) { return dateString; }
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleDateString(undefined, options);
}

async function renderMemorial(appRoot, data) {
    const currentUser = await new Promise(resolve => onAuthStateChanged(auth, user => resolve(user)));
    const tier = data.tier || 'memorial';

    // Basic Info
    appRoot.querySelector('#display-name').textContent = data.name || 'Unnamed Memorial';
    appRoot.querySelector('#display-dates').textContent = `${formatDate(data.birthDate)} - ${formatDate(data.deathDate)}`;
    appRoot.querySelector('#display-bio').innerHTML = data.bio ? data.bio.replace(/\n/g, '<br>') : 'No biography provided.';
    
    // Main Photo
    const mainMediaContainer = appRoot.querySelector('#display-main-media');
    if (data.mainPhoto) {
        mainMediaContainer.innerHTML = `<img src="${data.mainPhoto}" alt="${data.name}" class="img-fluid rounded shadow-sm">`;
    } else {
        mainMediaContainer.innerHTML = `<div class="bg-light rounded d-flex align-items-center justify-content-center" style="height: 300px;"><i class="fas fa-image fa-3x text-muted"></i></div>`;
    }
    
    // Edit Button Visibility
    const editButton = appRoot.querySelector('#edit-memorial-button');
    if (editButton) {
        if (currentUser && currentUser.uid === data.curatorId) {
            editButton.style.display = 'block';
        } else {
            editButton.style.display = 'none';
        }
    }

    // Tier-based Content Sections
    const milestonesSection = appRoot.querySelector('#milestones-section-display');
    const quotesSection = appRoot.querySelector('#quotes-section-display');
    const photosSection = appRoot.querySelector('#photos-section-display');
    const historianSection = appRoot.querySelector('#historian-content-display');
    
    // Hide all optional sections by default
    milestonesSection.style.display = 'none';
    quotesSection.style.display = 'none';
    photosSection.style.display = 'none';
    historianSection.style.display = 'none';

    // Show sections based on tier and if data exists
    if (tier === 'storyteller' || tier === 'legacy' || tier === 'historian') {
        if (data.milestones && data.milestones.length > 0) {
            milestonesSection.querySelector('#display-milestones').innerHTML = data.milestones
                .map(m => `<li class="list-group-item"><strong>${m.year}:</strong> ${m.description}</li>`)
                .join('');
            milestonesSection.style.display = 'block';
        }

        if (data.quotes && data.quotes.length > 0) {
            quotesSection.querySelector('#display-quotes').innerHTML = data.quotes
                .map(q => `<li class="mb-2"><blockquote>"${q.quote}"</blockquote></li>`)
                .join('');
            quotesSection.style.display = 'block';
        }

        if (data.photos && data.photos.length > 0) {
            photosSection.querySelector('#display-photos').innerHTML = data.photos
                .map(p => `<div class="col-6 col-md-4 col-lg-3"><a href="${p}" target="_blank"><img src="${p}" class="img-fluid rounded shadow-sm"></a></div>`)
                .join('');
            photosSection.style.display = 'block';
        }
    }

    if (tier === 'historian') {
        historianSection.style.display = 'block';

        if (data.cemeteryAddress) {
            appRoot.querySelector('#display-cemetery-address').textContent = data.cemeteryAddress;
        }

        if (data.location) {
            setTimeout(() => initMap(appRoot.querySelector('#map-container'), data.location), 100);
        }

        const relativesSection = appRoot.querySelector('#relatives-section-display');
        if (data.relatives && data.relatives.length > 0) {
            const relativesList = appRoot.querySelector('#display-relatives');
            const template = appRoot.querySelector('#relative-item-template');
            relativesList.innerHTML = '';
            data.relatives.forEach(r => {
                const clone = template.content.cloneNode(true);
                clone.querySelector('.relative-info').textContent = `${r.name} (${r.relationship})`;
                const viewBtn = clone.querySelector('.view-memorial-btn');
                const findBtn = clone.querySelector('.find-pin-btn');

                if (r.memorialId) {
                    viewBtn.href = `/memorial?id=${r.memorialId}`;
                    viewBtn.style.display = 'inline-block';
                } else {
                    findBtn.href = `/scout-mode?name=${encodeURIComponent(r.name)}`;
                    findBtn.style.display = 'inline-block';
                }
                relativesList.appendChild(clone);
            });
            relativesSection.style.display = 'block';
        }
    }
}

function addEventListeners(appRoot, memorialId) {
    appRoot.querySelector('#edit-memorial-button')?.addEventListener('click', () => {
        history.pushState(null, '', `/memorial-form?id=${memorialId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    });
}

export async function loadMemorialPage(appRoot, memorialId, setListener) {
    try {
        const response = await fetch('/pages/memorial-template.html');
        if (!response.ok) throw new Error('HTML content not found');
        appRoot.innerHTML = await response.text();
        document.body.className = 'memorial-page-body';

        if (memorialId) {
            const docRef = doc(db, 'memorials', memorialId);
            const unsubscribe = onSnapshot(docRef, async (docSnap) => {
                try {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        await renderMemorial(appRoot, data);
                        addEventListeners(appRoot, memorialId);
                        appRoot.querySelector('#memorial-layout-container').style.display = 'block';
                    } else {
                        appRoot.querySelector('#memorial-layout-container').style.display = 'none';
                        appRoot.querySelector('#no-memorial-message').style.display = 'block';
                    }
                } catch (error) {
                    console.error("Error rendering memorial data:", error);
                    appRoot.innerHTML = `<div class="container p-5"><p class="text-center text-danger">Could not display the memorial due to an error. Please check the console.</p></div>`;
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
        console.error("Failed to load memorial page structure:", error);
    }
}