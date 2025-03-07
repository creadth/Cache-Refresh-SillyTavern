// Simple test file to verify the extension is loading
console.log('Cache Refresher test file loaded');

// Function to check if the extension is properly initialized
function checkCacheRefresherExtension() {
    if (typeof extension_settings === 'undefined') {
        console.error('extension_settings is not defined');
        return false;
    }
    
    if (typeof extension_settings['cache-refresher'] === 'undefined') {
        console.error('cache-refresher settings not found in extension_settings');
        return false;
    }
    
    console.log('Cache Refresher settings:', extension_settings['cache-refresher']);
    return true;
}

// Run the check after a short delay to ensure everything is loaded
setTimeout(() => {
    const result = checkCacheRefresherExtension();
    console.log('Cache Refresher extension check result:', result);
}, 2000);
