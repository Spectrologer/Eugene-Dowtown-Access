import { init as initMap, flyToLocation, getBgColorClass, createIcon, plotMarkers, filterMarkers } from './map-manager.js';
import { loadAllData } from './data-service.js';
import { config } from './config.js';

// --- APP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // A quick reference to all the interactive HTML elements we need to use.
    const UI_ELEMENTS = {
        map: document.getElementById('map'),
        detailModal: document.getElementById('detail-modal'),
        detailModalContent: document.getElementById('detail-modal-content'),
        infoModal: document.getElementById('info-modal'),
        addModal: document.getElementById('add-modal'),
        addForm: document.getElementById('add-form'),
        submitBtn: document.getElementById('submit-btn'),
        listViewToggle: document.getElementById('list-view-toggle'),
        rolodexView: document.getElementById('rolodex-view'),
        legend: document.getElementById('map-legend'),
        rolodexCardsContainer: document.getElementById('rolodex-cards-container'),
        lastUpdatedContainer: document.getElementById('last-updated-container'),
        lastUpdatedSpan: document.getElementById('last-updated-container').querySelector('span'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),
        themeIcon: document.getElementById('theme-icon'),
        contrastToggleBtn: document.getElementById('contrast-toggle-btn'),
        contrastIcon: document.getElementById('contrast-icon'),
        apiToggle: document.getElementById('api-toggle'),
        apiToggleSwitch: document.getElementById('api-toggle').querySelector('.relative > div'),
        infoBtn: document.getElementById('info-btn'),
        closeInfoBtn: document.getElementById('close-info-btn'),
        addLocationBtn: document.getElementById('add-location-btn'),
        closeAddBtn: document.getElementById('close-add-btn'),
        onboardingModal: document.getElementById('onboarding-modal'),
        getStartedBtn: document.getElementById('get-started-btn'),
    };
    
    // Core application state
    const appState = {
        locationsData: [],
        allMarkers: [], 
        sheetLocations: [],
        apiLocations: [],
        showApiLocations: true,
        map: null,
        htmlEl: document.documentElement,
        activeFilters: new Set(['all']), // Use a Set for multiple filters
    };

    // --- LOCALIZED APP LOGIC ---
    const updateDisplayedLocations = () => {
        const combined = appState.showApiLocations ? [...appState.sheetLocations, ...appState.apiLocations] : [...appState.sheetLocations];
        const uniqueLocations = [];
        const seenLocations = new Set();
        combined.forEach(loc => {
            const locationIdentifier = loc['Location'].toLowerCase().trim();
            if (!seenLocations.has(locationIdentifier)) {
                seenLocations.add(locationIdentifier);
                uniqueLocations.push(loc);
            }
        });
        appState.locationsData = uniqueLocations;
        plotMarkers();
        filterMarkers(Array.from(appState.activeFilters));
        UIStateManager.populateRolodex();
    };
    
    // --- UI STATE MANAGER ---
    const UIStateManager = (() => {
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
            
            const updatedHtml = loc['Updated'] ? `<p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Last Verified: ${loc['Updated']}</p>` : '';

            UI_ELEMENTS.detailModalContent.innerHTML = `
                <div class="flex justify-between items-start relative">
                    <div class="pr-20">
                        <h3 class="text-2xl font-bold">${loc['Location']}</h3>
                        <p class="text-gray-500 dark:text-gray-400 text-sm">${loc['Address'] || 'No address'}</p>
                        ${updatedHtml}
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
            UI_ELEMENTS.detailModal.classList.remove('hidden');
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
            UI_ELEMENTS.detailModalContent.classList.remove('modal-enter');
            UI_ELEMENTS.detailModalContent.classList.add('modal-leave');
            setTimeout(() => {
                UI_ELEMENTS.detailModal.classList.add('hidden');
                UI_ELEMENTS.detailModalContent.classList.remove('modal-leave');
                UI_ELEMENTS.detailModalContent.classList.add('modal-enter');
            }, 300);
        }

        function openAddModal(loc = null) {
            UI_ELEMENTS.addForm.reset();
            if (loc) {
                document.getElementById('lat_long').value = loc['Lat_Long'] || `${appState.map.getCenter().lat.toFixed(6)}, ${appState.map.getCenter().lng.toFixed(6)}`;
                document.getElementById('place_name').value = loc['Location'] || '';
                document.getElementById('address').value = loc['Address'] || '';
                document.getElementById('tags').value = loc['Tags'] || '';
                document.getElementById('access').value = loc['Access'] || '';
                document.getElementById('gendered').value = loc['Gendered'] || '';
                document.getElementById('hours').value = loc['Hours'] || '';
                document.getElementById('wifi_code').value = loc['WiFi Code'] || '';
                document.getElementById('accessibility').value = loc['Accessibility'] || '';
                document.getElementById('notes').value = loc['Notes'] || '';
            } else {
                updateLatLongInput();
            }
            UI_ELEMENTS.addModal.classList.remove('hidden');
        }

        function closeAddModal() {
            UI_ELEMENTS.addModal.classList.add('hidden');
        }

        function updateLatLongInput() {
            if (appState.map) {
                const center = appState.map.getCenter();
                document.getElementById('lat_long').value = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
            }
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

        function populateRolodex() {
            UI_ELEMENTS.rolodexCardsContainer.innerHTML = '';
            if (!appState.locationsData || appState.locationsData.length === 0) {
                UI_ELEMENTS.rolodexCardsContainer.innerHTML = '<p class="text-center text-gray-400 text-sm p-4">No locations loaded.</p>';
                return;
            }
            const fragment = document.createDocumentFragment();
            appState.locationsData.forEach((loc, index) => {
                const latLong = loc['Lat_Long'];
                if (!latLong || !latLong.includes(',')) return;
                const card = document.createElement('div');
                card.className = 'rolodex-card flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-indigo-500/30';
                card.style.transitionDelay = `${index * 40}ms`;
                card.addEventListener('click', () => {
                    const coords = latLong.split(',').map(c => parseFloat(c.trim()));
                    if (!isNaN(coords[0]) && !isNaN(coords[1])) {
                        flyToLocation(coords[0], coords[1]);
                        showLocationDetail(loc);
                        // Close the rolodex after selecting a location on mobile devices
                        if (window.innerWidth < 768) {
                            UI_ELEMENTS.rolodexView.classList.remove('visible');
                            UI_ELEMENTS.rolodexView.classList.remove('expanded');
                            UI_ELEMENTS.listViewToggle.classList.remove('bg-indigo-600');
                            UI_ELEMENTS.listViewToggle.title = "Toggle List View";
                            setTimeout(() => {
                                UI_ELEMENTS.rolodexView.classList.add('hidden');
                                UI_ELEMENTS.legend.classList.remove('hidden');
                            }, 300);
                        }
                    }
                });
                const iconHTML = `<div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getBgColorClass(loc['Privacy'], loc['Tags'])} border-2 border-white/50">${createIcon(loc['Tags'], loc['Privacy'])}</div>`;
                const subText = loc['Updated'] 
                    ? `<p class="text-gray-500 text-xs truncate">Updated: ${loc['Updated']}</p>` 
                    : `<p class="text-gray-400 text-xs truncate">${loc['Address'] || 'No address'}</p>`;
                const infoHTML = `<div class="flex-grow overflow-hidden"><h4 class="font-semibold text-white text-sm truncate">${loc['Location']}</h4>${subText}</div>`;
                card.innerHTML = iconHTML + infoHTML;
                fragment.appendChild(card);
            });
            UI_ELEMENTS.rolodexCardsContainer.appendChild(fragment);
        }
        
        function updateApiToggleUI() {
            const switchContainer = UI_ELEMENTS.apiToggle.querySelector('.relative');
            if (appState.showApiLocations) {
                switchContainer.classList.remove('bg-gray-600');
                switchContainer.classList.add('bg-indigo-500');
                UI_ELEMENTS.apiToggleSwitch.classList.add('translate-x-5');
            } else {
                switchContainer.classList.add('bg-gray-600');
                switchContainer.classList.remove('bg-indigo-500');
                UI_ELEMENTS.apiToggleSwitch.classList.remove('translate-x-5');
            }
        }
        
        function updateThemeIcon() {
            if (appState.htmlEl.classList.contains('dark')) {
                UI_ELEMENTS.themeIcon.style.fontVariationSettings = "'FILL' 1";
                UI_ELEMENTS.themeToggleBtn.title = "Switch to Light Mode";
            } else {
                UI_ELEMENTS.themeIcon.style.fontVariationSettings = "'FILL' 0";
                UI_ELEMENTS.themeToggleBtn.title = "Switch to Dark Mode";
            }
        }
        
        function updateContrastIcon() {
            if (appState.htmlEl.classList.contains('high-contrast')) {
                UI_ELEMENTS.contrastIcon.style.fontVariationSettings = "'FILL' 1";
                UI_ELEMENTS.contrastToggleBtn.title = "Switch to Standard Contrast";
            } else {
                UI_ELEMENTS.contrastIcon.style.fontVariationSettings = "'FILL' 0";
                UI_ELEMENTS.contrastToggleBtn.title = "Switch to High Contrast Mode";
            }
        }
        
        return {
            showLocationDetail,
            closeDetailModal,
            openAddModal,
            closeAddModal,
            showNotification,
            populateRolodex,
            updateApiToggleUI,
            updateThemeIcon,
            updateContrastIcon,
        };
    })();

    // --- EVENT HANDLERS ---
    const EventHandlers = (() => {
        function setupListeners() {
            UI_ELEMENTS.getStartedBtn.addEventListener('click', () => {
                UI_ELEMENTS.onboardingModal.classList.add('hidden');
                localStorage.setItem('onboardingComplete', 'true');
            });

            UI_ELEMENTS.listViewToggle.addEventListener('click', () => {
                if (UI_ELEMENTS.legend.classList.contains('legend-expanded')) {
                    UI_ELEMENTS.legend.classList.remove('legend-expanded');
                    return;
                }

                const isExpanded = UI_ELEMENTS.rolodexView.classList.contains('expanded');
                if (!isExpanded) {
                    UIStateManager.populateRolodex();
                    UI_ELEMENTS.legend.classList.add('hidden');
                    UI_ELEMENTS.rolodexView.classList.remove('hidden');
                    UI_ELEMENTS.rolodexView.classList.add('expanded');
                    setTimeout(() => UI_ELEMENTS.rolodexView.classList.add('visible'), 10);
                    UI_ELEMENTS.listViewToggle.classList.add('bg-indigo-600');
                    UI_ELEMENTS.listViewToggle.title = "Switch to Map Legend";
                } else {
                    UI_ELEMENTS.rolodexView.classList.remove('visible');
                    UI_ELEMENTS.rolodexView.classList.remove('expanded');
                    UI_ELEMENTS.listViewToggle.classList.remove('bg-indigo-600');
                    UI_ELEMENTS.listViewToggle.title = "Toggle List View";
                    setTimeout(() => {
                        UI_ELEMENTS.rolodexView.classList.add('hidden');
                        UI_ELEMENTS.legend.classList.remove('hidden');
                    }, 300);
                }
            });
            
            UI_ELEMENTS.legend.addEventListener('click', (e) => {
                const legend = UI_ELEMENTS.legend;
                const filterItem = e.target.closest('div[data-filter]');
                const apiToggle = e.target.closest('#api-toggle');

                if (apiToggle) {
                    appState.showApiLocations = !appState.showApiLocations;
                    UIStateManager.updateApiToggleUI();
                    updateDisplayedLocations();
                    return;
                }

                if (filterItem) {
                    const filter = filterItem.dataset.filter;
                    const allFilterItem = legend.querySelector('div[data-filter="all"]');

                    if (filter === 'all') {
                        legend.classList.toggle('legend-expanded');
                        return;
                    }

                    if (appState.activeFilters.has('all')) {
                        appState.activeFilters.delete('all');
                        allFilterItem.classList.remove('filter-active');
                    }

                    if (appState.activeFilters.has(filter)) {
                        appState.activeFilters.delete(filter);
                        filterItem.classList.remove('filter-active');
                    } else {
                        appState.activeFilters.add(filter);
                        filterItem.classList.add('filter-active');
                    }

                    if (appState.activeFilters.size === 0) {
                        appState.activeFilters.add('all');
                        allFilterItem.classList.add('filter-active');
                    }

                    filterMarkers(Array.from(appState.activeFilters));
                }
            });

            document.addEventListener('click', (e) => {
                const legend = UI_ELEMENTS.legend;
                if (legend.classList.contains('legend-expanded') && !legend.contains(e.target) && !e.target.closest('#list-view-toggle')) {
                    legend.classList.remove('legend-expanded');
                }

                const rolodex = UI_ELEMENTS.rolodexView;
                const detailModal = UI_ELEMENTS.detailModal;
                if (rolodex.classList.contains('expanded') && !rolodex.contains(e.target) && !e.target.closest('#list-view-toggle') && detailModal.classList.contains('hidden')) {
                    UI_ELEMENTS.rolodexView.classList.remove('visible');
                    UI_ELEMENTS.rolodexView.classList.remove('expanded');
                    UI_ELEMENTS.listViewToggle.classList.remove('bg-indigo-600');
                    UI_ELEMENTS.listViewToggle.title = "Toggle List View";
                    setTimeout(() => {
                        UI_ELEMENTS.rolodexView.classList.add('hidden');
                        UI_ELEMENTS.legend.classList.remove('hidden');
                    }, 300);
                }
            });

            UI_ELEMENTS.infoBtn.addEventListener('click', () => UI_ELEMENTS.infoModal.classList.remove('hidden'));
            UI_ELEMENTS.closeInfoBtn.addEventListener('click', () => UI_ELEMENTS.infoModal.classList.add('hidden'));
            UI_ELEMENTS.infoModal.addEventListener('click', (e) => { if (e.target === UI_ELEMENTS.infoModal) UI_ELEMENTS.infoModal.classList.add('hidden'); });
            
            UI_ELEMENTS.addLocationBtn.addEventListener('click', () => UIStateManager.openAddModal());
            UI_ELEMENTS.closeAddBtn.addEventListener('click', () => UIStateManager.closeAddModal());
            UI_ELEMENTS.detailModal.addEventListener('click', (e) => { if (e.target === UI_ELEMENTS.detailModal) UIStateManager.closeDetailModal(); });
            UI_ELEMENTS.addModal.addEventListener('click', (e) => { if (e.target === UI_ELEMENTS.addModal) UIStateManager.closeAddModal(); });
            
            UI_ELEMENTS.themeToggleBtn.addEventListener('click', () => {
                appState.htmlEl.classList.toggle('dark');
                UIStateManager.updateThemeIcon();
            });
            
            UI_ELEMENTS.contrastToggleBtn.addEventListener('click', () => {
                appState.htmlEl.classList.toggle('high-contrast');
                UIStateManager.updateContrastIcon();
            });

            UI_ELEMENTS.addForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(UI_ELEMENTS.addForm);
                
                UI_ELEMENTS.submitBtn.disabled = true;
                UI_ELEMENTS.submitBtn.innerHTML = `<span class="material-symbols-outlined animate-spin mr-2">progress_activity</span> Submitting...`;

                try {
                    const response = await fetch(config.SCRIPT_URL, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.result === 'success') {
                        UIStateManager.showNotification('Thank you for your submission!', 'success');
                        if (data.data) {
                            appState.locationsData.push(data.data);
                        }
                        updateDisplayedLocations();
                        UIStateManager.closeAddModal();
                    } else { throw new Error(data.message || 'Unknown error occurred.'); }
                } catch (error) {
                    console.error('Error submitting form:', error);
                    UIStateManager.showNotification('Submission failed. Please try again.', 'error');
                } finally {
                    UI_ELEMENTS.submitBtn.disabled = false;
                    UI_ELEMENTS.submitBtn.innerHTML = 'Submit';
                }
            });
        }
        return { setupListeners };
    })();
    
    // --- KICKOFF ---
    function initApp() {
        try {
            if (!localStorage.getItem('onboardingComplete')) {
                UI_ELEMENTS.onboardingModal.classList.remove('hidden');
            }

            const mapDependencies = {
                showLocationDetail: UIStateManager.showLocationDetail,
                closeDetailModal: UIStateManager.closeDetailModal
            };
            initMap(appState, mapDependencies);

            const dataDependencies = {
                UI_ELEMENTS,
                UIStateManager,
                updateDisplayedLocations
            };
            loadAllData(appState, dataDependencies);
            
            EventHandlers.setupListeners();
            UIStateManager.updateThemeIcon();
            UIStateManager.updateContrastIcon();
            UIStateManager.updateApiToggleUI();
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    }
    
    initApp();
});
