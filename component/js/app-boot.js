        async function bootstrapApp() {
            setLoaderProgress(2, 'Loading engine...');

            const loadWatchdog = setTimeout(() => {
                if (!window.isSceneOptimized) {
                    console.warn('Load watchdog: revealing scene after timeout.');
                    window.isSceneOptimized = true;
                    startCinematicIntro();
                }
            }, 120000);

            window.onOptimizationComplete = () => {
                clearTimeout(loadWatchdog);
                console.log('City ready. Starting cinematic intro...');
                startCinematicIntro();
            };

            try {
                initBase();
                startRenderLoop();
                await nextFrame();

                if (window.__cityBlocks) {
                    buildAllHouses(window.__cityBlocks);
                    await nextFrame();
                }

                initRoadsAndExtras();
                await nextFrame();
            } catch (e) {
                console.error('INIT CRASHED:', e);
                setLoaderProgress(0, 'Load error — check console (F12)');
            }

            if (scene) {
                try {
                    optimizeScene();
                } catch (e) {
                    console.error('OPTIMIZE CRASHED:', e);
                    window.isSceneOptimized = true;
                    window.onOptimizationComplete();
                }
            } else {
                window.isSceneOptimized = true;
                window.onOptimizationComplete();
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { bootstrapApp(); });
        } else {
            bootstrapApp();
        }
