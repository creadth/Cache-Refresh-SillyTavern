import { extension_settings } from '../../../extensions.js';
const { eventSource, eventTypes, renderExtensionTemplateAsync, sendGenerationRequest, mainApi } = SillyTavern.getContext();

// Log extension loading attempt
console.log('Cache Refresher: Loading extension...');

// Extension name and path
const extensionName = 'Cache-Refresh-SillyTavern';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const path = `third-party/${extensionName}`;

// Default configuration
const defaultSettings = {
    enabled: false,
    refreshInterval: (5 * 60 - 30) * 1000, // 4 minutes 30 seconds in milliseconds
    maxRefreshes: 3,
    minTokens: 1, // Minimum tokens to request for cache refresh
    showNotifications: true,
    debug: false,
};

// Initialize extension settings
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
    console.log('Cache Refresher: Creating new settings object');
}

// Merge with defaults
extension_settings[extensionName] = Object.assign({}, defaultSettings, extension_settings[extensionName]);
const settings = extension_settings[extensionName];
console.log('Cache Refresher: Settings initialized', settings);

// State variables
let lastGenerationData = {
    prompt: null,
};
let refreshTimer = null;
let refreshesLeft = 0;
let refreshInProgress = false;
let statusIndicator = null;
let nextRefreshTime = null;
let statusUpdateInterval = null;

/**
 * Logs a message if debug mode is enabled
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 */
function debugLog(message, data) {
    console.log(`[Cache Refresher] ${message}`, data || '');
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
 * Check if the prompt is a chat completion
 */
function isChatCompletion() {
    return mainApi === 'openai';
}

/**
 * Updates the extension settings in localStorage
 */
async function saveSettings() {
    try {
        extension_settings[extensionName] = settings;
        debugLog('Settings saved', settings);
    } catch (error) {
        console.error('Cache Refresher: Error saving settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

/**
 * Updates the UI elements to reflect current state
 */
function updateUI() {
    // Just update the status indicator and settings panel
    updateStatusIndicator();
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
        let timeString = 'calculating...';

        if (nextRefreshTime) {
            // Calculate time until next refresh
            const timeRemaining = Math.max(0, nextRefreshTime - Date.now());

            // Format time as MM:SS
            const minutes = Math.floor(timeRemaining / 60000);
            const seconds = Math.floor((timeRemaining % 60000) / 1000);
            timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }

        statusIndicator.textContent = `Cache refreshes: ${refreshesLeft} remaining (${timeString})`;
        statusIndicator.style.display = 'block';

        // Update the timer display every second
        if (!statusUpdateInterval) {
            statusUpdateInterval = setInterval(() => {
                updateStatusIndicator();
            }, 1000);
        }
    } else {
        statusIndicator.style.display = 'none';

        // Clear the update interval when not needed
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
            statusUpdateInterval = null;
        }
    }
}

/**
 * Updates the HTML settings panel with current values
 */
async function updateSettingsPanel() {
    try {
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
        if (statusText.length) {
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

        debugLog('Settings panel updated');
    } catch (error) {
        console.error('Cache Refresher: Error updating settings panel:', error);
    }
}

/**
 * Binds event handlers to the settings panel elements
 */
async function bindSettingsHandlers() {
    try {
        debugLog('Binding settings handlers');

        // Enable/disable toggle
        $('#cache_refresher_enabled').off('change').on('change', async function() {
            settings.enabled = $(this).prop('checked');
            await saveSettings();

            if (settings.enabled) {
                showNotification('Cache refreshing enabled');
                // Don't start refresh cycle here, wait for a message
            } else {
                showNotification('Cache refreshing disabled');
                stopRefreshCycle();
            }

            updateUI();
            updateSettingsPanel();
        });

        // Max refreshes input
        $('#cache_refresher_max_refreshes').off('change input').on('change input', async function() {
            settings.maxRefreshes = parseInt($(this).val()) || defaultSettings.maxRefreshes;
            await saveSettings();

            // Don't restart refresh cycle here, just update settings
            if (settings.enabled && refreshTimer) {
                // If a refresh cycle is already running, stop and reschedule with new settings
                stopRefreshCycle();
                scheduleNextRefresh();
            }
        });

        // Refresh interval input
        $('#cache_refresher_interval').off('change input').on('change input', async function() {
            settings.refreshInterval = (parseFloat($(this).val()) || defaultSettings.refreshInterval / (60 * 1000)) * 60 * 1000;
            await saveSettings();

            // Don't restart refresh cycle here, just update settings
            if (settings.enabled && refreshTimer) {
                // If a refresh cycle is already running, stop and reschedule with new settings
                stopRefreshCycle();
                scheduleNextRefresh();
            }
        });

        // Min tokens input
        $('#cache_refresher_min_tokens').off('change input').on('change input', async function() {
            settings.minTokens = parseInt($(this).val()) || defaultSettings.minTokens;
            await saveSettings();
        });

        // Show notifications toggle
        $('#cache_refresher_show_notifications').off('change').on('change', async function() {
            settings.showNotifications = $(this).prop('checked');
            await saveSettings();
        });

        // Debug mode toggle
        $('#cache_refresher_debug').off('change').on('change', async function() {
            settings.debug = $(this).prop('checked');
            await saveSettings();
        });

        debugLog('Settings handlers bound successfully');
    } catch (error) {
        console.error('Cache Refresher: Error binding settings handlers:', error);
    }
}

/**
 * Adds the extension buttons to the UI
 */
async function addExtensionControls() {
    // No need to add buttons - the extension will be controlled through the settings panel
    updateUI();
}

/**
 * Starts the refresh cycle - this should only be called internally
 * and not directly from event handlers
 */
function startRefreshCycle() {
    debugLog('startRefreshCycle:', lastGenerationData);
    if (!lastGenerationData.prompt || !settings.enabled) return;
    debugLog('startRefreshCycle: pass');

    if (!isChatCompletion()) {
        debugLog('startRefreshCycle: Not a chat completion prompt');
        return;
    }

    stopRefreshCycle(); // Clear any existing cycle

    refreshesLeft = settings.maxRefreshes;
    scheduleNextRefresh();
    updateUI();

    debugLog('Refresh cycle started', {
        refreshesLeft,
        interval: settings.refreshInterval,
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

    // Clear the status update interval
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }

    nextRefreshTime = null;
    refreshInProgress = false;
    updateUI();

    debugLog('Refresh cycle stopped');
}

/**
 * Schedules the next refresh
 */
function scheduleNextRefresh() {
    if (!settings.enabled || refreshesLeft <= 0 || !lastGenerationData.prompt) {
        stopRefreshCycle();
        return;
    }

    // Calculate and store the next refresh time
    nextRefreshTime = Date.now() + settings.refreshInterval;

    refreshTimer = setTimeout(() => {
        refreshCache();
    }, settings.refreshInterval);

    debugLog(`Next refresh scheduled in ${settings.refreshInterval / 1000} seconds`);

    // Update the status indicator immediately
    updateStatusIndicator();
}

/**
 * Performs a cache refresh by sending the same message as before. (not optimal, could send only the cached part)
 */
async function refreshCache() {
    if (!lastGenerationData.prompt || refreshInProgress) return;

    refreshInProgress = true;
    updateUI();

    try {
        debugLog('Refreshing cache with data', lastGenerationData);

        if (!isChatCompletion()) {
            throw new Error(`Unsupported API for cache refresh: ${mainApi} in refreshCache()`);
        }

        // Send the new message
        const data = await sendGenerationRequest('quiet', lastGenerationData);
        debugLog('', data);
        // Show notification for successful refresh
        showNotification(`Cache refreshed. ${refreshesLeft - 1} refreshes remaining.`, 'success');

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
    debugLog('captureGenerationData', data);
    debugLog('captureGenerationData', mainApi);
    try {
        if (!isChatCompletion()) {
            debugLog('Prompt Inspector: Not a chat completion prompt');
            return;
        }

        lastGenerationData.prompt = data.chat;
        debugLog('Captured generation data', lastGenerationData);

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


// Initialize the extension
jQuery(async ($) => {
    try {
        debugLog('Cache Refresher: Starting initialization');

        // Append the settings HTML to the extensions settings panel
        $('#extensions_settings').append(await renderExtensionTemplateAsync(path, 'cache-refresher'));

        loadCSS();
        addExtensionControls();

        // Initialize the settings panel
        updateSettingsPanel();

        // Bind event handlers
        bindSettingsHandlers();

        // Listen to catch generations and store it
        eventSource.on(eventTypes.APP_READY, () => {
            eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, captureGenerationData);
        });

        // Listen for generation starting to start the cycle
        // Only start the refresh cycle when a message is received
        eventSource.on(eventTypes.APP_READY, () => {
            eventSource.on(eventTypes.MESSAGE_RECEIVED, () => {
                if (settings.enabled && lastGenerationData.prompt) {
                    debugLog('Message received, starting refresh cycle');
                    stopRefreshCycle(); // Clear any existing cycle first
                    refreshesLeft = settings.maxRefreshes;
                    scheduleNextRefresh();
                    updateUI();
                }
            });
        });

        debugLog('Cache Refresher extension initialized');
        console.log(`[${extensionName}] Extension initialized successfully`);
    } catch (error) {
        console.error(`[${extensionName}] Error initializing extension:`, error);
    }
});
