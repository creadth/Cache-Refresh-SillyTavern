// Cache Refresher Extension - Browser Compatible Version
(function() {
    // Log extension loading attempt
    console.log('Cache Refresher: Loading extension...');

    // Extension name and path
    const extensionName = 'cache-refresher';
    const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

    // Default configuration
    const defaultSettings = {
        enabled: false,
        refreshInterval: (5 * 60 - 5) * 1000, // 4 minutes 55 seconds in milliseconds
        maxRefreshes: 3,
        minTokens: 1, // Minimum tokens to request for cache refresh
        showNotifications: true,
        debug: false
    };

    // Initialize extension settings
    if (!window.extension_settings) {
        window.extension_settings = {};
    }
    
    if (!window.extension_settings[extensionName]) {
        window.extension_settings[extensionName] = {};
        console.log('Cache Refresher: Creating new settings object');
    }

    // Merge with defaults
    window.extension_settings[extensionName] = Object.assign({}, defaultSettings, window.extension_settings[extensionName]);
    const settings = window.extension_settings[extensionName];
    console.log('Cache Refresher: Settings initialized', settings);

    // State variables
    let lastGenerationData = null;
    let refreshTimer = null;
    let refreshesLeft = 0;
    let refreshInProgress = false;
    let statusIndicator = null;

    /**
     * Logs a message if debug mode is enabled
     * @param {string} message - Message to log
     * @param {any} data - Optional data to log
     */
    function debugLog(message, data) {
        if (settings.debug) {
            console.log(`[Cache Refresher] ${message}`, data || '');
        }
    }

    /**
     * Shows a notification if notifications are enabled
     * @param {string} message - Message to show
     * @param {string} type - Notification type (success, info, warning, error)
     */
    function showNotification(message, type = 'info') {
        if (settings.showNotifications && window.toastr) {
            // Check if the method exists on toastr
            if (typeof window.toastr[type] === 'function') {
                window.toastr[type](message, '', { timeOut: 3000 });
            } else {
                // Fallback to info
                window.toastr.info(message, '', { timeOut: 3000 });
            }
        }
    }

    /**
     * Toggles the cache refresher on/off
     */
    function toggleCacheRefresher() {
        settings.enabled = !settings.enabled;
        saveSettings();
        
        if (settings.enabled) {
            showNotification('Cache refreshing enabled');
            if (lastGenerationData) {
                startRefreshCycle();
            }
        } else {
            showNotification('Cache refreshing disabled');
            stopRefreshCycle();
        }
        
        updateUI();
    }

    /**
     * Updates the extension settings in localStorage
     */
    function saveSettings() {
        window.extension_settings[extensionName] = settings;
        debugLog('Settings saved', settings);
    }

    /**
     * Updates the UI elements to reflect current state
     */
    function updateUI() {
        const button = document.getElementById('cache_refresher_button');
        if (button) {
            const icon = button.querySelector('i');
            const text = button.querySelector('span');
            
            if (settings.enabled) {
                button.classList.add('active');
                if (icon) {
                    icon.className = refreshInProgress ? 
                        'fa-solid fa-sync-alt fa-spin' : 
                        'fa-solid fa-sync-alt';
                }
                if (text) {
                    text.textContent = 'Cache Refresher: ON';
                }
            } else {
                button.classList.remove('active');
                if (icon) {
                    icon.className = 'fa-solid fa-sync-alt';
                }
                if (text) {
                    text.textContent = 'Cache Refresher: OFF';
                }
            }
        }
        
        // Update status indicator
        updateStatusIndicator();
    }

    /**
     * Creates or updates the status indicator
     */
    function updateStatusIndicator() {
        if (!statusIndicator) {
            statusIndicator = document.createElement('div');
            statusIndicator.id = 'cache_refresher_status';
            statusIndicator.style.position = 'fixed';
            statusIndicator.style.bottom = '10px';
            statusIndicator.style.right = '10px';
            statusIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            statusIndicator.style.color = 'white';
            statusIndicator.style.padding = '5px 10px';
            statusIndicator.style.borderRadius = '5px';
            statusIndicator.style.fontSize = '12px';
            statusIndicator.style.zIndex = '1000';
            statusIndicator.style.display = 'none';
            document.body.appendChild(statusIndicator);
        }
        
        if (settings.enabled && refreshesLeft > 0) {
            statusIndicator.textContent = `Cache refreshes: ${refreshesLeft} remaining`;
            statusIndicator.style.display = 'block';
        } else {
            statusIndicator.style.display = 'none';
        }
    }

    /**
     * Adds the extension buttons to the UI
     */
    function addExtensionControls() {
        // Create main button
        const extensionsMenu = document.getElementById('extensionsMenu');
        if (!extensionsMenu) {
            console.error('Could not find extensions menu');
            return;
        }
        
        const button = document.createElement('div');
        button.id = 'cache_refresher_button';
        button.classList.add('list-group-item', 'flex-container');
        button.dataset.extensionName = extensionName;
        button.title = 'Toggle cache refreshing to avoid cache expiration';
        
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-sync-alt';
        
        const text = document.createElement('span');
        text.textContent = 'Cache Refresher: OFF';
        
        button.appendChild(icon);
        button.appendChild(text);
        button.addEventListener('click', toggleCacheRefresher);
        
        extensionsMenu.appendChild(button);
        
        // Initial UI update
        updateUI();
    }

    /**
     * Starts the refresh cycle
     */
    function startRefreshCycle() {
        stopRefreshCycle(); // Clear any existing cycle
        
        refreshesLeft = settings.maxRefreshes;
        scheduleNextRefresh();
        updateUI();
        
        debugLog('Refresh cycle started', { 
            refreshesLeft, 
            interval: settings.refreshInterval 
        });
    }

    /**
     * Stops the refresh cycle
     */
    function stopRefreshCycle() {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        
        refreshInProgress = false;
        updateUI();
        
        debugLog('Refresh cycle stopped');
    }

    /**
     * Schedules the next refresh
     */
    function scheduleNextRefresh() {
        if (!settings.enabled || refreshesLeft <= 0 || !lastGenerationData) {
            stopRefreshCycle();
            return;
        }
        
        refreshTimer = setTimeout(() => {
            refreshCache();
        }, settings.refreshInterval);
        
        debugLog(`Next refresh scheduled in ${settings.refreshInterval / 1000} seconds`);
    }

    /**
     * Performs a cache refresh by sending a minimal request
     */
    async function refreshCache() {
        if (!lastGenerationData || refreshInProgress) return;
        
        refreshInProgress = true;
        updateUI();
        
        try {
            debugLog('Refreshing cache with data', lastGenerationData);
            
            // Clone the last generation data to avoid modifying the original
            const refreshData = JSON.parse(JSON.stringify(lastGenerationData));
            
            // Modify the request to minimize token usage
            if (refreshData.max_tokens && refreshData.max_tokens > settings.minTokens) {
                refreshData.max_tokens = settings.minTokens;
            }
            
            // Add a flag to indicate this is a cache refresh
            refreshData.cache_refresh = true;
            
            // Send the request to the same endpoint that was used for the original generation
            const response = await fetch('/api/v1/generate', {
                method: 'POST',
                headers: window.getRequestHeaders ? window.getRequestHeaders() : { 'Content-Type': 'application/json' },
                body: JSON.stringify(refreshData)
            });
            
            if (response.ok) {
                debugLog('Cache refreshed successfully');
                showNotification(`Cache refreshed. ${refreshesLeft - 1} refreshes remaining.`, 'success');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Unknown error');
            }
        } catch (error) {
            debugLog('Cache refresh failed', error);
            showNotification(`Cache refresh failed: ${error.message}`, 'error');
        } finally {
            refreshInProgress = false;
            refreshesLeft--;
            updateUI();
            scheduleNextRefresh();
        }
    }

    /**
     * Captures generation data for future cache refreshing
     */
    function captureGenerationData(data) {
        if (!settings.enabled) return;
        
        try {
            // Get the current context
            const context = window.getContext ? window.getContext() : {};
            
            // Create a copy of the generation data
            lastGenerationData = {
                chat_completion_source: context.chat_completion_source,
                model: context.model,
                messages: Array.isArray(data.chat) ? [...data.chat] : undefined,
                prompt: data.prompt,
                max_tokens: settings.minTokens, // Use minimal tokens for refresh
                stream: false, // Don't stream the response
                temperature: 0.1, // Use low temperature for consistency
                presence_penalty: 0,
                frequency_penalty: 0,
                stop: context.stop_sequence,
            };
            
            debugLog('Captured generation data', lastGenerationData);
            
            // Start the refresh cycle
            if (lastGenerationData) {
                startRefreshCycle();
            }
        } catch (error) {
            debugLog('Error capturing generation data', error);
        }
    }

    /**
     * Loads the extension CSS
     */
    function loadCSS() {
        try {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = `/${extensionFolderPath}/styles.css`;
            document.head.appendChild(link);
            console.log('Cache Refresher: CSS loaded');
            debugLog('CSS loaded');
        } catch (error) {
            console.error('Cache Refresher: Error loading CSS:', error);
        }
    }

    // This function is no longer needed as we're directly appending the HTML in the initialization

    /**
     * Creates a minimal UI if the HTML template fails to load
     */
    function createFallbackUI() {
        try {
            console.log('Cache Refresher: Creating fallback UI');
            const settingsContainer = document.getElementById('extensions_settings');
            
            if (settingsContainer) {
                const fallbackDiv = document.createElement('div');
                fallbackDiv.id = 'cache_refresher_fallback';
                fallbackDiv.innerHTML = `
                    <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0; border-radius: 5px;">
                        <h3>Cache Refresher</h3>
                        <div>
                            <input id="cache_refresher_enabled_fallback" type="checkbox" ${settings.enabled ? 'checked' : ''}>
                            <label for="cache_refresher_enabled_fallback">Enable Cache Refresher</label>
                        </div>
                    </div>
                `;
                
                settingsContainer.appendChild(fallbackDiv);
                
                // Add minimal event listener
                const checkbox = document.getElementById('cache_refresher_enabled_fallback');
                if (checkbox) {
                    checkbox.addEventListener('change', function() {
                        settings.enabled = this.checked;
                        saveSettings();
                        updateUI();
                    });
                }
                
                console.log('Cache Refresher: Fallback UI created');
            }
        } catch (error) {
            console.error('Cache Refresher: Error creating fallback UI:', error);
        }
    }

    // Initialize the extension
    function initialize() {
        try {
            console.log('Cache Refresher: Starting initialization');
            
            // Check if eventSource is available
            if (typeof window.eventSource === 'undefined') {
                console.error('Cache Refresher: eventSource is not available');
                throw new Error('eventSource is not available');
            }
            
            // Check if event_types is available
            if (typeof window.event_types === 'undefined') {
                console.error('Cache Refresher: event_types is not available');
                throw new Error('event_types is not available');
            }
            
            // Append the settings HTML to the extensions settings panel
            if (window.$ && window.$.get) {
                window.$.get(`/${extensionFolderPath}/cache-refresher.html`).then(html => {
                    $('#extensions_settings').append(html);
                    
                    // Initialize settings UI
                    updateSettingsPanel();
                    bindSettingsHandlers();
                    
                    console.log('Cache Refresher: Settings panel initialized');
                }).catch(error => {
                    console.error('Cache Refresher: Failed to load HTML template:', error);
                    createFallbackUI();
                });
            } else {
                // Fallback if jQuery is not available
                fetch(`/${extensionFolderPath}/cache-refresher.html`)
                    .then(response => response.text())
                    .then(html => {
                        const settingsContainer = document.getElementById('extensions_settings');
                        if (settingsContainer) {
                            settingsContainer.insertAdjacentHTML('beforeend', html);
                            
                            // Initialize settings UI
                            updateSettingsPanel();
                            bindSettingsHandlers();
                            
                            console.log('Cache Refresher: Settings panel initialized');
                        }
                    })
                    .catch(error => {
                        console.error('Cache Refresher: Failed to load HTML template:', error);
                        createFallbackUI();
                    });
            }
            
            loadCSS();
            addExtensionControls();
            
            // Listen for completed generations
            if (window.eventSource && window.event_types && window.event_types.GENERATION_FINISHED) {
                window.eventSource.on(window.event_types.GENERATION_FINISHED, captureGenerationData);
                console.log('Cache Refresher: Event listener registered');
            }
            
            debugLog('Cache Refresher extension initialized');
            console.log(`[${extensionName}] Extension initialized successfully`);
        } catch (error) {
            console.error(`[${extensionName}] Error initializing extension:`, error);
            // Try to add a simple button even if initialization fails
            try {
                const extensionsMenu = document.getElementById('extensionsMenu');
                if (extensionsMenu) {
                    const button = document.createElement('div');
                    button.id = 'cache_refresher_button_fallback';
                    button.classList.add('list-group-item');
                    button.innerHTML = '<i class="fa-solid fa-sync-alt"></i><span>Cache Refresher (Error)</span>';
                    button.title = 'Cache Refresher failed to initialize';
                    button.style.color = 'red';
                    extensionsMenu.appendChild(button);
                    
                    button.addEventListener('click', () => {
                        alert('Cache Refresher failed to initialize. Check console for errors.');
                    });
                }
            } catch (uiError) {
                console.error('Cache Refresher: Failed to create fallback UI:', uiError);
            }
        }
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose some functions for testing
    window.cacheRefresher = {
        toggleCacheRefresher,
        startRefreshCycle,
        stopRefreshCycle,
        captureGenerationData,
        settings
    };
})();
