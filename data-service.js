import { config } from './config.js';

/**
 * Parses raw CSV text into an array of objects.
 * This custom parser handles the specific format of the Google Sheet.
 * @param {string} text - The raw CSV string.
 * @returns {Array<Object>} An array of location objects.
 */
function parseCSV(text) {
    if (!text) return [];
    let lines = text.trim().split('\n');
    let headerRowIndex = -1;
    let headers = [];
    // Find the actual header row, skipping any initial informational rows.
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Location') && lines[i].includes('Privacy')) {
            headerRowIndex = i;
            headers = lines[i].split(',').map(h => h.trim().replace(/"/g, ''));
            break;
        }
    }
    if (headerRowIndex === -1) {
        console.error("Header row not found in CSV.");
        return [];
    }
    let csvContent = lines.slice(headerRowIndex + 1).join('\n');
    const result = [];
    let inQuotes = false;
    let field = '';
    let record = {};
    let headerIndex = 0;
    // Manual CSV parsing loop to handle quoted fields.
    for (let i = 0; i < csvContent.length; i++) {
        const char = csvContent[i];
        if (char === '"') { inQuotes = !inQuotes; } 
        else if (char === ',' && !inQuotes) {
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
        } else { field += char; }
    }
    // Add the last record if it exists
    if (headerIndex < headers.length) {
         record[headers[headerIndex]] = field.trim();
         if (Object.keys(record).length === headers.length && record['Location']) {
            result.push(record);
        }
    }
    return result.filter(row => row && row['Location'] && row['Location'].trim());
}

/**
 * Extracts the "Last Modified" date from the info rows of the CSV file.
 * @param {string} csvText - The raw CSV string.
 * @returns {Date|null} The last modified date or null if not found.
 */
function getLastModifiedDate(csvText) {
    if (!csvText) return null;
    const lines = csvText.split('\n');
    const modifiedLine = lines.find(line => line.toLowerCase().replace(/"/g, '').includes('last modified:'));
    if (modifiedLine) {
        const parts = modifiedLine.split(',');
        if (parts.length > 1) {
            const dateString = parts[1].replace(/"/g, '').trim();
            if (!dateString) return null;
            const date = new Date(dateString);
            if (date instanceof Date && !isNaN(date)) { return date; } 
        }
    }
    return null;
}

/**
 * Fetches and parses the blocklist CSV to get a set of location names to exclude.
 * @returns {Promise<Set<string>>} A promise that resolves to a Set of lowercase location names.
 */
async function fetchBlocklist() {
    if (!config.BLOCKLIST_CSV_URL || config.BLOCKLIST_CSV_URL.toUpperCase().includes('PASTE_YOUR_BLOCKLIST_GOOGLE_SHEET_CSV_URL_HERE')) {
        console.log('BLOCKLIST_CSV_URL is not set. No locations will be blocked.');
        return new Set();
    }
    try {
        const response = await fetch(config.BLOCKLIST_CSV_URL + '&cb=' + new Date().getTime());
        if (!response.ok) throw new Error(`Failed to fetch blocklist: ${response.statusText}`);
        const csvText = await response.text();
        const lines = csvText.trim().split('\n').slice(1);
        const blockedNames = new Set();
        for (const line of lines) {
            let name = line.trim().replace(/\r$/, '').replace(/"/g, '');
            if (name) blockedNames.add(name.toLowerCase().trim());
        }
        return blockedNames;
    } catch (error) {
        console.error("Error fetching or parsing blocklist:", error);
        return new Set();
    }
}

/**
 * Fetches data from the Refuge Restrooms API, with caching.
 * @param {number} lat - Latitude for the API query.
 * @param {number} lng - Longitude for the API query.
 * @param {Set<string>} blocklist - A set of location names to filter out.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of location objects.
 */
async function fetchApiData(lat, lng, blocklist) {
    const cacheKey = 'refugeApiCache';
    const ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    const cachedItem = localStorage.getItem(cacheKey);

    if (cachedItem) {
        try {
            const { timestamp, data } = JSON.parse(cachedItem);
            if (Date.now() - timestamp < ttl) {
                console.log("Using fresh API data from localStorage.");
                return data.filter(item => !blocklist.has(item.Location.toLowerCase().trim()));
            }
        } catch (e) {
            console.error("Error parsing cached API data", e);
            localStorage.removeItem(cacheKey); // Clear corrupted cache
        }
    }

    try {
        console.log("Fetching fresh API data from network.");
        const response = await fetch(`${config.REFUGE_API_URL}?lat=${lat}&lng=${lng}&per_page=50`);
        if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
        
        const data = await response.json();
        const mappedData = data.map(item => ({
            'Location': item.name,
            'Address': `${item.street}, ${item.city}`,
            'Lat_Long': `${item.latitude}, ${item.longitude}`,
            'Privacy': item.unisex ? 'Private' : 'Public',
            'Gendered': item.unisex ? 'All-Gender' : 'Gendered',
            'Accessibility': item.accessible ? 'Accessible' : 'Not Accessible',
            'Notes': `${item.comment || ''} (Source: Refuge Restrooms API)`,
            'Tags': 'Restroom',
            'Access': item.directions || 'Open',
            'Hours': '',
            'WiFi Code': '',
            'isApiSource': true
        }));
        
        const cachePayload = {
            timestamp: Date.now(),
            data: mappedData
        };
        localStorage.setItem(cacheKey, JSON.stringify(cachePayload));
        
        return mappedData.filter(item => !blocklist.has(item.Location.toLowerCase().trim()));
    } catch (error) {
        console.error("Error fetching data from Refuge Restrooms API:", error);
        if (cachedItem) {
            console.log("API fetch failed. Using stale data from localStorage.");
            try {
                const { data } = JSON.parse(cachedItem);
                return data.filter(item => !blocklist.has(item.Location.toLowerCase().trim()));
            } catch(e) {
                console.error("Error parsing stale cached API data", e);
                return []; // fallback to empty if stale data is also corrupt
            }
        }
        return []; // Return empty array if fetch fails and no cache exists
    }
}

/**
 * Main data loading function. Fetches from the Google Sheet and the API concurrently,
 * handles offline data, and updates the application state.
 * @param {Object} appState - The main application state object.
 * @param {Object} dependencies - Injected dependencies, including UI elements and state managers.
 */
export async function loadAllData(appState, dependencies) {
    const { UI_ELEMENTS, UIStateManager, updateDisplayedLocations } = dependencies;

    const blocklist = await fetchBlocklist();
    const [sheetResult, apiResult] = await Promise.allSettled([
        fetch(config.CSV_URL + '&cb=' + new Date().getTime()).then(res => res.ok ? res.text() : Promise.reject(new Error('Network response for sheet was not ok'))),
        fetchApiData(44.048, -123.090, blocklist)
    ]);

    if (sheetResult.status === 'fulfilled') {
        const csvText = sheetResult.value;
        localStorage.setItem('eugeneAccessCsvData', csvText);
        const modifiedDate = getLastModifiedDate(csvText);
        const displayDate = modifiedDate || new Date();
        const formattedDate = displayDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        UI_ELEMENTS.lastUpdatedSpan.textContent = `Updated: ${formattedDate}`;
        UI_ELEMENTS.lastUpdatedContainer.classList.remove('hidden');
        appState.sheetLocations = parseCSV(csvText);
    } else {
        console.error("Error fetching sheet data:", sheetResult.reason);
        const storedCsv = localStorage.getItem('eugeneAccessCsvData');
        if (storedCsv) {
            console.log("Using offline sheet data from localStorage.");
            const modifiedDate = getLastModifiedDate(storedCsv);
            let statusText = 'Using Offline Data';
            if (modifiedDate) {
                const formattedDate = modifiedDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                statusText = `Offline (Updated: ${formattedDate})`;
            }
            UI_ELEMENTS.lastUpdatedSpan.textContent = statusText;
            UI_ELEMENTS.lastUpdatedContainer.classList.remove('hidden');
            appState.sheetLocations = parseCSV(storedCsv);
        } else {
            console.error("No offline data available.");
            UI_ELEMENTS.lastUpdatedSpan.textContent = 'Could not load map data.';
            UI_ELEMENTS.lastUpdatedContainer.classList.remove('hidden');
            UIStateManager.showNotification('Could not load community map data. Please check your connection.', 'error');
        }
    }
    if (apiResult.status === 'fulfilled') {
        appState.apiLocations = apiResult.value;
    } else {
        // This block might be less likely to be hit now since fetchApiData has its own fallback.
        // It would only trigger on a more catastrophic failure within the promise itself.
        console.error("Error fetching API data:", apiResult.reason);
        UIStateManager.showNotification('Could not load additional locations.', 'error');
    }
    updateDisplayedLocations();
}
