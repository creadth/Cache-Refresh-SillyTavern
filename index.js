import { eventSource, event_types, main_api, callPopup, getRequestHeaders, substituteParams } from '../../../../script.js';
import { extension_settings } from 'C:/AIstuffs/SillyTavern Staging/public/scripts/extensions.js';
import { getContext } from 'C:/AIstuffs/SillyTavern Staging/public/scripts/extensions.js';
import { t } from '../../../i18n.js';

// Extension name and path
const extensionName = 'cache-refresher';
const extensionFolderPath = 'third-party/Extension-CacheRefresher';

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
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
}

// Merge with defaults
const settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);

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
    if (settings.showNotifications) {
        toastr[type](message, '', { timeOut: 3000 });
    }
}

/**
 * Updates the extension settings in localStorage
 */
function saveSettings() {
    extension_settings[extensionName] = settings;
    debugLog('Settings saved', settings);
}

/**
 * Toggles the cache refresher on/off
 */
function toggleCacheRefresher() {
    settings.enabled = !settings.enabled;
    saveSettings();
    
    if (settings.enabled) {
        showNotification(t('Cache refreshing enabled'));
        if (lastGenerationData) {
            startRefreshCycle();
        }
    } else {
        showNotification(t('Cache refreshing disabled'));
        stopRefreshCycle();
    }
    
    updateUI();
}

/**
 * Updates the UI elements to reflect current state
 */
function updateUI() {
    const button = document.getElementById('cache_refresher_button');
    const icon = button?.querySelector('i');
    const text = button?.querySelector('span');
    
    if (button) {
        if (settings.enabled) {
            button.classList.add('active');
            icon.className = refreshInProgress ? 
                'fa-solid fa-sync-alt fa-spin' : 
                'fa-solid fa-sync-alt';
            text.textContent = t('Cache Refresher: ON');
        } else {
            button.classList.remove('active');
            icon.className = 'fa-solid fa-sync-alt';
            text.textContent = t('Cache Refresher: OFF');
        }
    }
    
    // Update status indicator
    updateStatusIndicator();
    
    // Update settings panel if it exists
    updateSettingsPanel();
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
 * Updates the HTML settings panel with current values
 */
function updateSettingsPanel() {
    // Update checkbox states
    $('#cache_refresher_enabled').prop('checked', settings.enabled);
    $('#cache_refresher_show_notifications').prop('checked', settings.showNotifications);
    $('#cache_refresher_debug').prop('checked', settings.debug);
    
    // Update number inputs
    $('#cache_refresher_max_refreshes').val(settings.maxRefreshes);
    $('#cache_refresher_interval').val(settings.refreshInterval / (60 * 1000));
    $('#cache_refresher_min_tokens').val(settings.minTokens);
    
    // Update status text
    const statusText = $('#cache_refresher_status_text');
    if (settings.enabled) {
        if (refreshInProgress) {
            statusText.text('Refreshing cache...');
        } else if (refreshesLeft > 0) {
            statusText.text(`Active - ${refreshesLeft} refreshes remaining`);
        } else {
            statusText.text('Active - waiting for next generation');
        }
    } else {
        statusText.text('Inactive');
    }
}

/**
 * Binds event handlers to the settings panel elements
 */
function bindSettingsHandlers() {
    // Enable/disable toggle
    $('#cache_refresher_enabled').on('change', function() {
        settings.enabled = $(this).prop('checked');
        saveSettings();
        
        if (settings.enabled) {
            showNotification(t('Cache refreshing enabled'));
            if (lastGenerationData) {
                startRefreshCycle();
            }
        } else {
            showNotification(t('Cache refreshing disabled'));
            stopRefreshCycle();
        }
        
        updateUI();
        updateSettingsPanel();
    });
    
    // Max refreshes input
    $('#cache_refresher_max_refreshes').on('change', function() {
        settings.maxRefreshes = parseInt($(this).val());
        saveSettings();
        
        // Restart refresh cycle if enabled and we have data
        if (settings.enabled && lastGenerationData) {
            stopRefreshCycle();
            startRefreshCycle();
        }
    });
    
    // Refresh interval input
    $('#cache_refresher_interval').on('change', function() {
        settings.refreshInterval = parseFloat($(this).val()) * 60 * 1000;
        saveSettings();
        
        // Restart refresh cycle if enabled and we have data
        if (settings.enabled && lastGenerationData) {
            stopRefreshCycle();
            startRefreshCycle();
        }
    });
    
    // Min tokens input
    $('#cache_refresher_min_tokens').on('change', function() {
        settings.minTokens = parseInt($(this).val());
        saveSettings();
    });
    
    // Show notifications toggle
    $('#cache_refresher_show_notifications').on('change', function() {
        settings.showNotifications = $(this).prop('checked');
        saveSettings();
    });
    
    // Debug mode toggle
    $('#cache_refresher_debug').on('change', function() {
        settings.debug = $(this).prop('checked');
        saveSettings();
    });
}

/**
 * Shows the settings popup (legacy method, kept for compatibility)
 */
async function showSettings() {
    // This function is kept for backward compatibility
    // The settings are now primarily managed through the HTML panel
    
    const html = `
        <div id="cache_refresher_settings" style="display: flex; flex-direction: column; gap: 10px;">
            <label for="refresh_interval" style="display: flex; justify-content: space-between; align-items: center;">
                <span>${t('Refresh Interval (minutes)')}</span>
                <input type="number" id="refresh_interval" min="0.5" max="10" step="0.5" value="${settings.refreshInterval / (60 * 1000)}" style="width: 100px;">
            </label>
            
            <label for="max_refreshes" style="display: flex; justify-content: space-between; align-items: center;">
                <span>${t('Maximum Refreshes')}</span>
                <input type="number" id="max_refreshes" min="1" max="20" value="${settings.maxRefreshes}" style="width: 100px;">
            </label>
            
            <label for="min_tokens" style="display: flex; justify-content: space-between; align-items: center;">
                <span>${t('Minimum Tokens')}</span>
                <input type="number" id="min_tokens" min="1" max="10" value="${settings.minTokens}" style="width: 100px;">
            </label>
            
            <label style="display: flex; justify-content: space-between; align-items: center;">
                <span>${t('Show Notifications')}</span>
                <input type="checkbox" id="show_notifications" ${settings.showNotifications ? 'checked' : ''}>
            </label>
            
            <label style="display: flex; justify-content: space-between; align-items: center;">
                <span>${t('Debug Mode')}</span>
                <input type="checkbox" id="debug_mode" ${settings.debug ? 'checked' : ''}>
            </label>
        </div>
    `;
    
    const result = await callPopup(html, 'confirm', t('Cache Refresher Settings'));
    
    if (result) {
        settings.refreshInterval = parseFloat(document.getElementById('refresh_interval').value) * 60 * 1000;
        settings.maxRefreshes = parseInt(document.getElementById('max_refreshes').value);
        settings.minTokens = parseInt(document.getElementById('min_tokens').value);
        settings.showNotifications = document.getElementById('show_notifications').checked;
        settings.debug = document.getElementById('debug_mode').checked;
        
        saveSettings();
        showNotification(t('Settings updated'), 'success');
        
        // Restart refresh cycle if enabled and we have data
        if (settings.enabled && lastGenerationData) {
            stopRefreshCycle();
            startRefreshCycle();
        }
        
        // Update the HTML panel
        updateSettingsPanel();
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
    button.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    button.dataset.extensionName = extensionName;
    button.title = t('Toggle cache refreshing to avoid cache expiration');
    
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-sync-alt';
    
    const text = document.createElement('span');
    text.textContent = t('Cache Refresher: OFF');
    
    button.appendChild(icon);
    button.appendChild(text);
    button.addEventListener('click', toggleCacheRefresher);
    
    extensionsMenu.appendChild(button);
    
    // Create settings button
    const settingsButton = document.createElement('div');
    settingsButton.id = 'cache_refresher_settings_button';
    settingsButton.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    settingsButton.title = t('Cache Refresher Settings');
    
    const settingsIcon = document.createElement('i');
    settingsIcon.className = 'fa-solid fa-gear';
    
    const settingsText = document.createElement('span');
    settingsText.textContent = t('Cache Refresher Settings');
    
    settingsButton.appendChild(settingsIcon);
    settingsButton.appendChild(settingsText);
    settingsButton.addEventListener('click', showSettings);
    
    extensionsMenu.appendChild(settingsButton);
    
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
            headers: getRequestHeaders(),
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
        const context = getContext();
        
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

// Listen for completed generations
eventSource.on(event_types.GENERATION_FINISHED, captureGenerationData);

/**
 * Loads the extension CSS
 */
function loadCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = `/scripts/extensions/${extensionFolderPath}/styles.css`;
    document.head.appendChild(link);
    debugLog('CSS loaded');
}

/**
 * Loads the extension HTML template
 */
async function loadSettingsHTML() {
    try {
        const response = await fetch(`/scripts/extensions/${extensionFolderPath}/cache-refresher.html`);
        if (response.ok) {
            const html = await response.text();
            const settingsContainer = document.getElementById('extensions_settings');
            
            if (settingsContainer) {
                // Create a container for our settings
                const extensionSettings = document.createElement('div');
                extensionSettings.innerHTML = html;
                settingsContainer.appendChild(extensionSettings);
                
                // Initialize the settings panel
                updateSettingsPanel();
                
                // Bind event handlers
                bindSettingsHandlers();
                
                debugLog('Settings HTML loaded successfully');
            } else {
                console.warn('Could not find extensions_settings element');
            }
        } else {
            console.error('Failed to load settings HTML');
        }
    } catch (error) {
        console.error('Error loading settings HTML:', error);
    }
}

// Initialize the extension
(function init() {
    loadCSS();
    addExtensionControls();
    loadSettingsHTML();
    debugLog('Cache Refresher extension initialized');
})();
