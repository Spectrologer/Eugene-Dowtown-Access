// --- SERVICE WORKER & PWA STUFF ---
// This makes the app work offline and installable on your device.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}


// --- APP INITIALIZATION ---
// Kicks everything off once the webpage is loaded.
document.addEventListener('DOMContentLoaded', () => {
    
    // --- MAP SETUP ---
    // Creates the map, centers it on Eugene, and sets boundaries.
    const eugeneCoords = [44.048, -123.090]; 
    const map = L.map('map', {
        zoomControl: false, 
    }).setView(eugeneCoords, 15);

    const southWest = L.latLng(44.025, -123.125);
    const northEast = L.latLng(44.070, -123.060);
    const bounds = L.latLngBounds(southWest, northEast);
    map.setMaxBounds(bounds);
    map.setMinZoom(14); 
    map.on('drag', function() {
        map.panInsideBounds(bounds, { animate: false });
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Closes the detail pop-up if you click anywhere on the map.
    map.on('click', () => {
        if (!detailModal.classList.contains('hidden')) {
            closeDetailModal();
        }
    });

    // --- ELEMENT GRAB-BAG ---
    // A quick reference to all the interactive HTML elements we need to use.
    const detailModal = document.getElementById('detail-modal');
    const detailModalContent = document.getElementById('detail-modal-content');
    const infoModal = document.getElementById('info-modal');
    const addModal = document.getElementById('add-modal');
    const addForm = document.getElementById('add-form');
    const submitBtn = document.getElementById('submit-btn');
    const listViewToggle = document.getElementById('list-view-toggle');
    const rolodexView = document.getElementById('rolodex-view');
    const legend = document.getElementById('map-legend');
    const rolodexCardsContainer = document.getElementById('rolodex-cards-container');

    // --- APP STATE ---
    // Holds all the location data once it's fetched.
    let locationsData = [];
    let allMarkers = []; 
    let sheetLocations = [];
    let apiLocations = [];
    let showApiLocations = true; // Show by default
    
    
    // --- ICON & MARKER CREATION ---
    // All the logic for creating the colored map pins with the right icons.

    const createIcon = (tags, privacy) => {
        const tagsLower = tags ? tags.toLowerCase() : '';
        const privacyLower = privacy ? privacy.toLowerCase() : '';
        let iconName = 'woman'; // Default icon

        if (tagsLower.includes('food')) iconName = 'restaurant';
        else if (tagsLower.includes('wifi')) iconName = 'wifi';
        else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) iconName = 'wc';
        
        return `<span class="material-symbols-outlined text-white text-lg">${iconName}</span>`;
    };
    
    function getBgColorClass(privacy, tags) {
        let bgColorClass = 'bg-purple-600'; // Default for private stalls
        const privacyLower = privacy ? privacy.toLowerCase() : '';
        const tagsLower = tags ? tags.toLowerCase() : '';

        if (tagsLower.includes('food')) bgColorClass = 'bg-green-600';
        else if (tagsLower.includes('wifi')) bgColorClass = 'bg-cyan-600';
        else if (privacyLower === 'public' || privacyLower === 'exposed' || tagsLower.includes('restroom')) bgColorClass = 'bg-blue-600';
        
        return bgColorClass;
    }

    const createCustomIcon = (privacy, tags) => {
        const bgColorClass = getBgColorClass(privacy, tags);
        const iconContent = createIcon(tags, privacy);
        const iconHtml = `<div class="custom-marker ${bgColorClass}">${iconContent}</div>`;
        return L.divIcon({
            className: '',
            html: iconHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
    };

    // --- DATA FETCHING & PARSING ---
    // Grabs the data from the Google Sheet and processes it.
    
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMzAQbd3MdmdliQnNSPgFvX2309klOt524-HuUoojAc2c2kLKwG9Ftr75YUhsXzMfJtpFerLGlmQOK/pub?gid=0&single=true&output=csv';
    const REFUGE_API_URL = 'https://www.refugerestrooms.org/api/v1/restrooms/by_location.json';
    const lastUpdatedContainer = document.getElementById('last-updated-container');
    const lastUpdatedSpan = lastUpdatedContainer.querySelector('span');

    function getLastModifiedDate(csvText) {
        if (!csvText) return null;
        const lines = csvText.split('\n');
        const modifiedLine = lines.find(line => 
            line.toLowerCase().replace(/"/g, '').includes('last modified:')
        );
        if (modifiedLine) {
            const parts = modifiedLine.split(',');
            if (parts.length > 1) {
                const dateString = parts[1].replace(/"/g, '').trim();
                if (!dateString) return null;
                const date = new Date(dateString);
                if (date instanceof Date && !isNaN(date)) {
                    return date;
                } else {
                    console.warn("Could not parse date string from sheet:", dateString);
                }
            }
        }
        return null;
    }

    async function fetchBlocklist() {
        // --- IMPORTANT: Paste your "Publish to the web" CSV link for the 'blocklist' sheet tab here. ---
        // Ensure the sheet's general sharing setting is "Anyone with the link".
        const BLOCKLIST_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4KJi-cNJVKbT7cP8VFcDXPYld_R2-D5r3aNFdIARobTv-CzWqcdVl-LeDNJyhCPu6PWpYTho1O5Bg/pub?gid=1834778940&single=true&output=csv'; 
        
        // This check ensures a placeholder URL isn't being used.
        if (!BLOCKLIST_CSV_URL || BLOCKLIST_CSV_URL.toUpperCase().includes('PASTE_YOUR_BLOCKLIST_GOOGLE_SHEET_CSV_URL_HERE')) {
            console.log('BLOCKLIST_CSV_URL is not set. No locations will be blocked.');
            return new Set();
        }

        try {
            // Added cache-busting parameter
            const response = await fetch(BLOCKLIST_CSV_URL + '&cb=' + new Date().getTime());
            if (!response.ok) {
                console.warn(`Failed to fetch blocklist from Google Sheet: ${response.statusText}`);
                return new Set();
            }
            const csvText = await response.text();
            const lines = csvText.trim().split('\n').slice(1); // Skip header row
            const blockedNames = new Set();
            for (const line of lines) {
                let name = line.trim().replace(/\r$/, ''); // Also remove carriage return
                // Handle names that might be quoted in the CSV export
                if (name.startsWith('"') && name.endsWith('"')) {
                    name = name.substring(1, name.length - 1);
                }
                if (name) {
                    blockedNames.add(name.toLowerCase().trim());
                }
            }
            console.log(`Loaded ${blockedNames.size} locations from blocklist.`);
            return blockedNames;
        } catch (error) {
            console.error("Error fetching or parsing blocklist from Google Sheet:", error);
            return new Set(); // Return an empty set on any error
        }
    }

    async function fetchApiData(lat, lng, blocklist = new Set()) {
        try {
            const response = await fetch(`${REFUGE_API_URL}?lat=${lat}&lng=${lng}&per_page=50`);
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            const data = await response.json();
            const mappedData = data.map(item => ({
                'Location': item.name,
                'Address': `${item.street}, ${item.city}`,
                'Lat_Long': `${item.latitude}, ${item.longitude}`,
                'Privacy': item.unisex ? 'Private' : 'Public', // Match internal values
                'Gendered': item.unisex ? 'All-Gender' : 'Gendered',
                'Accessibility': item.accessible ? 'Accessible' : 'Not Accessible',
                'Notes': `${item.comment || ''} (Source: Refuge Restrooms API)`,
                'Tags': 'Restroom',
                'Access': item.directions || 'Open',
                'Hours': '',
                'WiFi Code': '',
                'isApiSource': true // Flag for API data
            }));

            // Filter out any locations that are in the blocklist
            const filteredData = mappedData.filter(item => {
                const isBlocked = blocklist.has(item.Location.toLowerCase().trim());
                if (isBlocked) {
                    console.log(`Blocking API location due to blocklist: "${item.Location}"`);
                }
                return !isBlocked;
            });

            return filteredData;

        } catch (error) {
            console.error("Error fetching data from Refuge Restrooms API:", error);
            return [];
        }
    }

    function updateDisplayedLocations() {
        const combined = showApiLocations ? [...sheetLocations, ...apiLocations] : [...sheetLocations];
        
        const uniqueLocations = [];
        const seenLocations = new Set();
        combined.forEach(loc => {
            const locationIdentifier = loc['Location'].toLowerCase().trim();
            if (!seenLocations.has(locationIdentifier)) {
                seenLocations.add(locationIdentifier);
                uniqueLocations.push(loc);
            }
        });

        locationsData = uniqueLocations;
        plotMarkers();
        const activeFilter = document.querySelector('#map-legend .filter-active')?.dataset.filter || 'all';
        filterMarkers(activeFilter);
        populateRolodex();
    }


    async function loadAllData() {
        const blocklist = await fetchBlocklist(); // Fetch the blocklist first

        const [sheetResult, apiResult] = await Promise.allSettled([
            // Added cache-busting parameter to the main CSV URL fetch
            fetch(CSV_URL + '&cb=' + new Date().getTime()).then(res => {
                if (!res.ok) throw new Error('Network response for sheet was not ok');
                return res.text();
            }),
            fetchApiData(eugeneCoords[0], eugeneCoords[1], blocklist) // Pass the blocklist to the API fetcher
        ]);

        if (sheetResult.status === 'fulfilled') {
            const csvText = sheetResult.value;
            const storedCsv = localStorage.getItem('eugeneAccessCsvData');
            if (JSON.stringify(parseCSV(csvText)) !== JSON.stringify(parseCSV(storedCsv))) {
                console.log('Sheet data has been modified. Updating local cache.');
                localStorage.setItem('eugeneAccessCsvData', csvText);
            } else {
                console.log('Sheet data is unchanged.');
            }
            const modifiedDate = getLastModifiedDate(csvText);
            const displayDate = modifiedDate || new Date();
            const formattedDate = displayDate.toLocaleString('en-US', { 
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
            });
            lastUpdatedSpan.textContent = `Updated: ${formattedDate}`;
            if (!modifiedDate) {
                 console.log("Could not find or parse 'Last Modified:' row in CSV, using fetch time as fallback.");
            }
            lastUpdatedContainer.classList.remove('hidden');
            sheetLocations = parseCSV(csvText);
        } else {
            console.error("Error fetching sheet data:", sheetResult.reason);
            const storedCsv = localStorage.getItem('eugeneAccessCsvData');
            if (storedCsv) {
                console.log("Using offline sheet data from localStorage.");
                const modifiedDate = getLastModifiedDate(storedCsv);
                let statusText = 'Using Offline Data';
                if (modifiedDate) {
                    const formattedDate = modifiedDate.toLocaleString('en-US', { 
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                    });
                    statusText = `Offline (Updated: ${formattedDate})`;
                }
                lastUpdatedSpan.textContent = statusText;
                lastUpdatedContainer.classList.remove('hidden');
                sheetLocations = parseCSV(storedCsv);
            } else {
                console.error("No offline sheet data available.");
                lastUpdatedSpan.textContent = 'Could not load map data.';
                lastUpdatedContainer.classList.remove('hidden');
                showNotification('Could not load community map data. Please check your connection.', 'error');
            }
        }

        if (apiResult.status === 'fulfilled') {
            apiLocations = apiResult.value;
            console.log(`Fetched ${apiLocations.length} locations from API.`);
        } else {
            console.error("Error fetching API data:", apiResult.reason);
            showNotification('Could not load additional locations.', 'error');
        }
        
        updateDisplayedLocations();
    }

    loadAllData();

    function parseCSV(text) {
        if (!text) return [];
        let lines = text.trim().split('\n');
        let headerRowIndex = -1;
        let headers = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Location') && lines[i].includes('Privacy')) {
                headerRowIndex = i;
                headers = lines[i].split(',').map(h => h.trim().replace(/"/g, ''));
                break;
            }
        }
        if (headerRowIndex === -1) {
            console.error("Header row not found.");
            return [];
        }
        let csvContent = lines.slice(headerRowIndex + 1).join('\n');
        const result = [];
        let inQuotes = false;
        let field = '';
        let record = {};
        let headerIndex = 0;
        for (let i = 0; i < csvContent.length; i++) {
            const char = csvContent[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                record[headers[headerIndex]] = field.trim();
                field = '';
                headerIndex++;
            } else if (char === '\n' && !inQuotes) {
                record[headers[headerIndex]] = field.trim();
                if (Object.keys(record).length === headers.length && record['Location']) {
                     result.push(record);
                }
                record = {};
                field = '';
                headerIndex = 0;
            } else {
                field += char;
            }
        }
        if (headerIndex < headers.length) {
             record[headers[headerIndex]] = field.trim();
             if (Object.keys(record).length === headers.length && record['Location']) {
                result.push(record);
            }
        }
        return result.filter(row => row && row['Location'] && row['Location'].trim());
    }


    // --- MAP MARKER & FILTER LOGIC ---
    // Puts pins on the map and handles the filtering from the legend.
    
    function plotMarkers() {
        allMarkers.forEach(marker => map.removeLayer(marker));
        allMarkers = [];

        if (locationsData.length === 0) {
            console.error('No location data to plot!');
            return;
        }
        
        locationsData.forEach((loc) => {
            let lat, long;
            
            if (loc['Lat_Long']) {
                const coordStr = loc['Lat_Long'].trim();
                if (coordStr.includes(',')) {
                    const coords = coordStr.split(',');
                    lat = parseFloat(coords[0].trim());
                    long = parseFloat(coords[1].trim());
                }
            }

            if (!isNaN(lat) && !isNaN(long) && lat !== 0 && long !== 0) {
                const marker = L.marker([lat, long], { icon: createCustomIcon(loc['Privacy'], loc['Tags']) });
                marker.locationData = loc;
                marker.on('click', (e) => {
                    L.DomEvent.stopPropagation(e); // Stop the map click from firing.
                    showLocationDetail(loc);
                });
                marker.addTo(map);
                allMarkers.push(marker);
            } else { 
                console.warn(`Skipping ${loc['Location']} - invalid coordinates.`); 
            }
        });
    }
    
    function setupFiltering() {
        const legendItems = document.querySelectorAll('#map-legend > div[data-filter]');
        legendItems.forEach(item => {
            item.addEventListener('click', () => {
                const activeFilter = item.dataset.filter;
                legendItems.forEach(i => i.classList.remove('filter-active'));
                item.classList.add('filter-active');
                filterMarkers(activeFilter);
            });
        });
    }

    function filterMarkers(activeFilter) {
        allMarkers.forEach(marker => {
            const loc = marker.locationData;
            const privacyLower = loc['Privacy'] ? loc['Privacy'].toLowerCase() : '';
            const tagsLower = loc['Tags'] ? loc['Tags'].toLowerCase() : '';
            const notesLower = loc['Notes'] ? loc['Notes'].toLowerCase() : '';
            let show = false;

            if (activeFilter === 'all') show = true;
            else if (activeFilter === 'food') { if (tagsLower.includes('food')) show = true; } 
            else if (activeFilter === 'wifi') { if ((loc['WiFi Code'] && loc['WiFi Code'].trim() !== '') || tagsLower.includes('wifi') || notesLower.includes('wifi')) show = true; } 
            else if (activeFilter === 'public') { if (privacyLower === 'public' || privacyLower === 'exposed') show = true; } 
            else if (activeFilter === 'private') { if (!tagsLower.includes('food') && !tagsLower.includes('wifi') && privacyLower !== 'public' && privacyLower !== 'exposed') show = true; }
            
            if (show) { if (!map.hasLayer(marker)) map.addLayer(marker); } 
            else { if (map.hasLayer(marker)) map.removeLayer(marker); }
        });
    }
    
    // --- ROLODEX / LIST VIEW ---
    // Manages the animated list of locations.
    
    function populateRolodex() {
        rolodexCardsContainer.innerHTML = '';
        if (!locationsData || locationsData.length === 0) {
            rolodexCardsContainer.innerHTML = '<p class="text-center text-gray-400 text-sm p-4">No locations loaded.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();
        locationsData.forEach((loc, index) => {
            const latLong = loc['Lat_Long'];
            if (!latLong || !latLong.includes(',')) return;

            const card = document.createElement('div');
            card.className = 'rolodex-card flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-indigo-500/30';
            card.style.transitionDelay = `${index * 40}ms`;
            
            card.addEventListener('click', () => {
                const coords = latLong.split(',').map(c => parseFloat(c.trim()));
                if (!isNaN(coords[0]) && !isNaN(coords[1])) {
                    map.flyTo([coords[0], coords[1]], 17);
                    showLocationDetail(loc);
                }
            });
            
            const iconHTML = `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getBgColorClass(loc['Privacy'], loc['Tags'])} border-2 border-white/50">${createIcon(loc['Tags'], loc['Privacy'])}</div>`;
            const infoHTML = `<div class="flex-grow overflow-hidden"><h4 class="font-semibold text-white text-sm truncate">${loc['Location']}</h4><p class="text-gray-400 text-xs truncate">${loc['Address'] || 'No address'}</p></div>`;
            card.innerHTML = iconHTML + infoHTML;
            fragment.appendChild(card);
        });
        rolodexCardsContainer.appendChild(fragment);
    }

    // --- MODALS & UI LOGIC ---
    // Handles showing and hiding all the pop-up windows.

    function showLocationDetail(loc) {
        let servicesHtml = '';
        if (loc['Access'] && loc['Access'].toLowerCase().trim() !== 'open') servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined text-green-400 mt-1 flex-shrink-0">check_circle</span><div><span class="font-semibold">Access: ${loc['Access']}</span></div></li>`;
        if (loc['Privacy']) {
            const privacyText = (loc['Privacy'].toLowerCase() === 'public' || loc['Privacy'].toLowerCase() === 'exposed') ? 'Multi Stall' : 'Private Stall';
            servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined text-blue-400 mt-1 flex-shrink-0">shield</span><div><span class="font-semibold">${privacyText}</span></div></li>`;
        }
        if (loc['Gendered']) servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined text-pink-400 mt-1 flex-shrink-0">wc</span><div><span class="font-semibold">Type: ${loc['Gendered']}</span></div></li>`;
        if (loc['WiFi Code']) servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined text-cyan-400 mt-1 flex-shrink-0">wifi</span><div><span class="font-semibold">WiFi</span><p class="text-sm text-gray-400">Password: ${loc['WiFi Code']}</p></div></li>`;
        if (loc['Hours']) servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined text-yellow-400 mt-1 flex-shrink-0">schedule</span><div><span class="font-semibold">Hours:</span><p class="text-sm text-gray-400 dark:text-gray-300">${loc['Hours'].replace(/;/g, '<br>')}</p></div></li>`;
        if (loc['Accessibility']) {
            const isAccessible = loc['Accessibility'].toLowerCase().includes('accessible');
            const icon = isAccessible ? 'accessible' : 'block';
            const color = isAccessible ? 'text-orange-400' : 'text-gray-500';
            servicesHtml += `<li class="flex items-start gap-3"><span class="material-symbols-outlined ${color} mt-1 flex-shrink-0">${icon}</span><div><span class="font-semibold">${isAccessible ? 'Accessible' : 'Not Accessible'}</span></div></li>`;
        }

        const infoSectionHtml = servicesHtml ? `<div class="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700"><h4 class="font-semibold mb-2">Details</h4><ul class="space-y-2">${servicesHtml}</ul></div>`
            : `<div class="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700 text-center"><p class="text-gray-500 dark:text-gray-400">No details provided.</p><button id="add-info-btn" class="mt-2 text-indigo-500 hover:text-indigo-400 text-sm font-semibold">Help add information</button></div>`;
        
        let notesHtml = '';
        if (loc['Notes']) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const processedNotes = loc['Notes'].replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-500 dark:text-indigo-400 hover:underline">${url}</a>`);
            notesHtml = `<p class="mt-4 text-gray-700 dark:text-gray-300">${processedNotes}</p>`;
        }

        const directionsHtml = loc['Lat_Long'] ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${loc['Lat_Long'].replace(/\s/g, '')}" target="_blank" rel="noopener noreferrer" title="Get Directions" class="text-indigo-400 hover:text-indigo-300 transition-colors"><span class="material-symbols-outlined">directions</span></a>` : '';
        
        detailModalContent.innerHTML = `
            <div class="flex justify-between items-start relative">
                <div class="pr-20">
                    <h3 class="text-2xl font-bold">${loc['Location']}</h3>
                    <p class="text-gray-500 dark:text-gray-400 text-sm">${loc['Address'] || 'No address'}</p>
                    ${loc['Tags'] ? `<span class="inline-block mt-2 px-2 py-1 bg-gray-200 dark:bg-gray-700 text-xs rounded-full">${loc['Tags']}</span>` : ''}
                </div>
                <div class="absolute top-0 right-0 flex items-center gap-4">
                    ${directionsHtml}
                    <button id="close-detail-btn" class="text-gray-400 text-2xl leading-none hover:text-gray-600 dark:hover:text-white">&times;</button>
                </div>
            </div>
            ${notesHtml}
            ${infoSectionHtml}
        `;
        detailModal.classList.remove('hidden');
        document.getElementById('close-detail-btn').addEventListener('click', closeDetailModal);

        const addInfoBtn = document.getElementById('add-info-btn');
        if (addInfoBtn) {
            addInfoBtn.addEventListener('click', () => {
                closeDetailModal();
                setTimeout(() => openAddModal(loc), 300);
            });
        }
    }

    function closeDetailModal() {
        detailModalContent.classList.remove('modal-enter');
        detailModalContent.classList.add('modal-leave');
        setTimeout(() => {
            detailModal.classList.add('hidden');
            detailModalContent.classList.remove('modal-leave');
            detailModalContent.classList.add('modal-enter');
        }, 300);
    }

    function updateLatLongInput() {
        const center = map.getCenter();
        document.getElementById('lat_long').value = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
    }

    function openAddModal(loc = null) {
        addForm.reset();
        if (loc) { // Pre-fill form if updating an existing location
            document.getElementById('lat_long').value = loc['Lat_Long'] || `${map.getCenter().lat.toFixed(6)}, ${map.getCenter().lng.toFixed(6)}`;
            document.getElementById('place_name').value = loc['Location'] || '';
            document.getElementById('address').value = loc['Address'] || '';
            document.getElementById('tags').value = loc['Tags'] || '';
            document.getElementById('access').value = loc['Access'] || '';
            document.getElementById('gendered').value = loc['Gendered'] || '';
            document.getElementById('hours').value = loc['Hours'] || '';
            document.getElementById('wifi_code').value = loc['WiFi Code'] || '';
            document.getElementById('accessibility').value = loc['Accessibility'] || '';
            document.getElementById('notes').value = loc['Notes'] || '';
        } else { // Set coordinates for a new submission
            updateLatLongInput();
        }
        addModal.classList.remove('hidden');
    }

    function closeAddModal() {
        addModal.classList.add('hidden');
    }
    
    function showNotification(message, type = 'success') {
        const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
        const notification = document.createElement('div');
        notification.className = `fixed bottom-24 left-1/2 -translate-x-1/2 ${bgColor} text-white py-2 px-4 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-y-10 opacity-0`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.classList.remove('translate-y-10', 'opacity-0');
        }, 100);
        setTimeout(() => {
            notification.classList.add('translate-y-10', 'opacity-0');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // --- EVENT LISTENERS ---
    // Wires up all the buttons to their functions.

    listViewToggle.addEventListener('click', () => {
        const isHidden = rolodexView.classList.contains('hidden');
        if (isHidden) {
            populateRolodex();
            legend.classList.add('hidden');
            rolodexView.classList.remove('hidden');
            setTimeout(() => rolodexView.classList.add('visible'), 10);
            listViewToggle.classList.add('bg-indigo-600');
            listViewToggle.title = "Switch to Map Legend";
        } else {
            rolodexView.classList.remove('visible');
            listViewToggle.classList.remove('bg-indigo-600');
            listViewToggle.title = "Toggle List View";
            setTimeout(() => {
                rolodexView.classList.add('hidden');
                legend.classList.remove('hidden');
            }, 300);
        }
    });

    const apiToggle = document.getElementById('api-toggle');
    const apiToggleSwitch = apiToggle.querySelector('.relative > div');

    function updateApiToggleUI() {
        const switchContainer = apiToggle.querySelector('.relative');
        if (showApiLocations) {
            switchContainer.classList.remove('bg-gray-600');
            switchContainer.classList.add('bg-indigo-500');
            apiToggleSwitch.classList.add('translate-x-5');
        } else {
            switchContainer.classList.add('bg-gray-600');
            switchContainer.classList.remove('bg-indigo-500');
            apiToggleSwitch.classList.remove('translate-x-5');
        }
    }

    apiToggle.addEventListener('click', () => {
        showApiLocations = !showApiLocations;
        updateApiToggleUI();
        updateDisplayedLocations();
    });

    document.getElementById('info-btn').addEventListener('click', () => infoModal.classList.remove('hidden'));
    document.getElementById('close-info-btn').addEventListener('click', () => infoModal.classList.add('hidden'));
    infoModal.addEventListener('click', (e) => { if (e.target === infoModal) infoModal.classList.add('hidden'); });

    document.getElementById('add-location-btn').addEventListener('click', () => openAddModal());
    document.getElementById('close-add-btn').addEventListener('click', closeAddModal);
    detailModal.addEventListener('click', (e) => { if (e.target === detailModal) closeDetailModal(); });
    addModal.addEventListener('click', (e) => { if (e.target === addModal) closeAddModal(); });
    
    addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpY5gQKheF--KuqtkzbEVt9v4fskaAmOkHhZBr0CEvRI-OJ3PyKTFFdZbcacJMG9X7/exec';
        const formData = new FormData(addForm);
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin mr-2">progress_activity</span> Submitting...`;

        fetch(SCRIPT_URL, { method: 'POST', body: formData })
        .then(response => response.json())
        .then(data => {
            if (data.result === 'success') {
                showNotification('Thank you for your submission!', 'success');
                locationsData.push(data.data);
                plotMarkers();
                filterMarkers(document.querySelector('#map-legend .filter-active').dataset.filter);
                closeAddModal();
            } else { throw new Error(data.message || 'Unknown error occurred.'); }
        })
        .catch(error => {
            console.error('Error submitting form:', error);
            showNotification('Submission failed. Please try again.', 'error');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit';
        });
    });
    
    // --- THEME & CONTRAST TOGGLES ---
    const htmlEl = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    
    function updateThemeIcon() {
        if (htmlEl.classList.contains('dark')) {
            themeIcon.style.fontVariationSettings = "'FILL' 1";
            themeToggleBtn.title = "Switch to Light Mode";
        } else {
            themeIcon.style.fontVariationSettings = "'FILL' 0";
            themeToggleBtn.title = "Switch to Dark Mode";
        }
    }
    
    themeToggleBtn.addEventListener('click', () => {
        htmlEl.classList.toggle('dark');
        updateThemeIcon();
    });

    const contrastToggleBtn = document.getElementById('contrast-toggle-btn');
    const contrastIcon = document.getElementById('contrast-icon');

    function updateContrastIcon() {
        if (htmlEl.classList.contains('high-contrast')) {
            contrastIcon.style.fontVariationSettings = "'FILL' 1";
            contrastToggleBtn.title = "Switch to Standard Contrast";
        } else {
            contrastIcon.style.fontVariationSettings = "'FILL' 0";
            contrastToggleBtn.title = "Switch to High Contrast Mode";
        }
    }

    contrastToggleBtn.addEventListener('click', () => {
        htmlEl.classList.toggle('high-contrast');
        updateContrastIcon();
    });

    // Set initial icon states on load
    updateThemeIcon();
    updateContrastIcon();
    updateApiToggleUI();
    setupFiltering();
});
