export const DataService = (() => {
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMzAQbd3MdmdliQnNSPgFvX2309klOt524-HuUoojAc2c2kLKwG9Ftr75YUhsXzMfJtpFerLGlmQOK/pub?gid=0&single=true&output=csv';
    const REFUGE_API_URL = 'https://www.refugerestrooms.org/api/v1/restrooms/by_location.json';
    const BLOCKLIST_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS4KJi-cNJVKbT7cP8VFcDXPYld_R2-D5r3aNFdIARobTv-CzWqcdVl-LeDNJyhCPu6PWpYTho1O5Bg/pub?gid=1834778940&single=true&output=csv'; 
    
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
        if (headerIndex < headers.length) {
             record[headers[headerIndex]] = field.trim();
             if (Object.keys(record).length === headers.length && record['Location']) {
                result.push(record);
            }
        }
        return result.filter(row => row && row['Location'] && row['Location'].trim());
    }

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

    async function fetchBlocklist() {
        if (!BLOCKLIST_CSV_URL || BLOCKLIST_CSV_URL.toUpperCase().includes('PASTE_YOUR_BLOCKLIST_GOOGLE_SHEET_CSV_URL_HERE')) {
            console.log('BLOCKLIST_CSV_URL is not set. No locations will be blocked.');
            return new Set();
        }
        try {
            const response = await fetch(BLOCKLIST_CSV_URL + '&cb=' + new Date().getTime());
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

    async function fetchApiData(lat, lng, blocklist) {
        try {
            const response = await fetch(`${REFUGE_API_URL}?lat=${lat}&lng=${lng}&per_page=50`);
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
            return mappedData.filter(item => !blocklist.has(item.Location.toLowerCase().trim()));
        } catch (error) {
            console.error("Error fetching data from Refuge Restrooms API:", error);
            return [];
        }
    }

    async function loadAllData(appState, UI_ELEMENTS, UIStateManager) {
        const blocklist = await fetchBlocklist();
        const [sheetResult, apiResult] = await Promise.allSettled([
            fetch(CSV_URL + '&cb=' + new Date().getTime()).then(res => res.ok ? res.text() : Promise.reject(new Error('Network response for sheet was not ok'))),
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
                console.error("No offline sheet data available.");
                UI_ELEMENTS.lastUpdatedSpan.textContent = 'Could not load map data.';
                UI_ELEMENTS.lastUpdatedContainer.classList.remove('hidden');
                UIStateManager.showNotification('Could not load community map data. Please check your connection.', 'error');
            }
        }
        if (apiResult.status === 'fulfilled') {
            appState.apiLocations = apiResult.value;
        } else {
            console.error("Error fetching API data:", apiResult.reason);
            UIStateManager.showNotification('Could not load additional locations.', 'error');
        }
        window.updateDisplayedLocations();
    }

    return { loadAllData };
})();
