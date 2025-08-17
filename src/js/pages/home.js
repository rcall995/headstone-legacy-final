import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function loadRecentMemorials() {
    const container = document.getElementById('recent-memorials-container');
    if (!container) return;

    try {
        const memorialsRef = collection(db, 'memorials');
        // --- THIS LINE IS THE FIX ---
        // Changed 'approved' to 'published' to match your Firestore security rules.
        const q = query(memorialsRef, where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(5));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<p class="text-muted text-center w-100">No memorials have been added yet.</p>';
            return;
        }

        let memorialsHtml = '';
        querySnapshot.forEach(doc => {
            const memorial = { id: doc.id, ...doc.data() };
            const imageUrl = memorial.mainPhoto || '/logo1.png';
            memorialsHtml += `
                <a href="/memorial?id=${memorial.id}" class="card text-decoration-none text-dark shadow-sm memorial-card" style="min-width: 200px;">
                    <img src="${imageUrl}" class="card-img-top" alt="${memorial.name}" style="height: 180px; object-fit: cover;">
                    <div class="card-body">
                        <h6 class="card-title mb-0">${memorial.name}</h6>
                    </div>
                </a>
            `;
        });
        container.innerHTML = memorialsHtml;

    } catch (error) {
        console.error("Error loading recent memorials:", error);
        container.innerHTML = '<p class="text-danger text-center w-100">Could not load memorials at this time.</p>';
    }
}

async function initHomepageMap() {
    const mapContainer = document.getElementById("homepage-map-container");
    if (!mapContainer || typeof mapboxgl === 'undefined') {
        return;
    }

    try {
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        
        const map = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mapbox/satellite-streets-v12',
            center: [-98.5, 39.8],
            zoom: 3.5,
            interactive: true
        });

        map.addControl(new mapboxgl.NavigationControl());

        const memorialsRef = collection(db, 'memorials');
        const q = query(memorialsRef, where('status', '==', 'published'), where('location', '!=', null));
        const querySnapshot = await getDocs(q);

        const geojsonFeatures = [];
        querySnapshot.forEach(doc => {
            const memorial = { id: doc.id, ...doc.data() };
            if (memorial.location && memorial.location.lng && memorial.location.lat) {
                geojsonFeatures.push({
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Point',
                        'coordinates': [memorial.location.lng, memorial.location.lat]
                    },
                    'properties': {
                        'title': memorial.name,
                        'url': `/memorial?id=${memorial.id}`
                    }
                });
            }
        });

        map.on('load', () => {
            map.addSource('memorials', {
                'type': 'geojson',
                'data': {
                    'type': 'FeatureCollection',
                    'features': geojsonFeatures
                }
            });

            map.addLayer({
                'id': 'memorial-points',
                'type': 'circle',
                'source': 'memorials',
                'paint': {
                    'circle-radius': 6,
                    'circle-color': '#0d6efd',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                }
            });

            map.on('click', 'memorial-points', (e) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const { title, url } = e.features[0].properties;
                const popupHtml = `<strong>${title}</strong><br><a href="${url}">View Memorial</a>`;

                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                new mapboxgl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(popupHtml)
                    .addTo(map);
            });

            map.on('mouseenter', 'memorial-points', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'memorial-points', () => {
                map.getCanvas().style.cursor = '';
            });
        });

    } catch (error) {
        console.error("Error initializing homepage map:", error);
        mapContainer.innerHTML = '<p class="text-danger text-center p-5">Could not load the map.</p>';
    }
}

// This is the main function that app.js imports. It MUST be exported.
export async function loadHomePage(appRoot) {
    try {
        const response = await fetch('/pages/home.html');
        if (!response.ok) {
            throw new Error(`Failed to fetch home.html: ${response.status} ${response.statusText}`);
        }
        const html = await response.text();
        appRoot.innerHTML = html;

        // Now, call the other functions to populate the homepage
        await loadRecentMemorials();
        await initHomepageMap();

    } catch (error) {
        console.error("A critical error occurred in loadHomePage:", error);
        appRoot.innerHTML = `<p class="text-center text-danger p-5">Could not load the homepage. Please check the console for errors.</p>`;
    }
}