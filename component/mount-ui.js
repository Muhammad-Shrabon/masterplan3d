/* Auto-generated — mounts UI components before app.js runs */
(function () {
    var parts = [
        `<div id="smooth-loader" aria-live="polite" aria-busy="true">
        <div class="loader-content">
            <div class="loader-spinner"></div>
            <h2>Loading Bangla Bosoti</h2>
            <p id="loader-status">Preparing 3D city...</p>
            <div class="loader-bar-wrap"><div id="loader-bar" class="loader-bar"></div></div>
        </div>
    </div>`,
        `    <div id="camera-debug" hidden
        style="position: fixed; top: 20px; right: 20px; z-index: 1000; background: rgba(0, 0, 0, 0.7); color: white; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 12px; pointer-events: none; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(4px);">
        <div style="font-weight: bold; color: #fbbf24; margin-bottom: 5px; font-size: 14px;">Camera Perspective</div>
        <div id="cam-pos">Position: (0, 0, 0)</div>
        <div id="cam-target" style="margin-top: 5px;">Target: (0, 0, 0)</div>
    </div>`,
        `<div id="camera-controls">
        <button id="btn-masterplan" type="button" onclick="switchCameraMode('masterplan')" class="cam-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Masterplan View
        </button>
        <button id="btn-street" type="button" onclick="switchCameraMode('street')" class="cam-btn active">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><path d="M9 17h6"></path><circle cx="17" cy="17" r="2"></circle></svg>
            Street View
        </button>
    </div>`
    ];
    var mount = document.createElement('div');
    mount.id = 'component-mount';
    mount.innerHTML = parts.join('\n');
    document.body.insertBefore(mount, document.body.firstChild);
    while (mount.firstChild) {
        document.body.insertBefore(mount.firstChild, mount);
    }
    mount.remove();
})();
