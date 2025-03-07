// Simple test file to verify the extension is loading
console.log('Cache Refresher test file loaded');

// Function to check if the extension is properly initialized
function checkCacheRefresherExtension() {
    console.log('Running extension check...');
    
    // Check if extension_settings exists
    if (typeof extension_settings === 'undefined') {
        console.error('❌ extension_settings is not defined');
        return false;
    } else {
        console.log('✅ extension_settings is defined');
    }
    
    // Check if cache-refresher settings exist
    if (typeof extension_settings['cache-refresher'] === 'undefined') {
        console.error('❌ cache-refresher settings not found in extension_settings');
        return false;
    } else {
        console.log('✅ cache-refresher settings found');
    }
    
    // Check if required properties exist
    const settings = extension_settings['cache-refresher'];
    const requiredProps = ['enabled', 'refreshInterval', 'maxRefreshes', 'minTokens', 'showNotifications'];
    
    const missingProps = requiredProps.filter(prop => settings[prop] === undefined);
    if (missingProps.length > 0) {
        console.error(`❌ Missing required properties: ${missingProps.join(', ')}`);
    } else {
        console.log('✅ All required properties exist');
    }
    
    // Check if UI elements were created
    setTimeout(() => {
        const button = document.getElementById('cache_refresher_button');
        if (!button) {
            console.error('❌ Cache refresher button not found in DOM');
        } else {
            console.log('✅ Cache refresher button found in DOM');
        }
        
        const settingsContainer = document.getElementById('cache_refresher_settings_container');
        if (!settingsContainer) {
            console.warn('⚠️ Settings container not found - this might be normal if fallback UI was created');
        } else {
            console.log('✅ Settings container found in DOM');
        }
    }, 500);
    
    console.log('Cache Refresher settings:', settings);
    return true;
}

// Check for import errors
function checkImportErrors() {
    console.log('Checking for import errors...');
    
    const requiredImports = [
        { name: 'eventSource', obj: window.eventSource },
        { name: 'event_types', obj: window.event_types },
        { name: 'getContext', obj: window.getContext },
        { name: 'substituteParamsExtended', obj: window.substituteParamsExtended }
    ];
    
    let hasErrors = false;
    requiredImports.forEach(imp => {
        if (typeof imp.obj === 'undefined') {
            console.error(`❌ Required import '${imp.name}' is undefined`);
            hasErrors = true;
        } else {
            console.log(`✅ Required import '${imp.name}' is available`);
        }
    });
    
    return !hasErrors;
}

// Run the checks after a short delay to ensure everything is loaded
setTimeout(() => {
    console.log('=== CACHE REFRESHER EXTENSION TEST ===');
    const importsOk = checkImportErrors();
    const result = checkCacheRefresherExtension();
    
    if (result && importsOk) {
        console.log('✅ OVERALL TEST RESULT: PASSED - Extension appears to be working correctly');
    } else {
        console.error('❌ OVERALL TEST RESULT: FAILED - Extension has initialization issues');
        console.log('Try checking the following:');
        console.log('1. Are all import paths correct?');
        console.log('2. Are there any JavaScript errors in the console?');
        console.log('3. Is the extension folder structure correct?');
    }
}, 2000);

// Test event handling
setTimeout(() => {
    console.log('Testing event handling...');
    try {
        // Simulate a generation finished event
        const testData = {
            chat: [{ role: 'user', content: 'Hello' }],
            prompt: 'Test prompt'
        };
        
        console.log('Triggering GENERATION_FINISHED event...');
        if (window.eventSource && window.eventSource.trigger) {
            window.eventSource.trigger(window.event_types.GENERATION_FINISHED, testData);
            console.log('✅ Event triggered successfully');
        } else {
            console.log('⚠️ Could not trigger test event (this is normal in the test environment)');
        }
    } catch (error) {
        console.error('❌ Error testing event handling:', error);
    }
}, 3000);
