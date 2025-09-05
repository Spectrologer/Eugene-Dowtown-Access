export const MapManager = (() => {
    let appState;
    let uiCallbacks; // Local variable to hold injected UI functions

    const eugeneCoords = [44.048, -123.090]; 
    const southWest = L.latLng(44.025, -123.125);
    const northEast = L.latLng(44.070, -123.060);
    const bounds = L.latLngBounds(southWest, northEast);

    function init(state, dependencies) {
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
                // Use the injected callback instead of the global window object
                if (uiCallbacks && uiCallbacks.closeDetailModal) {
                    uiCallbacks.closeDetailModal();
                }
            }
        });
    }
    
    function flyToLocation(lat, long, zoom = 17) {
        if (appState && appState.map) {
            appState.map.flyTo([lat, long], zoom);
        }
    }
    
    function createIcon(tags, privacy) {
        const tagsLower = tags ? tags.toLowerCase() : '';
        const privacyLower = privacy ? privacy.toLowerCase() : '';
        let iconName = 'woman';
        if (tagsLower.includes('food')) iconName = 'restaurant';
        else if (tagsLower.includes('wifi')) iconName = 'wifi';
        else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) iconName = 'wc';
        return `<span class="material-symbols-outlined text-white text-lg">${iconName}</span>`;
    }

    function getBgColorClass(privacy, tags) {
        let bgColorClass = 'bg-purple-600';
        const privacyLower = privacy ? privacy.toLowerCase() : '';
        const tagsLower = tags ? tags.toLowerCase() : '';
        if (tagsLower.includes('food')) bgColorClass = 'bg-green-600';
        else if (tagsLower.includes('wifi')) bgColorClass = 'bg-cyan-600';
        else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) bgColorClass = 'bg-blue-600';
        return bgColorClass;
    }

    function createCustomIcon(privacy, tags) {
        const bgColorClass = getBgColorClass(privacy, tags);
        const iconContent = createIcon(tags, privacy);
        const iconHtml = `<div class="custom-marker ${bgColorClass}">${iconContent}</div>`;
        return L.divIcon({ className: '', html: iconHtml, iconSize: [32, 32], iconAnchor: [16, 16] });
    }

    function plotMarkers() {
        if (!appState || !appState.map || !appState.allMarkers) {
            console.warn('App state not properly initialized');
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
                    // Use the injected callback instead of the global window object
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

    function filterMarkers(activeFilters) {
        if (!appState || !appState.allMarkers || !appState.map) {
            console.warn('App state not properly initialized for filtering');
            return;
        }

        const isAllFilterActive = activeFilters.length === 0 || activeFilters.includes('all');

        appState.allMarkers.forEach(marker => {
            if (isAllFilterActive) {
                if (!appState.map.hasLayer(marker)) appState.map.addLayer(marker);
                return; // Continue to the next marker
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
                        // If an unknown filter gets in, don't block the location because of it.
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


    return { init, flyToLocation, plotMarkers, filterMarkers, getBgColorClass, createIcon };
})();

// Export individual functions for easier importing
export const { init, flyToLocation, plotMarkers, filterMarkers, getBgColorClass, createIcon } = MapManager;

