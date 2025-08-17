import { db } from '../firebase-config.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function loadRecentMemorials() {
    // ... function content is correct ...
}

async function initHomepageMap() {
    if (typeof mapboxgl === 'undefined') {
        console.error('Mapbox GL JS is not loaded.');
        return;
    }
    mapboxgl.accessToken = process.env.VITE_MAPBOX_ACCESS_TOKEN;

    const mapContainer = document.getElementById("homepage-map-container");
    // ... rest of function is correct ...
}

export async function loadHomePage(appRoot) {
    // ... function content is correct ...
}