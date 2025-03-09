/**
 * Cache Refresher Extension for SillyTavern
 * 
 * This extension automatically keeps the language model's cache "warm" by sending
 * periodic minimal requests to prevent cache expiration. This helps reduce API costs
 * and latency during longer interactive sessions.
 * 
 * The extension works by:
 * 1. Capturing prompts after successful generations
 * 2. Scheduling periodic "ping" requests with minimal token requests
 * 3. Providing configurable settings for refresh behavior
 */

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
    refreshInterval: (5 * 60 - 30) * 1000, // 4 minutes 30 seconds in milliseconds (optimized for typical cache lifetimes)
    maxRefreshes: 3,                       // Maximum number of refresh requests to send before stopping
    minTokens: 1,                          // Minimum tokens to request for cache refresh (keeping it minimal to reduce costs)
    showNotifications: true,               // Whether to display toast notifications for each refresh
};

// Initialize extension settings
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = {};
    console.log('Cache Refresher: Creating new settings object');
}

// Merge with defaults - preserves user settings while ensuring all required properties exist
extension_settings[extensionName] = Object.assign({}, defaultSettings, extension_settings[extensionName]);
const settings = extension_settings[extensionName];
console.log('Cache Refresher: Settings initialized', settings);

// State variables
let lastGenerationData = {
    prompt: null,                // Stores the last prompt sent to the AI model
};
let refreshTimer = null;         // Timer for scheduling the next refresh
let refreshesLeft = 0;           // Counter for remaining refreshes in the current cycle
let refreshInProgress = false;   // Flag to prevent concurrent refreshes
let statusIndicator = null;      // DOM element for the floating status indicator
let nextRefreshTime = null;      // Timestamp for the next scheduled refresh
let statusUpdateInterval = null; // Interval for updating the countdown timer

/**
 * Logs a message to console with extension prefix for easier debugging
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 */
function debugLog(message, data) {
    console.log(`[Cache Refresher] ${message}`, data || '');
}

/**
 * Shows a notification if notifications are enabled in settings
 * @param {string} message - Message to show
 * @param {string} type - Notification type (success, info, warning, error)
 */
function showNotification(message, type = 'info') {
    if (settings.showNotifications) {
        toastr[type](message, '', { timeOut: 3000 });
    }
}

/**
 * Check if the current API is using chat completion format
 * Currently only checks for OpenAI, but could be expanded to include other chat completion APIs
 * @returns {boolean} True if using a chat completion API
 */
function isChatCompletion() {
    return mainApi === 'openai';
}

/**
 * Updates the extension settings in localStorage via SillyTavern's extension_settings
 * This ensures settings persist between sessions
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
 * Updates all UI elements to reflect current state
 * This is called whenever the extension state changes
 */
function updateUI() {
    // Update both the floating status indicator and the settings panel
    updateStatusIndicator();
    updateSettingsPanel();
}

/**
 * Creates or updates the floating status indicator
 * This shows the number of remaining refreshes and countdown timer
 */
function updateStatusIndicator() {
    // Create the status indicator if it doesn't exist
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

    // Only show the indicator if the extension is active and has refreshes pending
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

        // Update the timer display every second for a smooth countdown
        if (!statusUpdateInterval) {
            statusUpdateInterval = setInterval(() => {
                updateStatusIndicator();
            }, 1000);
        }
    } else {
        // Hide the indicator when not active
        statusIndicator.style.display = 'none';

        // Clear the update interval when not needed to save resources
        if (statusUpdateInterval) {
            clearInterval(statusUpdateInterval);
            statusUpdateInterval = null;
        }
    }
}

/**
 * Updates the HTML settings panel with current values
 * This ensures the UI always reflects the actual state of the extension
 */
async function updateSettingsPanel() {
    try {
        // Update checkbox states to match current settings
        $('#cache_refresher_enabled').prop('checked', settings.enabled);
        $('#cache_refresher_show_notifications').prop('checked', settings.showNotifications);

        // Update number inputs with current values
        // Convert milliseconds to minutes for the interval display
        $('#cache_refresher_max_refreshes').val(settings.maxRefreshes);
        $('#cache_refresher_interval').val(settings.refreshInterval / (60 * 1000));
        $('#cache_refresher_min_tokens').val(settings.minTokens);

        // Update the status text to show current state
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
 * This sets up all the interactive controls in the settings panel
 */
async function bindSettingsHandlers() {
    try {
        debugLog('Binding settings handlers');

        // Enable/disable toggle - main switch for the extension
        $('#cache_refresher_enabled').off('change').on('change', async function() {
            settings.enabled = $(this).prop('checked');
            await saveSettings();

            if (settings.enabled) {
                showNotification('Cache refreshing enabled');
                // Don't start refresh cycle here, wait for a message
                // This prevents unnecessary refreshes when no conversation is active
            } else {
                showNotification('Cache refreshing disabled');
                stopRefreshCycle(); // Stop any active refresh cycle
            }

            updateUI();
            updateSettingsPanel();
        });

        // Max refreshes input - controls how many refreshes to perform before stopping
        $('#cache_refresher_max_refreshes').off('change input').on('change input', async function() {
            settings.maxRefreshes = parseInt($(this).val()) || defaultSettings.maxRefreshes;
            await saveSettings();

            // If a refresh cycle is already running, stop and reschedule with new settings
            if (settings.enabled && refreshTimer) {
                stopRefreshCycle();
                scheduleNextRefresh();
            }
        });

        // Refresh interval input - controls time between refreshes (in minutes)
        $('#cache_refresher_interval').off('change input').on('change input', async function() {
            // Convert minutes to milliseconds for internal use
            settings.refreshInterval = (parseFloat($(this).val()) || defaultSettings.refreshInterval / (60 * 1000)) * 60 * 1000;
            await saveSettings();

            // If a refresh cycle is already running, stop and reschedule with new settings
            if (settings.enabled && refreshTimer) {
                stopRefreshCycle();
                scheduleNextRefresh();
            }
        });

        // Min tokens input - controls how many tokens to request in each refresh
        $('#cache_refresher_min_tokens').off('change input').on('change input', async function() {
            settings.minTokens = parseInt($(this).val()) || defaultSettings.minTokens;
            await saveSettings();
        });

        // Show notifications toggle - controls whether to show toast notifications
        $('#cache_refresher_show_notifications').off('change').on('change', async function() {
            settings.showNotifications = $(this).prop('checked');
            await saveSettings();
        });

        debugLog('Settings handlers bound successfully');
    } catch (error) {
        console.error('Cache Refresher: Error binding settings handlers:', error);
    }
}

/**
 * Adds the extension buttons to the UI
 * Currently just initializes the UI state
 */
async function addExtensionControls() {
    // No need to add buttons - the extension will be controlled through the settings panel
    updateUI();
}

/**
 * Starts the refresh cycle
 * This should only be called internally and not directly from event handlers
 * It begins the process of periodically refreshing the cache
 */
function startRefreshCycle() {
    debugLog('startRefreshCycle:', lastGenerationData);
    
    // Don't start if we don't have a prompt or if the extension is disabled
    if (!lastGenerationData.prompt || !settings.enabled) return;
    debugLog('startRefreshCycle: pass');

    // Only support chat completion APIs for now
    if (!isChatCompletion()) {
        debugLog('startRefreshCycle: Not a chat completion prompt');
        return;
    }

    // Clear any existing cycle to prevent duplicates
    stopRefreshCycle();

    // Initialize the refresh cycle
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
 * Cleans up all timers and resets state
 */
function stopRefreshCycle() {
    // Clear the refresh timer
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    // Clear the status update interval
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }

    // Reset state variables
    nextRefreshTime = null;
    refreshInProgress = false;
    
    // Update UI to reflect stopped state
    updateUI();

    debugLog('Refresh cycle stopped');
}

/**
 * Schedules the next refresh
 * This sets up a timer to perform the next cache refresh
 */
function scheduleNextRefresh() {
    // Don't schedule if the extension is disabled, no refreshes left, or no prompt
    if (!settings.enabled || refreshesLeft <= 0 || !lastGenerationData.prompt) {
        stopRefreshCycle();
        return;
    }

    // Calculate and store the next refresh time for the countdown display
    nextRefreshTime = Date.now() + settings.refreshInterval;

    // Set up the timer for the next refresh
    refreshTimer = setTimeout(() => {
        refreshCache();
    }, settings.refreshInterval);

    debugLog(`Next refresh scheduled in ${settings.refreshInterval / 1000} seconds`);

    // Update the status indicator immediately to show new time
    updateStatusIndicator();
}

/**
 * Performs a cache refresh by sending a minimal request to the API
 * This keeps the model's context cache warm without generating a full response
 */
async function refreshCache() {
    // Don't refresh if we don't have a prompt or if a refresh is already in progress
    if (!lastGenerationData.prompt || refreshInProgress) return;

    // Set the flag to prevent concurrent refreshes
    refreshInProgress = true;
    updateUI();

    try {
        debugLog('Refreshing cache with data', lastGenerationData);

        // Verify we're using a supported API
        if (!isChatCompletion()) {
            throw new Error(`Unsupported API for cache refresh: ${mainApi} in refreshCache()`);
        }

        // Send a "quiet" request - this tells SillyTavern not to display the response
        // We're just refreshing the cache, not generating visible content
        const data = await sendGenerationRequest('quiet', lastGenerationData);
        debugLog('Cache refresh response:', data);
        
        // Show notification for successful refresh
        showNotification(`Cache refreshed. ${refreshesLeft - 1} refreshes remaining.`, 'success');

    } catch (error) {
        debugLog('Cache refresh failed', error);
        showNotification(`Cache refresh failed: ${error.message}`, 'error');
    } finally {
        // Always clean up, even if there was an error
        refreshInProgress = false;
        refreshesLeft--;
        updateUI();
        scheduleNextRefresh(); // Schedule the next refresh (or stop if no refreshes left)
    }
}

/**
 * Captures generation data for future cache refreshing
 * This is called when a new message is generated to store the prompt for later refreshes
 * 
 * @param {Object} data - The generation data from SillyTavern
 */
function captureGenerationData(data) {
    // Don't capture if the extension is disabled
    if (!settings.enabled) return;
    
    debugLog('captureGenerationData', data);
    debugLog('Current API:', mainApi);
    
    try {
        // Only support chat completion APIs for now
        if (!isChatCompletion()) {
            debugLog('Cache Refresher: Not a chat completion prompt');
            return;
        }

        // Skip dry runs as they're not actual messages
        // Dry runs are used for things like token counting and don't represent actual chat messages
        if (data.dryRun) {
            debugLog('Cache Refresher: Skipping dry run');
            return;
        }

        // Store the chat prompt for future refreshes
        lastGenerationData.prompt = data.chat;
        debugLog('Captured generation data', lastGenerationData);

    } catch (error) {
        debugLog('Error capturing generation data', error);
    }
}

/**
 * Loads the extension CSS
 * This adds the extension's stylesheet to the page
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


// Initialize the extension when jQuery is ready
jQuery(async ($) => {
    try {
        debugLog('Cache Refresher: Starting initialization');

        // Append the settings HTML to the extensions settings panel
        // This loads the HTML template from cache-refresher.html
        $('#extensions_settings').append(await renderExtensionTemplateAsync(path, 'cache-refresher'));

        // Load CSS and set up UI
        loadCSS();
        addExtensionControls();

        // Initialize the settings panel with current values
        updateSettingsPanel();

        // Bind event handlers for all interactive elements
        bindSettingsHandlers();

        // Set up event listeners for SillyTavern events
        
        // Listen for chat completion prompts to capture them for refreshing
        eventSource.on(eventTypes.APP_READY, () => {
            eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, captureGenerationData);
        });

        // Listen for new messages to start the refresh cycle
        // Only start the refresh cycle when a message is received to avoid unnecessary refreshes
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
