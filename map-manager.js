// --- MODULE-LEVEL VARIABLES ---
let appState;
let uiCallbacks; // Local variable to hold injected UI functions

const eugeneCoords = [44.048, -123.090]; 
const southWest = L.latLng(44.025, -123.125);
const northEast = L.latLng(44.070, -123.060);
const bounds = L.latLngBounds(southWest, northEast);

// --- EXPORTED FUNCTIONS ---

/**
 * Initializes the Leaflet map, sets bounds, and attaches event listeners.
 * @param {Object} state - The main application state object.
 * @param {Object} dependencies - Injected UI callback functions.
 */
export function init(state, dependencies) {
    appState = state;
    uiCallbacks = dependencies; // Store the passed-in functions

    appState.map = L.map('map', { zoomControl: false }).setView(eugeneCoords, 15);
    appState.map.setMaxBounds(bounds);
    appState.map.setMinZoom(14); 
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(appState.map);

    L.control.zoom({ position: 'bottomright' }).addTo(appState.map);

    appState.map.on('drag', () => appState.map.panInsideBounds(bounds, { animate: false }));
    appState.map.on('click', () => {
        const detailModal = document.getElementById('detail-modal');
        if (detailModal && !detailModal.classList.contains('hidden')) {
            if (uiCallbacks && uiCallbacks.closeDetailModal) {
                uiCallbacks.closeDetailModal();
            }
        }
    });
}

/**
 * Smoothly animates the map view to a specific coordinate.
 * @param {number} lat - Latitude to fly to.
 * @param {number} long - Longitude to fly to.
 * @param {number} [zoom=17] - The zoom level to fly to.
 */
export function flyToLocation(lat, long, zoom = 17) {
    if (appState && appState.map) {
        appState.map.flyTo([lat, long], zoom);
    }
}

/**
 * Generates the inner HTML for a custom marker icon based on location tags.
 * @param {string} tags - The tags associated with the location.
 * @param {string} privacy - The privacy type of the location.
 * @returns {string} The HTML string for the icon.
 */
export function createIcon(tags, privacy) {
    const tagsLower = tags ? tags.toLowerCase() : '';
    const privacyLower = privacy ? privacy.toLowerCase() : '';
    let iconName = 'woman'; // Default for private stalls
    if (tagsLower.includes('food')) iconName = 'restaurant';
    else if (tagsLower.includes('wifi')) iconName = 'wifi';
    else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) iconName = 'wc';
    return `<span class="material-symbols-outlined text-white text-lg">${iconName}</span>`;
}

/**
 * Determines the background color class for a marker based on its type.
 * @param {string} privacy - The privacy type of the location.
 * @param {string} tags - The tags associated with the location.
 * @returns {string} A Tailwind CSS background color class.
 */
export function getBgColorClass(privacy, tags) {
    let bgColorClass = 'bg-purple-600'; // Default for private stalls
    const privacyLower = privacy ? privacy.toLowerCase() : '';
    const tagsLower = tags ? tags.toLowerCase() : '';
    if (tagsLower.includes('food')) bgColorClass = 'bg-green-600';
    else if (tagsLower.includes('wifi')) bgColorClass = 'bg-cyan-600';
    else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) bgColorClass = 'bg-blue-600';
    return bgColorClass;
}

/**
 * Creates a custom Leaflet DivIcon with specific styling.
 * @param {string} privacy - The privacy type of the location.
 * @param {string} tags - The tags associated with the location.
 * @returns {L.DivIcon} A Leaflet DivIcon object.
 */
function createCustomIcon(privacy, tags) {
    const bgColorClass = getBgColorClass(privacy, tags);
    const iconContent = createIcon(tags, privacy);
    const iconHtml = `<div class="custom-marker ${bgColorClass}">${iconContent}</div>`;
    return L.divIcon({ className: '', html: iconHtml, iconSize: [32, 32], iconAnchor: [16, 16] });
}

/**
 * Clears existing markers and plots new ones on the map from the app state.
 */
export function plotMarkers() {
    if (!appState || !appState.map || !appState.allMarkers) {
        console.warn('App state not properly initialized for plotting markers.');
        return;
    }
    
    appState.allMarkers.forEach(marker => appState.map.removeLayer(marker));
    appState.allMarkers = [];
    
    if (!appState.locationsData || appState.locationsData.length === 0) {
        console.warn('No location data to plot!');
        return;
    }
    
    appState.locationsData.forEach((loc) => {
        let lat, long;
        if (loc['Lat_Long']) {
            const coords = loc['Lat_Long'].split(',');
            lat = parseFloat(coords[0].trim());
            long = parseFloat(coords[1].trim());
        }
        if (!isNaN(lat) && !isNaN(long) && lat !== 0 && long !== 0) {
            const marker = L.marker([lat, long], { icon: createCustomIcon(loc['Privacy'], loc['Tags']) });
            marker.locationData = loc;
            marker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                if (uiCallbacks && uiCallbacks.showLocationDetail) {
                    uiCallbacks.showLocationDetail(loc);
                }
            });
            marker.addTo(appState.map);
            appState.allMarkers.push(marker);
        } else { 
            console.warn(`Skipping ${loc['Location']} - invalid coordinates.`); 
        }
    });
}

/**
 * Filters markers on the map based on a set of active filters.
 * @param {Array<string>} activeFilters - An array of active filter strings.
 */
export function filterMarkers(activeFilters) {
    if (!appState || !appState.allMarkers || !appState.map) {
        console.warn('App state not properly initialized for filtering');
        return;
    }

    const isAllFilterActive = activeFilters.length === 0 || activeFilters.includes('all');

    appState.allMarkers.forEach(marker => {
        if (isAllFilterActive) {
            if (!appState.map.hasLayer(marker)) appState.map.addLayer(marker);
            return;
        }
        
        const loc = marker.locationData;
        const privacyLower = loc['Privacy'] ? loc['Privacy'].toLowerCase() : '';
        const tagsLower = loc['Tags'] ? loc['Tags'].toLowerCase() : '';
        const notesLower = loc['Notes'] ? loc['Notes'].toLowerCase() : '';
        const hasBathroom = privacyLower || tagsLower.includes('restroom') || notesLower.includes('restroom') || notesLower.includes('bathroom');

        // Check if the location matches ALL active filters
        const matchesAllFilters = activeFilters.every(filter => {
            switch (filter) {
                case 'food':
                    return tagsLower.includes('food');
                case 'wifi':
                    return (loc['WiFi Code'] && loc['WiFi Code'].trim() !== '') || tagsLower.includes('wifi') || notesLower.includes('wifi');
                case 'public':
                    return hasBathroom && (privacyLower === 'public' || privacyLower === 'exposed');
                case 'private':
                    return hasBathroom && (privacyLower !== 'public' && privacyLower !== 'exposed');
                default:
                    return true; 
            }
        });

        if (matchesAllFilters) {
            if (!appState.map.hasLayer(marker)) appState.map.addLayer(marker);
        } else {
            if (appState.map.hasLayer(marker)) appState.map.removeLayer(marker);
        }
    });
}
