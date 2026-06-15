let scene, camera, renderer, controls, flagObj, lakeObj, river;
        let sr_riverMesh, sr_bankMesh, sr_waterTexture, sr_treeGroup;
        let isNight = false;

        // --- Performance & Animation Uniforms ---
        const globalUniforms = {
            uTime: { value: 0 }
        };

        const PERF = {
            flagAnimInterval: 4,
            debugThrottleMs: 350,
            optimizeBatchMs: 48,
            removeChunkSize: 400,
            removeChunkDelayMs: 120,
            idlePixelRatio: 1.0
        };

        const renderClock = new THREE.Clock();

        let renderFrame = 0;
        let currentPixelRatio = 1;
        let isPageVisible = true;
        let animationLoopId = null;
        let lastDebugUpdate = 0;
        let isMapDragging = false;
        let renderRequested = true;
        let lastDrawTime = 0;
        let isCameraAnimating = false;

        const MAP_CTRL = {
            dampingFactor: 0.06,
            panSpeed: 1.1,
            zoomSpeed: 0.95,
            rotateSpeed: 0.5
        };

        function getIdlePixelRatio() {
            return Math.min(window.devicePixelRatio || 1, PERF.idlePixelRatio);
        }

        function requestRender() {
            renderRequested = true;
        }

        function applyRendererPixelRatio() {
            if (!renderer) return;
            const next = getIdlePixelRatio();
            if (Math.abs(next - currentPixelRatio) < 0.01) return;
            currentPixelRatio = next;
            renderer.setPixelRatio(next);
        }

        function updateControlsFrame(delta) {
            if (!controls) return;
            if (controls.enableDamping && !isCameraAnimating) {
                const base = MAP_CTRL.dampingFactor;
                controls.dampingFactor = 1 - Math.pow(1 - base, delta * 60);
                controls.update();
                controls.dampingFactor = base;
            } else {
                controls.update();
            }
        }

        function handleViewportResize() {
            if (!renderer || !camera) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            applyRendererPixelRatio();
        }

        /** Reset velocity only — keep damping on for smooth glide (dream_city style) */
        function stopMapInertia() {
            if (!controls) return;
            if (controls.sphericalDelta && controls.sphericalDelta.set) {
                controls.sphericalDelta.set(0, 0, 0);
            }
            if (controls.panOffset && controls.panOffset.set) {
                controls.panOffset.set(0, 0, 0);
            }
            controls.update();
        }

        function enableSmoothMapControls() {
            if (!controls) return;
            controls.enableDamping = true;
            controls.dampingFactor = MAP_CTRL.dampingFactor;
        }

        function setupMapControls() {
            const canvas = renderer.domElement;
            canvas.style.cursor = 'grab';
            canvas.style.touchAction = 'none';

            enableSmoothMapControls();
            controls.enablePan = true;
            controls.enableZoom = true;
            controls.enableRotate = true;
            controls.rotateSpeed = MAP_CTRL.rotateSpeed;
            controls.zoomSpeed = MAP_CTRL.zoomSpeed;
            controls.panSpeed = MAP_CTRL.panSpeed;
            controls.screenSpacePanning = true;
            controls.maxPolarAngle = Math.PI / 2.08;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE
            };

            controls.addEventListener('start', () => {
                if (introActive) return;
                canvas.style.cursor = 'grabbing';
            });

            controls.addEventListener('end', () => {
                canvas.style.cursor = 'grab';
            });

            canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        }

        function setLoaderProgress(percent, message) {
            const bar = document.getElementById('loader-bar');
            const status = document.getElementById('loader-status');
            const clamped = Math.max(0, Math.min(100, percent));
            if (bar) bar.style.width = clamped + '%';
            if (status && message) status.textContent = message;
        }

        function hideLoader() {
            const loader = document.getElementById('smooth-loader');
            if (!loader) return;
            loader.classList.add('is-done');
            loader.setAttribute('aria-busy', 'false');
            setTimeout(() => loader.remove(), 600);
        }

        function nextFrame() {
            return new Promise(resolve => requestAnimationFrame(resolve));
        }

        document.addEventListener('visibilitychange', () => {
            isPageVisible = document.visibilityState === 'visible';
            if (isPageVisible) requestRender();
        });

        // --- Camera System Controller ---
        let cameraSystemConfig = {
            behindView: false,
            frontView: false,
            autoSwitch: true
        };


        /**
         * Controller to enable/disable camera systems
         * Example: setCameraSystemControl({ front: false, auto: false })
         */
        function setCameraSystemControl(options = {}) {
            if (options.behind !== undefined) cameraSystemConfig.behindView = options.behind;
            if (options.front !== undefined) cameraSystemConfig.frontView = options.front;
            if (options.auto !== undefined) cameraSystemConfig.autoSwitch = options.auto;

            // Camera button removed as requested
            console.log("Camera System Control updated:", cameraSystemConfig);
        }

        // --- Cinematic intro (fog reveal + master → street → master) ---
        const CAMERA_VIEWS = {
            masterplan: {
                position: { x: -20, y: 296, z: -118 },
                target: { x: -20, y: 184, z: -118 }
            },
            street: {
                position: { x: -163, y: 5, z: 47 },
                target: { x: -86, y: 3, z: 12 }
            }
        };

        const INTRO = {
            fogDurationMs: 4000,
            toStreetDuration: 3,
            streetHoldMs: 1400,
            fogDensityStart: 0.008,
            fogDensityEnd: 0.0005
        };

        let introActive = false;
        let introPhase = 'idle'; // idle | fog | toStreet | done
        let fogRevealStartTime = null;
        let fogRevealComplete = false;

        function setCameraModeUI(mode) {
            document.querySelectorAll('.cam-btn').forEach(btn => btn.classList.remove('active'));
            const btnId = mode === 'masterplan' ? 'btn-masterplan' : 'btn-street';
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }

        function animateCameraView(mode, opts = {}) {
            if (!controls || !camera) return;
            const view = CAMERA_VIEWS[mode];
            if (!view) return;

            const duration = opts.duration ?? 2;
            const ease = opts.ease ?? 'expo.inOut';

            if (!opts.skipInertiaReset) {
                stopMapInertia();
                isMapDragging = false;
                controls.enableDamping = false;
            }

            if (!opts.skipUI) setCameraModeUI(mode);

            gsap.killTweensOf(camera.position);
            gsap.killTweensOf(controls.target);

            isCameraAnimating = true;
            requestRender();

            gsap.to(camera.position, {
                x: view.position.x,
                y: view.position.y,
                z: view.position.z,
                duration,
                ease,
                onUpdate: requestRender
            });

            gsap.to(controls.target, {
                x: view.target.x,
                y: view.target.y,
                z: view.target.z,
                duration,
                ease,
                onUpdate: () => {
                    controls.update();
                    requestRender();
                },
                onComplete: () => {
                    isCameraAnimating = false;
                    enableSmoothMapControls();
                    requestRender();
                    if (opts.onComplete) opts.onComplete();
                }
            });
        }

        function finishCinematicIntro() {
            introPhase = 'done';
            introActive = false;
            fogRevealComplete = true;
            if (scene && scene.fog) scene.fog.density = INTRO.fogDensityEnd;
            setCameraModeUI('street');
            enableSmoothMapControls();
            controls.update();
        }

        function onIntroFogComplete() {
            if (introPhase !== 'fog') return;
            introPhase = 'toStreet';
            setTimeout(() => {
                animateCameraView('street', {
                    duration: INTRO.toStreetDuration,
                    ease: 'power3.inOut',
                    onComplete: () => {
                        setTimeout(finishCinematicIntro, INTRO.streetHoldMs);
                    }
                });
            }, 500);
        }

        function startCinematicIntro() {
            if (introPhase !== 'idle') return;
            introActive = true;
            introPhase = 'fog';
            fogRevealComplete = false;
            fogRevealStartTime = null;
            requestRender();

            if (scene && scene.fog) scene.fog.density = INTRO.fogDensityStart;
            camera.position.set(CAMERA_VIEWS.masterplan.position.x, CAMERA_VIEWS.masterplan.position.y, CAMERA_VIEWS.masterplan.position.z);
            controls.target.set(CAMERA_VIEWS.masterplan.target.x, CAMERA_VIEWS.masterplan.target.y, CAMERA_VIEWS.masterplan.target.z);
            controls.update();
            setCameraModeUI('street');

            hideLoader();
        }

        /**
         * Switches the camera between Masterplan and Street View
         * Uses GSAP for ultra-smooth transitions
         */
        function switchCameraMode(mode) {
            if (!controls || !camera || introActive) return;
            animateCameraView(mode);
        }
        // --- Tree Height Controls ---

        // --- Tree Height Controls ---
        let wallGTreeHeight = 7;
        let wallStdTreeHeight = 70;

        // Variables for new animated trees from tree2.html
        let animatedLeaves = [];

        // --- Bottom Area / Stone Base Controls ---
        let stoneBaseW = 60;
        let stoneBaseD = 60;
        let stoneBaseHT = 4;
        let stoneBaseY = 2;

        // --- Pool Water Geometries ---
        const poolWaterGeometries = new Set();

        function createStoneTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#6a737b';
            ctx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 400; i++) {
                const x = Math.random() * 256;
                const y = Math.random() * 256;
                const radius = Math.random() * 4 + 2;
                ctx.fillStyle = Math.random() > 0.5 ? '#8c98a3' : '#4d555c';
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(2, 2);
            return tex;
        }

        function createLeafTexture() {
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            // Use white/light-gray base so it doesn't darken the material color (0x3EA65A)
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 800; i++) {
                const gray = 255 - Math.random() * 40;
                ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
                ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 6);
                const shadow = 210 + Math.random() * 45;
                ctx.fillStyle = `rgb(${shadow}, ${shadow}, ${shadow})`;
                ctx.fillRect(Math.random() * 128, Math.random() * 128, 4, 3);
            }
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        const CITY_BOUNDS = { minX: -700, maxX: 700, minZ: -1600, maxZ: 1600 };

        /** Rectangular forest zones for empty land west of the main housing grid */
        const LEFT_FOREST_ZONES = [
            {
                // Upper-left free plot (west of vertical road, below top forest strip)
                minX: -720, maxX: -505, minZ: -640, maxZ: -280,
                density: 0.92,
                exclude: [
                    { minX: -530, maxX: -490, minZ: -640, maxZ: -280 }
                ]
            },
            {
                // Middle-left free plot (between horizontal branch roads)
                minX: -720, maxX: -505, minZ: -250, maxZ: 120,
                density: 0.93,
                exclude: [
                    { minX: -530, maxX: -490, minZ: -250, maxZ: 120 },
                    { minX: -720, maxX: -490, minZ: -30, maxZ: 25 }
                ]
            },
            {
                // Lower-left free plot + bottom-left open land
                minX: -720, maxX: -430, minZ: 150, maxZ: 720,
                density: 0.9,
                exclude: [
                    { minX: -530, maxX: -490, minZ: 150, maxZ: 720 },
                    { minX: -700, maxX: -660, minZ: 960, maxZ: 1040 }
                ]
            }
        ];

        function isInsideRect(x, z, rect) {
            return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
        }

        function generateLeftForestPositions(zones, options = {}) {
            const spacingX = options.spacingX || 42;
            const spacingZ = options.spacingZ || 40;
            const minScale = options.minScale || 13;
            const maxScale = options.maxScale || 17;
            const jitter = options.jitter || 14;
            const positions = [];

            zones.forEach(zone => {
                const excludes = zone.exclude || [];
                for (let x = zone.minX; x <= zone.maxX; x += spacingX) {
                    for (let z = zone.minZ; z <= zone.maxZ; z += spacingZ) {
                        const px = x + (Math.random() - 0.5) * jitter;
                        const pz = z + (Math.random() - 0.5) * jitter;
                        if (excludes.some(ex => isInsideRect(px, pz, ex))) continue;
                        if (Math.random() > (zone.density || 0.85)) continue;
                        positions.push({
                            x: px,
                            y: 0.1,
                            z: pz,
                            scale: minScale + Math.random() * (maxScale - minScale)
                        });
                    }
                }
            });
            return positions;
        }

        const customTreePositions = [
            // Add your tree positions here. x/z = world position, y = height offset, scale = tree height in world units
            // Serial 2 (Removed roadside rows)
            // Top Free Space Serial
            { x: -650, y: 0.1, z: -1250, scale: 15 },
            { x: -650, y: 0.1, z: -1280, scale: 16 },
            { x: -650, y: 0.1, z: -1210, scale: 14 },
            { x: -650, y: 0.1, z: -1150, scale: 15 },
            { x: -650, y: 0.1, z: -1190, scale: 17 },
            { x: -650, y: 0.1, z: -1130, scale: 15 },
            { x: -650, y: 0.1, z: -1090, scale: 16 },
            { x: -650, y: 0.1, z: -1040, scale: 15 },
            { x: -650, y: 0.1, z: -990, scale: 16 },
            { x: -650, y: 0.1, z: -940, scale: 14 },
            { x: -650, y: 0.1, z: -890, scale: 14 },
            { x: -650, y: 0.1, z: -840, scale: 14 },
            // Top Serial 
            { x: -580, y: 0.1, z: -1250, scale: 15 },
            { x: -580, y: 0.1, z: -1280, scale: 16 },
            { x: -580, y: 0.1, z: -1210, scale: 14 },
            { x: -580, y: 0.1, z: -1150, scale: 15 },
            { x: -580, y: 0.1, z: -1190, scale: 17 },
            { x: -580, y: 0.1, z: -1130, scale: 15 },
            { x: -580, y: 0.1, z: -1090, scale: 16 },
            { x: -580, y: 0.1, z: -1040, scale: 15 },
            { x: -580, y: 0.1, z: -990, scale: 16 },
            { x: -580, y: 0.1, z: -940, scale: 14 },
            { x: -580, y: 0.1, z: -890, scale: 14 },
            { x: -580, y: 0.1, z: -840, scale: 14 },
            { x: -580, y: 0.1, z: -810, scale: 14 },
            // Top Serial 
            { x: -510, y: 0.1, z: -1250, scale: 15 },
            { x: -510, y: 0.1, z: -1280, scale: 16 },
            { x: -510, y: 0.1, z: -1210, scale: 14 },
            { x: -510, y: 0.1, z: -1150, scale: 15 },
            { x: -510, y: 0.1, z: -1190, scale: 17 },
            { x: -510, y: 0.1, z: -1130, scale: 15 },
            { x: -510, y: 0.1, z: -1090, scale: 16 },
            { x: -510, y: 0.1, z: -1040, scale: 15 },
            { x: -510, y: 0.1, z: -990, scale: 16 },
            { x: -510, y: 0.1, z: -940, scale: 14 },
            { x: -510, y: 0.1, z: -890, scale: 14 },
            { x: -510, y: 0.1, z: -840, scale: 14 },
            { x: -510, y: 0.1, z: -810, scale: 14 },
            { x: -510, y: 0.1, z: -790, scale: 14 },
            // Top Serial 
            { x: -440, y: 0.1, z: -1250, scale: 15 },
            { x: -440, y: 0.1, z: -1280, scale: 16 },
            { x: -440, y: 0.1, z: -1210, scale: 14 },
            { x: -440, y: 0.1, z: -1150, scale: 15 },
            { x: -440, y: 0.1, z: -1190, scale: 17 },
            { x: -440, y: 0.1, z: -1130, scale: 15 },
            { x: -440, y: 0.1, z: -1090, scale: 16 },
            { x: -440, y: 0.1, z: -1040, scale: 15 },
            { x: -440, y: 0.1, z: -990, scale: 16 },
            { x: -440, y: 0.1, z: -940, scale: 14 },
            { x: -440, y: 0.1, z: -890, scale: 14 },
            { x: -440, y: 0.1, z: -840, scale: 14 },
            { x: -440, y: 0.1, z: -810, scale: 14 },
            { x: -440, y: 0.1, z: -790, scale: 14 },
            { x: -440, y: 0.1, z: -770, scale: 14 },
            // Top Serial 
            { x: -370, y: 0.1, z: -1250, scale: 15 },
            { x: -370, y: 0.1, z: -1280, scale: 16 },
            { x: -370, y: 0.1, z: -1210, scale: 14 },
            { x: -370, y: 0.1, z: -1150, scale: 15 },
            { x: -370, y: 0.1, z: -1190, scale: 17 },
            { x: -370, y: 0.1, z: -1130, scale: 15 },
            { x: -370, y: 0.1, z: -1090, scale: 16 },
            { x: -370, y: 0.1, z: -1040, scale: 15 },
            { x: -370, y: 0.1, z: -990, scale: 16 },
            { x: -370, y: 0.1, z: -940, scale: 14 },
            { x: -370, y: 0.1, z: -890, scale: 14 },
            { x: -370, y: 0.1, z: -840, scale: 14 },
            { x: -370, y: 0.1, z: -810, scale: 14 },
            { x: -370, y: 0.1, z: -790, scale: 14 },
            { x: -370, y: 0.1, z: -770, scale: 14 },
            { x: -370, y: 0.1, z: -740, scale: 14 },
            // Top Serial 
            { x: -310, y: 0.1, z: -1250, scale: 15 },
            { x: -310, y: 0.1, z: -1280, scale: 16 },
            { x: -310, y: 0.1, z: -1210, scale: 14 },
            { x: -310, y: 0.1, z: -1150, scale: 15 },
            { x: -310, y: 0.1, z: -1190, scale: 17 },
            { x: -310, y: 0.1, z: -1130, scale: 15 },
            { x: -310, y: 0.1, z: -1090, scale: 16 },
            { x: -310, y: 0.1, z: -1040, scale: 15 },
            { x: -310, y: 0.1, z: -990, scale: 16 },
            { x: -310, y: 0.1, z: -940, scale: 14 },
            { x: -310, y: 0.1, z: -890, scale: 14 },
            { x: -310, y: 0.1, z: -840, scale: 14 },
            { x: -310, y: 0.1, z: -810, scale: 14 },
            { x: -310, y: 0.1, z: -780, scale: 14 },
            { x: -310, y: 0.1, z: -750, scale: 14 },
            { x: -310, y: 0.1, z: -720, scale: 14 },
            // Top Serial 
            { x: -240, y: 0.1, z: -1250, scale: 15 },
            { x: -240, y: 0.1, z: -1280, scale: 16 },
            { x: -240, y: 0.1, z: -1210, scale: 14 },
            { x: -240, y: 0.1, z: -1150, scale: 15 },
            { x: -240, y: 0.1, z: -1190, scale: 17 },
            { x: -240, y: 0.1, z: -1130, scale: 15 },
            { x: -240, y: 0.1, z: -1090, scale: 16 },
            { x: -240, y: 0.1, z: -1040, scale: 15 },
            { x: -240, y: 0.1, z: -990, scale: 16 },
            { x: -240, y: 0.1, z: -940, scale: 14 },
            { x: -240, y: 0.1, z: -890, scale: 14 },
            { x: -240, y: 0.1, z: -840, scale: 14 },
            { x: -240, y: 0.1, z: -810, scale: 14 },
            { x: -240, y: 0.1, z: -780, scale: 14 },
            { x: -240, y: 0.1, z: -750, scale: 14 },
            { x: -240, y: 0.1, z: -720, scale: 14 },
            { x: -240, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: -170, y: 0.1, z: -1250, scale: 15 },
            { x: -170, y: 0.1, z: -1280, scale: 16 },
            { x: -170, y: 0.1, z: -1210, scale: 14 },
            { x: -170, y: 0.1, z: -1150, scale: 15 },
            { x: -170, y: 0.1, z: -1190, scale: 17 },
            { x: -170, y: 0.1, z: -1130, scale: 15 },
            { x: -170, y: 0.1, z: -1090, scale: 16 },
            { x: -170, y: 0.1, z: -1040, scale: 15 },
            { x: -170, y: 0.1, z: -990, scale: 16 },
            { x: -170, y: 0.1, z: -940, scale: 14 },
            { x: -170, y: 0.1, z: -890, scale: 14 },
            { x: -170, y: 0.1, z: -840, scale: 14 },
            { x: -170, y: 0.1, z: -810, scale: 14 },
            { x: -170, y: 0.1, z: -780, scale: 14 },
            { x: -170, y: 0.1, z: -750, scale: 14 },
            { x: -170, y: 0.1, z: -720, scale: 14 },
            { x: -170, y: 0.1, z: -690, scale: 14 },
            // Top Serial 
            { x: -120, y: 0.1, z: -1250, scale: 15 },
            { x: -120, y: 0.1, z: -1280, scale: 16 },
            { x: -120, y: 0.1, z: -1210, scale: 14 },
            { x: -120, y: 0.1, z: -1150, scale: 15 },
            { x: -120, y: 0.1, z: -1190, scale: 17 },
            { x: -120, y: 0.1, z: -1130, scale: 15 },
            { x: -120, y: 0.1, z: -1090, scale: 16 },
            { x: -120, y: 0.1, z: -1040, scale: 15 },
            { x: -120, y: 0.1, z: -990, scale: 16 },
            { x: -120, y: 0.1, z: -940, scale: 14 },
            { x: -120, y: 0.1, z: -890, scale: 14 },
            { x: -120, y: 0.1, z: -840, scale: 14 },
            { x: -120, y: 0.1, z: -810, scale: 14 },
            { x: -120, y: 0.1, z: -780, scale: 14 },
            { x: -120, y: 0.1, z: -750, scale: 14 },
            { x: -120, y: 0.1, z: -720, scale: 14 },
            { x: -120, y: 0.1, z: -690, scale: 14 },
            // Top Serial 
            { x: -60, y: 0.1, z: -1250, scale: 15 },
            { x: -60, y: 0.1, z: -1280, scale: 16 },
            { x: -60, y: 0.1, z: -1210, scale: 14 },
            { x: -60, y: 0.1, z: -1150, scale: 15 },
            { x: -60, y: 0.1, z: -1190, scale: 17 },
            { x: -60, y: 0.1, z: -1130, scale: 15 },
            { x: -60, y: 0.1, z: -1090, scale: 16 },
            { x: -60, y: 0.1, z: -1040, scale: 15 },
            { x: -60, y: 0.1, z: -990, scale: 16 },
            { x: -60, y: 0.1, z: -940, scale: 14 },
            { x: -60, y: 0.1, z: -890, scale: 14 },
            { x: -60, y: 0.1, z: -840, scale: 14 },
            { x: -60, y: 0.1, z: -800, scale: 14 },
            { x: -60, y: 0.1, z: -770, scale: 14 },
            { x: -60, y: 0.1, z: -735, scale: 14 },
            { x: -60, y: 0.1, z: -705, scale: 14 },
            { x: -60, y: 0.1, z: -685, scale: 14 },
            { x: -60, y: 0.1, z: -665, scale: 14 },

            // Top Serial 
            { x: 40, y: 0.1, z: -1250, scale: 15 },
            { x: 40, y: 0.1, z: -1280, scale: 16 },
            { x: 40, y: 0.1, z: -1210, scale: 14 },
            { x: 40, y: 0.1, z: -1150, scale: 15 },
            { x: 40, y: 0.1, z: -1190, scale: 17 },
            { x: 40, y: 0.1, z: -1130, scale: 15 },
            { x: 40, y: 0.1, z: -1090, scale: 16 },
            { x: 40, y: 0.1, z: -1040, scale: 15 },
            { x: 40, y: 0.1, z: -990, scale: 16 },
            { x: 40, y: 0.1, z: -940, scale: 14 },
            { x: 40, y: 0.1, z: -890, scale: 14 },
            { x: 40, y: 0.1, z: -840, scale: 14 },
            { x: 40, y: 0.1, z: -800, scale: 14 },
            { x: 40, y: 0.1, z: -770, scale: 14 },
            { x: 40, y: 0.1, z: -730, scale: 14 },
            { x: 40, y: 0.1, z: -710, scale: 14 },
            { x: 40, y: 0.1, z: -690, scale: 14 },
            { x: 40, y: 0.1, z: -670, scale: 14 },
            // Top Serial 
            { x: 110, y: 0.1, z: -1250, scale: 15 },
            { x: 110, y: 0.1, z: -1280, scale: 16 },
            { x: 110, y: 0.1, z: -1210, scale: 14 },
            { x: 110, y: 0.1, z: -1150, scale: 15 },
            { x: 110, y: 0.1, z: -1190, scale: 17 },
            { x: 110, y: 0.1, z: -1130, scale: 15 },
            { x: 110, y: 0.1, z: -1090, scale: 16 },
            { x: 110, y: 0.1, z: -1040, scale: 15 },
            { x: 110, y: 0.1, z: -990, scale: 16 },
            { x: 110, y: 0.1, z: -940, scale: 14 },
            { x: 110, y: 0.1, z: -890, scale: 14 },
            { x: 110, y: 0.1, z: -840, scale: 14 },
            { x: 110, y: 0.1, z: -800, scale: 14 },
            { x: 110, y: 0.1, z: -770, scale: 14 },
            { x: 110, y: 0.1, z: -730, scale: 14 },
            { x: 110, y: 0.1, z: -700, scale: 14 },
            { x: 110, y: 0.1, z: -680, scale: 14 },
            { x: 110, y: 0.1, z: -660, scale: 14 },
            // Top Serial 
            { x: 150, y: 0.1, z: -1250, scale: 15 },
            { x: 150, y: 0.1, z: -1280, scale: 16 },
            { x: 150, y: 0.1, z: -1210, scale: 14 },
            { x: 150, y: 0.1, z: -1150, scale: 15 },
            { x: 150, y: 0.1, z: -1190, scale: 17 },
            { x: 150, y: 0.1, z: -1130, scale: 15 },
            { x: 150, y: 0.1, z: -1090, scale: 16 },
            { x: 150, y: 0.1, z: -1040, scale: 15 },
            { x: 150, y: 0.1, z: -990, scale: 16 },
            { x: 150, y: 0.1, z: -940, scale: 14 },
            { x: 150, y: 0.1, z: -890, scale: 14 },
            { x: 150, y: 0.1, z: -840, scale: 14 },
            { x: 150, y: 0.1, z: -800, scale: 14 },
            { x: 150, y: 0.1, z: -770, scale: 14 },
            { x: 150, y: 0.1, z: -730, scale: 14 },
            { x: 150, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 190, y: 0.1, z: -1250, scale: 15 },
            { x: 190, y: 0.1, z: -1280, scale: 16 },
            { x: 190, y: 0.1, z: -1210, scale: 14 },
            { x: 190, y: 0.1, z: -1150, scale: 15 },
            { x: 190, y: 0.1, z: -1190, scale: 17 },
            { x: 190, y: 0.1, z: -1130, scale: 15 },
            { x: 190, y: 0.1, z: -1090, scale: 16 },
            { x: 190, y: 0.1, z: -1040, scale: 15 },
            { x: 190, y: 0.1, z: -990, scale: 16 },
            { x: 190, y: 0.1, z: -940, scale: 14 },
            { x: 190, y: 0.1, z: -890, scale: 14 },
            { x: 190, y: 0.1, z: -840, scale: 14 },
            { x: 190, y: 0.1, z: -800, scale: 14 },
            { x: 190, y: 0.1, z: -770, scale: 14 },
            { x: 190, y: 0.1, z: -730, scale: 14 },
            { x: 190, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 230, y: 0.1, z: -1250, scale: 15 },
            { x: 230, y: 0.1, z: -1280, scale: 16 },
            { x: 230, y: 0.1, z: -1210, scale: 14 },
            { x: 230, y: 0.1, z: -1150, scale: 15 },
            { x: 230, y: 0.1, z: -1190, scale: 17 },
            { x: 230, y: 0.1, z: -1130, scale: 15 },
            { x: 230, y: 0.1, z: -1090, scale: 16 },
            { x: 230, y: 0.1, z: -1040, scale: 15 },
            { x: 230, y: 0.1, z: -990, scale: 16 },
            { x: 230, y: 0.1, z: -940, scale: 14 },
            { x: 230, y: 0.1, z: -890, scale: 14 },
            { x: 230, y: 0.1, z: -840, scale: 14 },
            { x: 230, y: 0.1, z: -800, scale: 14 },
            { x: 230, y: 0.1, z: -770, scale: 14 },
            { x: 230, y: 0.1, z: -730, scale: 14 },
            { x: 230, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 270, y: 0.1, z: -1250, scale: 15 },
            { x: 270, y: 0.1, z: -1280, scale: 16 },
            { x: 270, y: 0.1, z: -1210, scale: 14 },
            { x: 270, y: 0.1, z: -1150, scale: 15 },
            { x: 270, y: 0.1, z: -1190, scale: 17 },
            { x: 270, y: 0.1, z: -1130, scale: 15 },
            { x: 270, y: 0.1, z: -1090, scale: 16 },
            { x: 270, y: 0.1, z: -1040, scale: 15 },
            { x: 270, y: 0.1, z: -990, scale: 16 },
            { x: 270, y: 0.1, z: -940, scale: 14 },
            { x: 270, y: 0.1, z: -890, scale: 14 },
            { x: 270, y: 0.1, z: -840, scale: 14 },
            { x: 270, y: 0.1, z: -800, scale: 14 },
            { x: 270, y: 0.1, z: -770, scale: 14 },
            { x: 270, y: 0.1, z: -730, scale: 14 },
            { x: 270, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 310, y: 0.1, z: -1250, scale: 15 },
            { x: 310, y: 0.1, z: -1280, scale: 16 },
            { x: 310, y: 0.1, z: -1210, scale: 14 },
            { x: 310, y: 0.1, z: -1150, scale: 15 },
            { x: 310, y: 0.1, z: -1190, scale: 17 },
            { x: 310, y: 0.1, z: -1130, scale: 15 },
            { x: 310, y: 0.1, z: -1090, scale: 16 },
            { x: 310, y: 0.1, z: -1040, scale: 15 },
            { x: 310, y: 0.1, z: -990, scale: 16 },
            { x: 310, y: 0.1, z: -940, scale: 14 },
            { x: 310, y: 0.1, z: -890, scale: 14 },
            { x: 310, y: 0.1, z: -840, scale: 14 },
            { x: 310, y: 0.1, z: -800, scale: 14 },
            { x: 310, y: 0.1, z: -770, scale: 14 },
            { x: 310, y: 0.1, z: -730, scale: 14 },
            { x: 310, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 340, y: 0.1, z: -1250, scale: 15 },
            { x: 340, y: 0.1, z: -1280, scale: 16 },
            { x: 340, y: 0.1, z: -1210, scale: 14 },
            { x: 340, y: 0.1, z: -1150, scale: 15 },
            { x: 340, y: 0.1, z: -1190, scale: 17 },
            { x: 340, y: 0.1, z: -1130, scale: 15 },
            { x: 340, y: 0.1, z: -1090, scale: 16 },
            { x: 340, y: 0.1, z: -1040, scale: 15 },
            { x: 340, y: 0.1, z: -990, scale: 16 },
            { x: 340, y: 0.1, z: -940, scale: 14 },
            { x: 340, y: 0.1, z: -890, scale: 14 },
            { x: 340, y: 0.1, z: -840, scale: 14 },
            { x: 340, y: 0.1, z: -800, scale: 14 },
            { x: 340, y: 0.1, z: -770, scale: 14 },
            { x: 340, y: 0.1, z: -730, scale: 14 },
            { x: 340, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 390, y: 0.1, z: -1250, scale: 15 },
            { x: 390, y: 0.1, z: -1280, scale: 16 },
            { x: 390, y: 0.1, z: -1210, scale: 14 },
            { x: 390, y: 0.1, z: -1150, scale: 15 },
            { x: 390, y: 0.1, z: -1190, scale: 17 },
            { x: 390, y: 0.1, z: -1130, scale: 15 },
            { x: 390, y: 0.1, z: -1090, scale: 16 },
            { x: 390, y: 0.1, z: -1040, scale: 15 },
            { x: 390, y: 0.1, z: -990, scale: 16 },
            { x: 390, y: 0.1, z: -940, scale: 14 },
            { x: 390, y: 0.1, z: -890, scale: 14 },
            { x: 390, y: 0.1, z: -840, scale: 14 },
            { x: 390, y: 0.1, z: -800, scale: 14 },
            { x: 390, y: 0.1, z: -770, scale: 14 },
            { x: 390, y: 0.1, z: -730, scale: 14 },
            { x: 390, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 410, y: 0.1, z: -1250, scale: 15 },
            { x: 410, y: 0.1, z: -1280, scale: 16 },
            { x: 410, y: 0.1, z: -1210, scale: 14 },
            { x: 410, y: 0.1, z: -1150, scale: 15 },
            { x: 410, y: 0.1, z: -1190, scale: 17 },
            { x: 410, y: 0.1, z: -1130, scale: 15 },
            { x: 410, y: 0.1, z: -1090, scale: 16 },
            { x: 410, y: 0.1, z: -1040, scale: 15 },
            { x: 410, y: 0.1, z: -990, scale: 16 },
            { x: 410, y: 0.1, z: -940, scale: 14 },
            { x: 410, y: 0.1, z: -890, scale: 14 },
            { x: 410, y: 0.1, z: -840, scale: 14 },
            { x: 410, y: 0.1, z: -800, scale: 14 },
            { x: 410, y: 0.1, z: -770, scale: 14 },
            { x: 410, y: 0.1, z: -730, scale: 14 },
            { x: 410, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 450, y: 0.1, z: -1250, scale: 15 },
            { x: 450, y: 0.1, z: -1280, scale: 16 },
            { x: 450, y: 0.1, z: -1210, scale: 14 },
            { x: 450, y: 0.1, z: -1150, scale: 15 },
            { x: 450, y: 0.1, z: -1190, scale: 17 },
            { x: 450, y: 0.1, z: -1130, scale: 15 },
            { x: 450, y: 0.1, z: -1090, scale: 16 },
            { x: 450, y: 0.1, z: -1040, scale: 15 },
            { x: 450, y: 0.1, z: -990, scale: 16 },
            { x: 450, y: 0.1, z: -940, scale: 14 },
            { x: 450, y: 0.1, z: -890, scale: 14 },
            { x: 450, y: 0.1, z: -840, scale: 14 },
            { x: 450, y: 0.1, z: -800, scale: 14 },
            { x: 450, y: 0.1, z: -770, scale: 14 },
            { x: 450, y: 0.1, z: -730, scale: 14 },
            { x: 450, y: 0.1, z: -700, scale: 14 },
            // Top Serial 
            { x: 500, y: 0.1, z: -1250, scale: 15 },
            { x: 500, y: 0.1, z: -1280, scale: 16 },
            { x: 500, y: 0.1, z: -1210, scale: 14 },
            { x: 500, y: 0.1, z: -1150, scale: 15 },
            { x: 500, y: 0.1, z: -1190, scale: 17 },
            { x: 500, y: 0.1, z: -1130, scale: 15 },
            { x: 500, y: 0.1, z: -1090, scale: 16 },
            { x: 500, y: 0.1, z: -1040, scale: 15 },
            { x: 500, y: 0.1, z: -990, scale: 16 },
            { x: 500, y: 0.1, z: -940, scale: 14 },
            { x: 500, y: 0.1, z: -890, scale: 14 },
            { x: 500, y: 0.1, z: -840, scale: 14 },
            { x: 500, y: 0.1, z: -800, scale: 14 },
            { x: 500, y: 0.1, z: -770, scale: 14 },
            { x: 500, y: 0.1, z: -730, scale: 14 },
            { x: 500, y: 0.1, z: -700, scale: 14 },
            // Bridge Serial 
            { x: 620, y: 0.1, z: 550, scale: 15 },
            { x: 620, y: 0.1, z: 580, scale: 15 },
            { x: 620, y: 0.1, z: 610, scale: 15 },
            { x: 620, y: 0.1, z: 640, scale: 15 },
            { x: 620, y: 0.1, z: 670, scale: 15 },
            { x: 620, y: 0.1, z: 700, scale: 15 },
            { x: 620, y: 0.1, z: 730, scale: 15 },
            { x: 620, y: 0.1, z: 760, scale: 15 },
            { x: 620, y: 0.1, z: 790, scale: 15 },
            { x: 620, y: 0.1, z: 820, scale: 15 },
            { x: 620, y: 0.1, z: 850, scale: 15 },
            { x: 620, y: 0.1, z: 880, scale: 15 },
            { x: 620, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 600, y: 0.1, z: 550, scale: 15 },
            { x: 600, y: 0.1, z: 580, scale: 15 },
            { x: 600, y: 0.1, z: 610, scale: 15 },
            { x: 600, y: 0.1, z: 640, scale: 15 },
            { x: 600, y: 0.1, z: 670, scale: 15 },
            { x: 600, y: 0.1, z: 700, scale: 15 },
            { x: 600, y: 0.1, z: 730, scale: 15 },
            { x: 600, y: 0.1, z: 760, scale: 15 },
            { x: 600, y: 0.1, z: 790, scale: 15 },
            { x: 600, y: 0.1, z: 820, scale: 15 },
            { x: 600, y: 0.1, z: 850, scale: 15 },
            { x: 600, y: 0.1, z: 880, scale: 15 },
            { x: 600, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 580, y: 0.1, z: 550, scale: 15 },
            { x: 580, y: 0.1, z: 580, scale: 15 },
            { x: 580, y: 0.1, z: 610, scale: 15 },
            { x: 580, y: 0.1, z: 640, scale: 15 },
            { x: 580, y: 0.1, z: 670, scale: 15 },
            { x: 580, y: 0.1, z: 700, scale: 15 },
            { x: 580, y: 0.1, z: 730, scale: 15 },
            { x: 580, y: 0.1, z: 760, scale: 15 },
            { x: 580, y: 0.1, z: 790, scale: 15 },
            { x: 580, y: 0.1, z: 820, scale: 15 },
            { x: 580, y: 0.1, z: 850, scale: 15 },
            { x: 580, y: 0.1, z: 880, scale: 15 },
            { x: 580, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 560, y: 0.1, z: 550, scale: 15 },
            { x: 560, y: 0.1, z: 580, scale: 15 },
            { x: 560, y: 0.1, z: 610, scale: 15 },
            { x: 560, y: 0.1, z: 640, scale: 15 },
            { x: 560, y: 0.1, z: 670, scale: 15 },
            { x: 560, y: 0.1, z: 700, scale: 15 },
            { x: 560, y: 0.1, z: 730, scale: 15 },
            { x: 560, y: 0.1, z: 760, scale: 15 },
            { x: 560, y: 0.1, z: 790, scale: 15 },
            { x: 560, y: 0.1, z: 820, scale: 15 },
            { x: 560, y: 0.1, z: 850, scale: 15 },
            { x: 560, y: 0.1, z: 880, scale: 15 },
            { x: 560, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 540, y: 0.1, z: 550, scale: 15 },
            { x: 540, y: 0.1, z: 580, scale: 15 },
            { x: 540, y: 0.1, z: 610, scale: 15 },
            { x: 540, y: 0.1, z: 640, scale: 15 },
            { x: 540, y: 0.1, z: 670, scale: 15 },
            { x: 540, y: 0.1, z: 700, scale: 15 },
            { x: 540, y: 0.1, z: 730, scale: 15 },
            { x: 540, y: 0.1, z: 760, scale: 15 },
            { x: 540, y: 0.1, z: 790, scale: 15 },
            { x: 540, y: 0.1, z: 820, scale: 15 },
            { x: 540, y: 0.1, z: 850, scale: 15 },
            { x: 540, y: 0.1, z: 880, scale: 15 },
            { x: 540, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 520, y: 0.1, z: 550, scale: 15 },
            { x: 520, y: 0.1, z: 580, scale: 15 },
            { x: 520, y: 0.1, z: 610, scale: 15 },
            { x: 520, y: 0.1, z: 640, scale: 15 },
            { x: 520, y: 0.1, z: 670, scale: 15 },
            { x: 520, y: 0.1, z: 700, scale: 15 },
            { x: 520, y: 0.1, z: 730, scale: 15 },
            { x: 520, y: 0.1, z: 760, scale: 15 },
            { x: 520, y: 0.1, z: 790, scale: 15 },
            { x: 520, y: 0.1, z: 820, scale: 15 },
            { x: 520, y: 0.1, z: 850, scale: 15 },
            { x: 520, y: 0.1, z: 880, scale: 15 },
            { x: 520, y: 0.1, z: 910, scale: 15 },
            // Bridge Serial 
            { x: 500, y: 0.1, z: 550, scale: 15 },
            { x: 500, y: 0.1, z: 580, scale: 15 },
            { x: 500, y: 0.1, z: 610, scale: 15 },
            { x: 500, y: 0.1, z: 640, scale: 15 },
            { x: 500, y: 0.1, z: 670, scale: 15 },
            { x: 500, y: 0.1, z: 700, scale: 15 },
            { x: 500, y: 0.1, z: 730, scale: 15 },
            { x: 500, y: 0.1, z: 760, scale: 15 },
            { x: 500, y: 0.1, z: 790, scale: 15 },
            { x: 500, y: 0.1, z: 820, scale: 15 },
            { x: 500, y: 0.1, z: 850, scale: 15 },
            { x: 500, y: 0.1, z: 880, scale: 15 },
            { x: 500, y: 0.1, z: 910, scale: 15 },
            { x: 500, y: 0.1, z: 940, scale: 15 },
            // Bridge Serial 
            { x: 480, y: 0.1, z: 550, scale: 15 },
            { x: 480, y: 0.1, z: 580, scale: 15 },
            { x: 480, y: 0.1, z: 610, scale: 15 },
            { x: 480, y: 0.1, z: 640, scale: 15 },
            { x: 480, y: 0.1, z: 670, scale: 15 },
            { x: 480, y: 0.1, z: 700, scale: 15 },
            { x: 480, y: 0.1, z: 730, scale: 15 },
            { x: 480, y: 0.1, z: 760, scale: 15 },
            { x: 480, y: 0.1, z: 790, scale: 15 },
            { x: 480, y: 0.1, z: 820, scale: 15 },
            { x: 480, y: 0.1, z: 850, scale: 15 },
            { x: 480, y: 0.1, z: 880, scale: 15 },
            { x: 480, y: 0.1, z: 910, scale: 15 },
            { x: 480, y: 0.1, z: 940, scale: 15 },
            // Bridge Serial 
            { x: 460, y: 0.1, z: 550, scale: 15 },
            { x: 460, y: 0.1, z: 580, scale: 15 },
            { x: 460, y: 0.1, z: 610, scale: 15 },
            { x: 460, y: 0.1, z: 640, scale: 15 },
            { x: 460, y: 0.1, z: 670, scale: 15 },
            { x: 460, y: 0.1, z: 700, scale: 15 },
            { x: 460, y: 0.1, z: 730, scale: 15 },
            { x: 460, y: 0.1, z: 760, scale: 15 },
            { x: 460, y: 0.1, z: 790, scale: 15 },
            { x: 460, y: 0.1, z: 820, scale: 15 },
            { x: 460, y: 0.1, z: 850, scale: 15 },
            { x: 460, y: 0.1, z: 880, scale: 15 },
            { x: 460, y: 0.1, z: 910, scale: 15 },
            { x: 460, y: 0.1, z: 940, scale: 15 },
            // Bridge Serial 
            { x: 440, y: 0.1, z: 550, scale: 15 },
            { x: 440, y: 0.1, z: 580, scale: 15 },
            { x: 440, y: 0.1, z: 610, scale: 15 },
            { x: 440, y: 0.1, z: 640, scale: 15 },
            { x: 440, y: 0.1, z: 670, scale: 15 },
            { x: 440, y: 0.1, z: 700, scale: 15 },
            { x: 440, y: 0.1, z: 730, scale: 15 },
            { x: 440, y: 0.1, z: 760, scale: 15 },
            { x: 440, y: 0.1, z: 790, scale: 15 },
            { x: 440, y: 0.1, z: 820, scale: 15 },
            { x: 440, y: 0.1, z: 850, scale: 15 },
            { x: 440, y: 0.1, z: 880, scale: 15 },
            { x: 440, y: 0.1, z: 910, scale: 15 },
            { x: 440, y: 0.1, z: 940, scale: 15 },
            // --------------------------curve path
            { x: 420, y: 0.1, z: 730, scale: 15 },
            { x: 420, y: 0.1, z: 760, scale: 15 },
            { x: 420, y: 0.1, z: 790, scale: 15 },
            { x: 420, y: 0.1, z: 820, scale: 15 },
            { x: 420, y: 0.1, z: 850, scale: 15 },
            { x: 420, y: 0.1, z: 880, scale: 15 },
            { x: 420, y: 0.1, z: 910, scale: 15 },
            { x: 420, y: 0.1, z: 940, scale: 15 },
            // --------------------------curve path
            { x: 400, y: 0.1, z: 730, scale: 15 },
            { x: 400, y: 0.1, z: 760, scale: 15 },
            { x: 400, y: 0.1, z: 790, scale: 15 },
            { x: 400, y: 0.1, z: 820, scale: 15 },
            { x: 400, y: 0.1, z: 850, scale: 15 },
            { x: 400, y: 0.1, z: 880, scale: 15 },
            { x: 400, y: 0.1, z: 910, scale: 15 },
            { x: 400, y: 0.1, z: 940, scale: 15 },
            // --------------------------curve path
            { x: 380, y: 0.1, z: 730, scale: 15 },
            { x: 380, y: 0.1, z: 760, scale: 15 },
            { x: 380, y: 0.1, z: 790, scale: 15 },
            { x: 380, y: 0.1, z: 820, scale: 15 },
            { x: 380, y: 0.1, z: 850, scale: 15 },
            { x: 380, y: 0.1, z: 880, scale: 15 },
            { x: 380, y: 0.1, z: 910, scale: 15 },
            { x: 380, y: 0.1, z: 940, scale: 15 },
            // --------------------------curve path
            { x: 360, y: 0.1, z: 730, scale: 15 },
            { x: 360, y: 0.1, z: 760, scale: 15 },
            { x: 360, y: 0.1, z: 790, scale: 15 },
            { x: 360, y: 0.1, z: 820, scale: 15 },
            { x: 360, y: 0.1, z: 850, scale: 15 },
            { x: 360, y: 0.1, z: 880, scale: 15 },
            { x: 360, y: 0.1, z: 910, scale: 15 },
            { x: 360, y: 0.1, z: 940, scale: 15 },
            // --------------------------curve path
            { x: 340, y: 0.1, z: 730, scale: 15 },
            { x: 340, y: 0.1, z: 760, scale: 15 },
            { x: 340, y: 0.1, z: 790, scale: 15 },
            { x: 340, y: 0.1, z: 820, scale: 15 },
            { x: 340, y: 0.1, z: 850, scale: 15 },
            { x: 340, y: 0.1, z: 880, scale: 15 },
            { x: 340, y: 0.1, z: 910, scale: 15 },
            // --------------------------curve path
            { x: 320, y: 0.1, z: 730, scale: 15 },
            { x: 320, y: 0.1, z: 760, scale: 15 },
            { x: 320, y: 0.1, z: 790, scale: 15 },
            { x: 320, y: 0.1, z: 820, scale: 15 },
            { x: 320, y: 0.1, z: 850, scale: 15 },
            { x: 320, y: 0.1, z: 880, scale: 15 },
            { x: 320, y: 0.1, z: 910, scale: 15 },
            // --------------------------curve path
            { x: 300, y: 0.1, z: 730, scale: 15 },
            { x: 300, y: 0.1, z: 760, scale: 15 },
            { x: 300, y: 0.1, z: 790, scale: 15 },
            { x: 300, y: 0.1, z: 820, scale: 15 },
            { x: 300, y: 0.1, z: 850, scale: 15 },
            { x: 300, y: 0.1, z: 880, scale: 15 },
            { x: 300, y: 0.1, z: 910, scale: 15 },
            // --------------------------curve path
            { x: 280, y: 0.1, z: 730, scale: 15 },
            { x: 280, y: 0.1, z: 760, scale: 15 },
            { x: 280, y: 0.1, z: 790, scale: 15 },
            { x: 280, y: 0.1, z: 820, scale: 15 },
            { x: 280, y: 0.1, z: 850, scale: 15 },
            { x: 280, y: 0.1, z: 880, scale: 15 },
            // --------------------------curve path
            { x: 260, y: 0.1, z: 730, scale: 15 },
            { x: 260, y: 0.1, z: 760, scale: 15 },
            { x: 260, y: 0.1, z: 790, scale: 15 },
            { x: 260, y: 0.1, z: 820, scale: 15 },
            { x: 260, y: 0.1, z: 850, scale: 15 },
            { x: 260, y: 0.1, z: 880, scale: 15 },
            // --------------------------curve path
            { x: 240, y: 0.1, z: 730, scale: 15 },
            { x: 240, y: 0.1, z: 760, scale: 15 },
            { x: 240, y: 0.1, z: 790, scale: 15 },
            { x: 240, y: 0.1, z: 820, scale: 15 },
            { x: 240, y: 0.1, z: 850, scale: 15 },
            // --------------------------curve path
            { x: 220, y: 0.1, z: 730, scale: 15 },
            { x: 220, y: 0.1, z: 760, scale: 15 },
            { x: 220, y: 0.1, z: 790, scale: 15 },
            { x: 220, y: 0.1, z: 820, scale: 15 },
            // --------------------------curve path
            { x: 200, y: 0.1, z: 730, scale: 15 },
            { x: 200, y: 0.1, z: 760, scale: 15 },
            { x: 200, y: 0.1, z: 790, scale: 15 },
            { x: 200, y: 0.1, z: 820, scale: 15 },
            // --------------------------curve path
            { x: 180, y: 0.1, z: 730, scale: 15 },
            { x: 180, y: 0.1, z: 760, scale: 15 },
            { x: 180, y: 0.1, z: 790, scale: 15 },
            // --------------------------curve path
            { x: 200, y: 0.1, z: 710, scale: 15 },
            { x: 220, y: 0.1, z: 710, scale: 15 },
            { x: 240, y: 0.1, z: 710, scale: 15 },
            { x: 260, y: 0.1, z: 710, scale: 15 },




        ];


        // --- RESOURCE CACHE FOR OPTIMIZED PERFORMANCE ---
        const geometryCache = {};
        const materialCache = {};
        const houseMeshCache = new Map();

        function getSharedGeometry(key, factory) {
            if (!geometryCache[key]) geometryCache[key] = factory();
            return geometryCache[key];
        }

        function getSharedMaterial(key, factory) {
            if (!materialCache[key]) materialCache[key] = factory();
            return materialCache[key];
        }

        /**
         * Helper to finalize srv2-style procedural objects (from park.html)
         */
        function srv2_finalizeMesh(group, parent, config) {
            const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, scale = 1, shadow = true } = config;
            group.position.set(x, y, z);
            group.rotation.set(rx, ry, rz);
            group.scale.setScalar(scale);
            group.updateMatrix();
            group.matrixAutoUpdate = false;
            if (shadow) {
                group.traverse(c => { 
                    if (c.isMesh) { 
                        c.castShadow = true; 
                        c.receiveShadow = true; 
                        c.updateMatrix();
                        c.matrixAutoUpdate = false;
                    } 
                });
            }
            if (parent) parent.add(group);
            return group;
        }

        /**
         * Robustly disposes of any Three.js object and its children
         */
        function disposeObject(obj) {
            if (!obj) return;

            obj.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) {
                        if (Array.isArray(node.material)) {
                            node.material.forEach(m => m.dispose());
                        } else {
                            node.material.dispose();
                        }
                    }
                }
            });

            if (obj.parent) obj.parent.remove(obj);
        }

        // --- Fog Reveal Animation Variables ---

        // --- Performance Optimization: Animation Lists ---
        const breathingObjects = [];



        class CartoonRiver {
            constructor(scene, config) {
                this.scene = scene;
                this.points = config.points || [];
                this.width = config.width || 10;
                this.thickness = config.thickness || 0.8;
                this.color = config.color || 0x187C19;

                // New position and rotation configuration
                this.position = config.position || { x: 0, y: 0.2, z: 0 };
                this.rotation = config.rotation || { x: 0, y: 0, z: 0 };

                this.mesh = null;
                this.material = null;

                this.init();
            }

            init() {
                // Create the smooth curve path
                const curve = new THREE.CatmullRomCurve3(this.points);
                curve.curveType = 'catmullrom';
                curve.tension = 0.5;

                // Tube radius is half the width
                const radius = this.width / 2;

                // Create the geometry
                const tubeGeo = new THREE.TubeGeometry(curve, 100, radius, 8, false);

                // Apply thickness by scaling the Y axis
                const yScale = this.thickness / this.width;
                tubeGeo.scale(1, yScale, 1);

                this.material = new THREE.MeshPhongMaterial({
                    color: this.color,
                    transparent: true,
                    opacity: 0.9,
                    shininess: 120
                });

                this.mesh = new THREE.Mesh(tubeGeo, this.material);
                this.mesh.receiveShadow = true;

                // Apply coordinates and rotation
                this.mesh.position.set(this.position.x, this.position.y, this.position.z);
                this.mesh.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);

                if (this.scene) this.scene.add(this.mesh);
            }

            update(time) {
                if (this.material) {
                    // Gentle pulse effect for water movement
                    this.material.opacity = 0.85 + Math.sin(time * 0.0015) * 0.05;
                }
            }
        }
        // Configuration from road.html
        const ROAD_CONFIGS = [
            // WESTERN LINK HOUSE (MERGED - SMOOTHED)
            {
                width: 12,
                points: [
                    new THREE.Vector3(250, 0, 260),
                    new THREE.Vector3(250, 0, 200),
                    new THREE.Vector3(245, 0, 195), // Bevel Corner 1
                    new THREE.Vector3(230, 0, 185), // Bevel Corner 1
                    new THREE.Vector3(125, 0, 180), // Middle stretch
                    new THREE.Vector3(20, 0, 175),  // Bevel Corner 2
                    new THREE.Vector3(5, 0, 165),   // Bevel Corner 2
                    new THREE.Vector3(0, 0, 150),
                    new THREE.Vector3(0, 0, 0),
                ],
                segments: 800, // Balanced for performance/quality
                position: { x: -630, y: 0, z: 116 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // Zone A Path
            {
                width: 0,
                points: [
                    new THREE.Vector3(22, 0, 170),
                    new THREE.Vector3(-30, 0, 90),
                    new THREE.Vector3(0, 0, 0),
                ],
                segments: 600, // Balanced for perfomance/quality
                position: { x: 325, y: 0, z: 320 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // Zone B Path
            {
                width: 0,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(-2, 0, 0),
                    new THREE.Vector3(10, 0, 100),
                    new THREE.Vector3(10, 0, 250),
                    new THREE.Vector3(-80, 0, 390),
                    new THREE.Vector3(-108, 0, 450),
                    new THREE.Vector3(-95, 0, 475),
                    new THREE.Vector3(-82, 0, 525),
                    new THREE.Vector3(-82, 0, 620),
                    // new THREE.Vector3(-130, 0, 630),
                ],
                segments: 600,
                position: { x: 405, y: 0, z: -300 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // Zone C Path (width 0 — path only for house layout, no visible center road)
            {
                width: 0,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -1),
                    new THREE.Vector3(13, 0, 50),
                    new THREE.Vector3(36, 0, 150),
                    new THREE.Vector3(62, 0, 350),
                    new THREE.Vector3(62, 0, 430),
                    new THREE.Vector3(58, 0, 430),
                    new THREE.Vector3(53, 0, 450),
                ],
                segments: 600,
                position: { x: -25, y: 0, z: -480 },
                rotation: { x: 0, y: -11.5, z: 0 },
                skipLamps: true
            },
            // Zone D Path (width 0 — path only for house layout, no visible center road)
            {
                width: 0,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(5, 0, 10),
                    new THREE.Vector3(13, 0, 50),
                    new THREE.Vector3(78, 0, 330),
                    new THREE.Vector3(78, 0, 330),
                ],
                segments: 600,
                position: { x: -380, y: 0, z: -585 },
                rotation: { x: 0, y: -11.5, z: 0 },
                skipLamps: true
            },
            // Zone B Path
            // {
            //     width: 0,
            //     points: [
            //         new THREE.Vector3(250, 0, 260),
            //         new THREE.Vector3(250, 0, 200),
            //         new THREE.Vector3(250, 0, 186),
            //         new THREE.Vector3(220, 0, 136),
            //         new THREE.Vector3(0, 0, 126),
            //         new THREE.Vector3(0, 0, 118),
            //         new THREE.Vector3(0, 0, 0),
            //     ],
            //     segments: 800, // Balanced for perfomance/quality
            //     position: { x: -630, y: 0, z: 75 },
            //     rotation: { x: 0, y: 50, z: 0 },
            //     skipLamps: true
            // },
            // Lake Near Road
            {
                width: 10,
                points: [
                    new THREE.Vector3(430, 0, 940),
                    new THREE.Vector3(250, 0, 800),
                    new THREE.Vector3(250, 0, 795),
                    new THREE.Vector3(250, 0, 270),
                    // new THREE.Vector3(250, 0, 190),
                    // new THREE.Vector3(250, 0, 162),
                    // new THREE.Vector3(0, 0, 162),
                    // new THREE.Vector3(0, 0, 155),
                    // new THREE.Vector3(0, 0, -500),
                ],
                segments: 800, // Balanced for performance/quality
                position: { x: -640, y: 0, z: 100 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // River Near Road
            {
                width: 10,
                points: [
                    new THREE.Vector3(-15, 0, 200),
                    new THREE.Vector3(-100, 0, 80),
                    new THREE.Vector3(-75, 0, 0),
                    new THREE.Vector3(-75, 0, 0),
                    new THREE.Vector3(-85, 0, -120),
                    new THREE.Vector3(-100, 0, -200),
                    new THREE.Vector3(8, 0, -380),
                    new THREE.Vector3(0, 0, -595),
                    new THREE.Vector3(0, 0, -595),
                    new THREE.Vector3(0, 0, -620),
                    new THREE.Vector3(-750, 0, -880),
                ],
                segments: 800, // Balanced
                position: { x: 360, y: 0, z: 330 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // BIG Road
            {
                width: 10,
                points: [

                    new THREE.Vector3(-530, 0, 580),
                    new THREE.Vector3(-530, 0, 400),
                    new THREE.Vector3(-480, 0, 350),
                    new THREE.Vector3(-480, 0, 18),
                    new THREE.Vector3(-480, 0, 8),
                    new THREE.Vector3(-480, 0, 4),
                    new THREE.Vector3(-10, 0, 4),
                    new THREE.Vector3(0, 0, 4),
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -2000)
                ],
                segments: 500,
                position: { x: -34, y: 0, z: 428 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // NORTH SOUTH ROAD + RIVER CROSSING
            {
                width: 10,
                points: [
                    new THREE.Vector3(600, 0, 150),
                    new THREE.Vector3(10, 0, 150),
                    new THREE.Vector3(0, 0, 150),
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(-60, 0, -1060),
                    new THREE.Vector3(-60, 0, -1060),
                    new THREE.Vector3(720, 0, -800),
                    new THREE.Vector3(780, 0, -650),
                    new THREE.Vector3(788, 0, -500),
                    new THREE.Vector3(775, 0, -450),
                    new THREE.Vector3(745, 0, -400),
                    new THREE.Vector3(710, 0, -350),
                    new THREE.Vector3(678, 0, -300),
                    new THREE.Vector3(668, 0, -280),
                    new THREE.Vector3(685, 0, -240),
                    new THREE.Vector3(690, 0, -200),
                    new THREE.Vector3(690, 0, -180),
                    new THREE.Vector3(690, 0, -100),
                    new THREE.Vector3(670, 0, -10),
                    new THREE.Vector3(740, 0, 65),
                ],
                segments: 500,
                position: { x: -334, y: 0, z: 427 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // ROAD #3 & NORTH SOUTH ROAD
            {
                width: 10,
                points: [
                    new THREE.Vector3(-170, 0, 150),
                    new THREE.Vector3(-10, 0, 150),
                    new THREE.Vector3(0, 0, 150),
                    new THREE.Vector3(0, 0, 0),
                ],
                segments: 500,
                position: { x: -334, y: 0, z: 577 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // Lake Breeze Road
            {
                width: 10,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -255)
                ],
                segments: 500,
                position: { x: -634, y: 0, z: 326 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // Small Road to connect House
            // BUnch Road (1 - 6)
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 380)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: -3 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 332)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: 50 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 300)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: 105 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 297)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: 160 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 308)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: 215 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 316)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: 270 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // BLOCK A ROAD START
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 254)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: -220 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 258)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: -358 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 298)
                ],
                segments: 500,
                position: { x: -30, y: 0, z: -289 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // BLOCK B ROAD START
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 340)
                ],
                segments: 500,
                position: { x: -378, y: 0, z: -427 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 335)
                ],
                segments: 500,
                position: { x: -374, y: 0, z: -358 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 331)
                ],
                segments: 500,
                position: { x: -370, y: 0, z: -289 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 332)
                ],
                segments: 500,
                position: { x: -370, y: 0, z: -220 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // Cluster Road Start - (1-7)
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 310)
                ],
                segments: 500,
                position: { x: -350, y: 0, z: -3 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 312)
                ],
                segments: 500,
                position: { x: -350, y: 0, z: 45 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 312)
                ],
                segments: 500,
                position: { x: -350, y: 0, z: 95 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 307)
                ],
                segments: 500,
                position: { x: -345, y: 0, z: 140 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 302)
                ],
                segments: 500,
                position: { x: -340, y: 0, z: 185 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 302)
                ],
                segments: 500,
                position: { x: -340, y: 0, z: 229 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 300)
                ],
                segments: 500,
                position: { x: -338, y: 0, z: 275 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 920)
                ],
                segments: 500,
                position: { x: -630, y: 0, z: 324 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // Cluster road 8-10
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 292)
                ],
                segments: 500,
                position: { x: -630, y: 0, z: 182 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 292)
                ],
                segments: 500,
                position: { x: -630, y: 0, z: 229 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 292)
                ],
                segments: 500,
                position: { x: -630, y: 0, z: 275 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // Empty Land Road
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 292)
                ],
                segments: 500,
                position: { x: -330, y: 0, z: 375 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            {
                width: 4,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 100)
                ],
                segments: 500,
                position: { x: -175, y: 0, z: 328 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            {
                width: 12,
                points: [
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, -2600)
                ],
                segments: 500,
                position: { x: -550, y: 0, z: -2820 },
                rotation: { x: 0, y: 0, z: 0 },
                skipLamps: true
            },
            // DHAKA ARICHA HIGHWAY 
            {
                width: 10,
                points: [
                    new THREE.Vector3(0, 0, -422),
                    new THREE.Vector3(-50, 0, 0),
                    new THREE.Vector3(0, 0, 980)
                ],
                segments: 500,
                position: { x: -330, y: 0, z: 995 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
            // DHAKA ARICHA HIGHWAY 
            {
                width: 10,
                points: [
                    new THREE.Vector3(20, 0, -422),
                    new THREE.Vector3(-50, 0, 0),
                    new THREE.Vector3(50, 0, 980)
                ],
                segments: 500,
                position: { x: -330, y: 0, z: 990 },
                rotation: { x: 0, y: -11, z: 0 },
                skipLamps: true
            },
        ];

        // Lamp Post Serial
        const CUSTOM_LAMPS = [
            // { x: -50, y: 0, z: 400, rx: 0, ry: Math.PI / 2, rz: 0 },
            // { x: 50, y: 0, z: 400, rx: 0, ry: -Math.PI / 2, rz: 0 },
            // { x: -50, y: 0, z: 200, rx: 0, ry: Math.PI / 2, rz: 0 },
            // { x: 50, y: 0, z: 200, rx: 0, ry: -Math.PI / 2, rz: 0 },
            // { x: -50, y: 0, z: 0, rx: 0, ry: Math.PI / 2, rz: 0 },
            // { x: 50, y: 0, z: 0, rx: 0, ry: -Math.PI / 2, rz: 0 },
        ];


        // Small River (Lake) Configuration
        const SR_LAKE_CONFIG = {
            width: 15,
            segments: 300,
            treeCount: 30,
            position: { x: 350, y: 0.1, z: 957 },
            rotation: { x: 0, y: 0, z: 0 },
            points: [
                new THREE.Vector3(-670, 0, -240),
                new THREE.Vector3(-630, 0, -200),
                new THREE.Vector3(-590, 0, -300),
                new THREE.Vector3(-490, 0, -200),
                new THREE.Vector3(-390, 0, -300),
                new THREE.Vector3(-280, 0, -250),
                new THREE.Vector3(-200, 0, -320),
                new THREE.Vector3(-160, 0, -304),
                new THREE.Vector3(-150, 0, -304),
                new THREE.Vector3(-150, 0, -300),
                new THREE.Vector3(-200, 0, -200),
                new THREE.Vector3(-100, 0, -60),
                new THREE.Vector3(0, 0, 0),
            ]
        };
        const SR_LAKE_CONFIG_BUNCH = {
            width: 15,
            segments: 300,
            treeCount: 10,
            position: { x: 420, y: 0.1, z: 700 }, // Lowered from 10
            rotation: { x: 0, y: 0, z: 0 },
            points: [
                new THREE.Vector3(0, 0, -220),
                new THREE.Vector3(-150, 0, -100),
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(-217, 0, -35),
            ]
        };
        const SR_LAKE_CONFIG_MAIN_RIVER = {
            width: 80,
            segments: 400,
            treeCount: 10,
            position: { x: 620, y: 0.1, z: 400 }, // Lowered from 10
            rotation: { x: 0, y: Math.PI / 2, z: 0 },
            points: [
                // new THREE.Vector3(1400, 0, -1800),
                new THREE.Vector3(1180, 0, -1360),
                new THREE.Vector3(910, 0, -400),
                new THREE.Vector3(800, 0, -180),
                new THREE.Vector3(640, 0, -120),
                new THREE.Vector3(560, 0, -110),
                new THREE.Vector3(460, 0, -110),
                new THREE.Vector3(340, 0, -165),
                new THREE.Vector3(250, 0, -220),
                new THREE.Vector3(200, 0, -210),
                new THREE.Vector3(140, 0, -210),
                new THREE.Vector3(60, 0, -210),
                new THREE.Vector3(30, 0, -220),
                new THREE.Vector3(0, 0, -230),
                new THREE.Vector3(-40, 0, -195),
                new THREE.Vector3(-60, 0, -50),
                new THREE.Vector3(-70, 0, 30),
                // new THREE.Vector3(180, 0, -180),
                // new THREE.Vector3(100, 0, -180),
                // new THREE.Vector3(70, 0, -180),
                // new THREE.Vector3(-10, 0, -180),
                // new THREE.Vector3(-20, 0, -180),
                // new THREE.Vector3(-40, 0, -180),
                // new THREE.Vector3(0, 0, 0),
                // new THREE.Vector3(-20, 0, 4),
                // new THREE.Vector3(0, 0, 8),
            ]
        };
        const SR_LAKE_CONFIG_CENTER_LAKE = {
            width: 15,
            segments: 400,
            treeCount: 10,
            position: { x: -660, y: 0.1, z: 165 },
            rotation: { x: 0, y: Math.PI / 2, z: 0 },
            points: [

                // new THREE.Vector3(610, 0, 1100),
                // new THREE.Vector3(300, 0, 850),
                // new THREE.Vector3(300, 0, 684),
                // new THREE.Vector3(300, 0, 284),
                // new THREE.Vector3(300, 0, 204),
                // new THREE.Vector3(300, 0, 200),
                // new THREE.Vector3(200, 0, 200),
                new THREE.Vector3(450, 0, 1010),
                new THREE.Vector3(254, 0, 878),
                new THREE.Vector3(250, 0, 878),
                new THREE.Vector3(250, 0, 262),
                new THREE.Vector3(250, 0, 258),
                new THREE.Vector3(200, 0, 258),
                new THREE.Vector3(0, 0, 264),
                new THREE.Vector3(0, 0, 260),
                new THREE.Vector3(0, 0, 0),
            ]
        };



        // --- Global Optimization System ---
        function optimizeScene() {
            const startTime = performance.now();
            console.log("Starting Scene Optimization...");
            setLoaderProgress(72, 'Merging city geometry...');

            const meshGroups = new Map();
            const toRemove = [];

            scene.updateMatrixWorld(true);
            window.masterplanZones = {};

            function collect(node, insideNoOptimize = false, currentZone = null) {
                const skip = insideNoOptimize || node.userData.noOptimize || node.name === 'flag' || node.name === 'river' || node.isRiverMesh;
                const nodeZone = node.userData.zone || currentZone;

                if (node.isMesh && !skip) {
                    if (poolWaterGeometries.has(node.geometry)) {
                        // Keep animated pool water as individual meshes (instancing breaks wave shader)
                    } else {
                    const isTree = node.userData.isTree || (node.parent && node.parent.userData && node.parent.userData.isTree);
                    const treeType = node.userData.treeType || (node.parent && node.parent.userData && node.parent.userData.treeType) || 'standard';
                    const key = `${node.geometry.uuid}_${node.material.uuid}_${nodeZone || 'global'}_${isTree ? 'tree_' + treeType : 'obj'}`;
                    if (!meshGroups.has(key)) {
                        meshGroups.set(key, {
                            geo: node.geometry,
                            mat: node.material,
                            matrices: [],
                            originalMeshes: [],
                            castShadow: node.castShadow,
                            receiveShadow: node.receiveShadow,
                            zone: nodeZone,
                            isTree: isTree,
                            treeType: isTree ? treeType : null
                        });
                    }
                    const gData = meshGroups.get(key);
                    gData.matrices.push(node.matrixWorld.clone());
                    gData.originalMeshes.push(node);
                    toRemove.push(node);
                    }
                }

                if (node.children) {
                    const children = [...node.children];
                    for (let i = 0; i < children.length; i++) {
                        collect(children[i], skip, nodeZone);
                    }
                }
            }

            collect(scene);

            const keys = Array.from(meshGroups.keys());
            let currentKeyIndex = 0;
            let instanceCount = 0;
            let groupCount = 0;
            const successfullyInstanced = new Set();

            function processBatch() {
                try {
                    const batchStartTime = performance.now();
                    while (currentKeyIndex < keys.length && performance.now() - batchStartTime < PERF.optimizeBatchMs) {
                        const key = keys[currentKeyIndex++];
                        const data = meshGroups.get(key);
                        if (!data || !data.geo || !data.mat) continue;

                        const count = data.matrices.length;
                        if (count > 0) {
                            try {
                                const instMat = data.mat.clone();
                                const iMesh = new THREE.InstancedMesh(data.geo, instMat, count);
                                iMesh.castShadow = data.castShadow;
                                iMesh.receiveShadow = data.receiveShadow;
                                if (data.isTree) {
                                    iMesh.userData.isTree = true;
                                    iMesh.userData.treeType = data.treeType;
                                }
                                iMesh.name = data.isTree ? 'instancedTree_' + data.treeType : 'instancedObj';
                                
                                // Set position/rotation/scale for each instance
                                for (let i = 0; i < count; i++) {
                                    iMesh.setMatrixAt(i, data.matrices[i]);
                                }

                                iMesh.frustumCulled = false;

                                data.originalMeshes.forEach(m => {
                                    m.visible = false;
                                    successfullyInstanced.add(m);
                                });
                                if (instMat.userData && instMat.userData.isLeaf) {
                                    const oldOnBefore = instMat.onBeforeCompile;
                                    instMat.onBeforeCompile = (shader) => {
                                        if (oldOnBefore) oldOnBefore(shader);
                                        shader.uniforms.uTime = globalUniforms.uTime;
                                        shader.vertexShader = `
                                            uniform float uTime;
                                            ${shader.vertexShader}
                                        `.replace(
                                            '#include <begin_vertex>',
                                            `
                                            #include <begin_vertex>
                                            vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
                                            float wind = sin(worldPos.x * 0.1 + worldPos.z * 0.1 + uTime * 2.0) * 0.15;
                                            transformed.x += wind * (position.y * 0.5);
                                            transformed.y += wind * 0.2;
                                            `
                                        );
                                    };
                                }

                                if (instMat.transparent) {
                                    iMesh.renderOrder = 2;
                                }

                                iMesh.instanceMatrix.needsUpdate = true;
                                iMesh.matrixAutoUpdate = false; 
                                scene.add(iMesh);

                                instanceCount += count;
                                groupCount++;
                            } catch (innerErr) {
                                console.warn("Failed to instance group:", key, innerErr);
                            }
                        }
                    }

                    if (currentKeyIndex < keys.length) {
                        const pct = 72 + Math.floor((currentKeyIndex / keys.length) * 24);
                        setLoaderProgress(pct, 'Optimizing city meshes...');
                        requestAnimationFrame(processBatch);
                    } else {
                        finalizeOptimization();
                    }
                } catch (e) {
                    console.error("Optimization batch failed:", e);
                    finalizeOptimization();
                }
            }

            function finalizeOptimization() {
                try {
                    // Phase 1: Hide only meshes that were successfully replaced by instancing
                    for (let i = 0; i < toRemove.length; i++) {
                        if (successfullyInstanced.has(toRemove[i])) {
                            toRemove[i].visible = false;
                        }
                    }

                    houseMeshCache.clear();
                    if (typeof breathingObjects !== 'undefined') breathingObjects.length = 0;
                    window.isSceneOptimized = true;
                    setLoaderProgress(100, 'Ready');
                    console.log(`Optimization complete in ${Math.round(performance.now() - startTime)}ms.`);
                    requestRender();

                    if (window.onOptimizationComplete) window.onOptimizationComplete();
                } catch (e) {
                    console.error("Finalization failed:", e);
                    if (window.onOptimizationComplete) window.onOptimizationComplete();
                }
            }

            processBatch();
        }

        function initBase() {
            console.log("Initializing 3D Masterplan...");
            setLoaderProgress(8, 'Setting up scene...');
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87ceeb);
            flagObj = createFlag(scene, { x: 10, y: 0, z: -5 });

            // scene.fog = new THREE.Fog( 0xcccccc, 10, 15 );
            scene.fog = new THREE.FogExp2(0x87ceeb, INTRO.fogDensityStart);

            // Camera set to Masterplan View (default)
            camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 20000);
            camera.position.set(-20, 296, -118);
            camera.lookAt(-20, 184, -118);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(2000, 4000, 2000);
            directionalLight.castShadow = false;

            scene.add(directionalLight);

            renderer = new THREE.WebGLRenderer({
                antialias: false, // DISABLED: Saves ~30% GPU per frame
                logarithmicDepthBuffer: true, // RESTORED: Crucial to stop "blinking" (Z-fighting) on distant elements like pools and roads
                powerPreference: "high-performance"
            });
            renderer.shadowMap.enabled = false;
            renderer.sortObjects = true;
            document.body.appendChild(renderer.domElement);
            currentPixelRatio = getIdlePixelRatio();
            renderer.setPixelRatio(currentPixelRatio);
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderClock.getDelta();

            // Grid Helper
            // const grid = new THREE.GridHelper(1510, 80, 0x697565, 0x697565);
            // scene.add(grid);

            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.minDistance = 50;
            controls.maxDistance = 8000;
            controls.target.set(-20, 184, -118);
            setupMapControls();
            controls.update();

            // --- Update Debug Overlay on Change ---
            const camPosEl = document.getElementById('cam-pos');
            const camTargetEl = document.getElementById('cam-target');

            function updateCameraDebug() {
                const now = performance.now();
                if (now - lastDebugUpdate < PERF.debugThrottleMs) return;
                lastDebugUpdate = now;
                const pos = camera.position;
                const tar = controls.target;
                camPosEl.innerText = `Position: (${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)})`;
                camTargetEl.innerText = `Target: (${Math.round(tar.x)}, ${Math.round(tar.y)}, ${Math.round(tar.z)})`;
            }

            controls.addEventListener('change', updateCameraDebug);
            updateCameraDebug(); // Initial update
            // Ground Land
            // const ground = new THREE.PlaneGeometry(14000, 14000);
            // const groundMaterial = new THREE.MeshBasicMaterial({
            //     color: 0x187C19,
            //     side: THREE.DoubleSide,
            //     polygonOffset: true,
            //     polygonOffsetFactor: 10,
            //     polygonOffsetUnits: 10
            // });
            // const groundMesh = new THREE.Mesh(ground, groundMaterial);
            // groundMesh.rotation.x = -Math.PI / 2;
            // groundMesh.position.y = -0.1;
            // scene.add(groundMesh);

            // --- Enhanced Night Sky Setup ---
            nightSkyGroup = new THREE.Group();
            scene.add(nightSkyGroup);

            // 1. Enhanced Stars with Blinking
            const starCount = 1000; // Further reduced for performance
            const starGeometry = new THREE.BufferGeometry();
            const starPositions = new Float32Array(starCount * 3);
            const starSizes = new Float32Array(starCount);
            const starBlinkSpeeds = new Float32Array(starCount);

            for (let i = 0; i < starCount; i++) {
                const r = 4000 + Math.random() * 6000;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
                starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)) + 500;
                starPositions[i * 3 + 2] = r * Math.cos(phi);

                starSizes[i] = Math.random() * 35 + 5; // Larger stars for "expand large area"
                starBlinkSpeeds[i] = Math.random() * 2 + 0.5;
            }

            starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
            starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
            starGeometry.setAttribute('blinkSpeed', new THREE.BufferAttribute(starBlinkSpeeds, 1));

            // Star Texture with Glow
            const starCanvas = document.createElement('canvas');
            starCanvas.width = 128; starCanvas.height = 128;
            const sctx = starCanvas.getContext('2d');
            const sGrad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            sGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            sGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.6)');
            sGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
            sGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            sctx.fillStyle = sGrad;
            sctx.fillRect(0, 0, 128, 128);

            const starTexture = new THREE.CanvasTexture(starCanvas);

            const starMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uOpacity: { value: 0 },
                    uTexture: { value: starTexture }
                },
                vertexShader: `
                    attribute float size;
                    attribute float blinkSpeed;
                    varying float vBlink;
                    varying vec2 vUv;
                    uniform float uTime;
                    void main() {
                        vBlink = 0.7 + 0.3 * sin(uTime * blinkSpeed + position.x);
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (1000.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uTexture;
                    uniform float uOpacity;
                    varying float vBlink;
                    void main() {
                        vec4 tex = texture2D(uTexture, gl_PointCoord);
                        gl_FragColor = vec4(tex.rgb, tex.a * uOpacity * vBlink);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            stars = new THREE.Points(starGeometry, starMaterial);
            nightSkyGroup.add(stars);

            // 1.5. Night Clouds
            const cloudCount = 5; // Reduced cloud count for smoother rendering
            const cloudGroup = new THREE.Group();
            nightSkyGroup.add(cloudGroup);
            stars.userData.cloudGroup = cloudGroup;

            const cloudCanvas = document.createElement('canvas');
            cloudCanvas.width = 512; cloudCanvas.height = 512;
            const cctx = cloudCanvas.getContext('2d');
            const cGrad = cctx.createRadialGradient(256, 256, 0, 256, 256, 256);
            cGrad.addColorStop(0, 'rgba(100, 110, 140, 0.4)');
            cGrad.addColorStop(0.5, 'rgba(60, 70, 90, 0.1)');
            cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            cctx.fillStyle = cGrad;
            cctx.fillRect(0, 0, 512, 512);
            const cloudTexture = new THREE.CanvasTexture(cloudCanvas);

            for (let i = 0; i < cloudCount; i++) {
                const cloudMat = new THREE.SpriteMaterial({
                    map: cloudTexture,
                    transparent: true,
                    opacity: 0,
                    blending: THREE.NormalBlending
                });
                const cloud = new THREE.Sprite(cloudMat);
                const r = 4500 + Math.random() * 1000;
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.random() * Math.PI * 0.4; // Upper hemisphere
                cloud.position.set(
                    r * Math.sin(phi) * Math.cos(theta),
                    r * Math.cos(phi) + 1000,
                    r * Math.sin(phi) * Math.sin(theta)
                );
                cloud.scale.set(1500 + Math.random() * 2000, 800 + Math.random() * 1000, 1);
                cloudGroup.add(cloud);
            }


            // 2. Realistic Moon
            const moonGeo = new THREE.SphereGeometry(80, 32, 32);
            const moonMat = new THREE.MeshStandardMaterial({
                color: 0xeeffff,
                emissive: 0xeeffff,
                emissiveIntensity: 0,
                transparent: true,
                opacity: 0
            });
            moon = new THREE.Mesh(moonGeo, moonMat);
            moon.position.set(-1500, 1200, -2000);
            nightSkyGroup.add(moon);

            // Moon Glow (Sprite)
            const moonGlowCanvas = document.createElement('canvas');
            moonGlowCanvas.width = 256; moonGlowCanvas.height = 256;
            const mctx = moonGlowCanvas.getContext('2d');
            const grad = mctx.createRadialGradient(128, 128, 0, 128, 128, 128);
            grad.addColorStop(0, 'rgba(200, 230, 255, 0.6)');
            grad.addColorStop(0.5, 'rgba(100, 150, 255, 0.2)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            mctx.fillStyle = grad;
            mctx.fillRect(0, 0, 256, 256);

            const moonGlowMat = new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(moonGlowCanvas),
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending
            });
            const moonGlow = new THREE.Sprite(moonGlowMat);
            moonGlow.scale.set(600, 600, 1);
            moon.add(moonGlow);
            moon.userData.glow = moonGlow;


            // 
            // lakeObj = createCustomRoad(scene, {
            //     points: [
            //         new THREE.Vector3(-260, 0, 300),
            //         new THREE.Vector3(-50, 0, 300),
            //         new THREE.Vector3(-10, 0, 50),
            //         new THREE.Vector3(-10, 0, 10),
            //         new THREE.Vector3(300, 0, 22),
            //         new THREE.Vector3(650, 0, 25),
            //         new THREE.Vector3(1050, 0, -555),
            //     ],
            //     width: 20,
            //     thickness: 0.8,
            //     style: 'lake',
            //     position: { x: -450, y: 10.1, z: -160 },
            //     rotation: { x: 0, y: 0, z: 0 },
            // });



            // LAKE START FROM HERE
            // INITIALIZE THE RIVER CLASS WITH CUSTOM PARAMETERS
            // RIVER SYSTEM - A large flowing river at the edge of the city
            // RIVER SYSTEM - Centered at the Flag (10, 0, -5) with a high-quality "Z" curve
            // const riverPathPoints = [
            //     new THREE.Vector3(-600, 0, 150),
            //     new THREE.Vector3(-150, 0, 150),
            //     new THREE.Vector3(150, 0, -150),
            //     new THREE.Vector3(600, 0, -150)
            // ];

            // river = new RiverSystem(scene, riverPathPoints, {
            //     color: 0x00ccff,
            //     width: 40,
            //     thickness: 0.05, // Very flat to match the land surface
            //     position: { x: 10, y: 0.4, z: -5 }, // Centered exactly at the Flag
            //     rotation: { x: 0, y: 0, z: 0 }
            // });



            // 2. Snake Shape Curved Road with Depth
            // Curve ROAD START
            // createCustomRoad(scene, {
            //     points: [
            //         new THREE.Vector3(-12, 0, -10),     // Junction (start)
            //         new THREE.Vector3(28, 0, -10),      // Straighten out at end
            //         new THREE.Vector3(64, 0, -70),
            //         new THREE.Vector3(104, 0, -82),
            //         new THREE.Vector3(154, 0, -60),
            //         new THREE.Vector3(224, 0, -62),
            //         new THREE.Vector3(294, 0, -52),
            //         new THREE.Vector3(344, 0, -48),
            //         new THREE.Vector3(484, 0, -112),
            //     ],
            //     width: 10,
            //     thickness: 0.21, // Matches previous road
            //     style: 'dashed',
            //     position: { x: 276, y: 0.05, z: 195 }, // Slightly elevated to prevent z-fighting
            //     rotation: { x: 0, y: -11, z: 0 },
            // });




            const cityBlocks = new THREE.Group();
            scene.add(cityBlocks);

            const cityLandGeometry = new THREE.PlaneGeometry(1400, 3200);
            const cityLandMaterial = new THREE.MeshBasicMaterial({
                color: 0XAED652,
                polygonOffset: true,
                polygonOffsetFactor: 5,
                polygonOffsetUnits: 5
            });

            const cityLand = new THREE.Mesh(cityLandGeometry, cityLandMaterial);
            cityLand.rotation.x = -Math.PI / 2;
            cityLand.position.y = 0;
            cityLand.position.x = -50;
            cityLand.position.z = -300;
            cityLand.userData.noOptimize = true;

            cityBlocks.add(cityLand);


            const subGreenLand1 = new THREE.Group();
            subGreenLand1.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand1);

            const subGreenLand2 = new THREE.Group();
            subGreenLand2.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand2);

            const subGreenLand3 = new THREE.Group();
            subGreenLand3.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand3);

            const subGreenLand4 = new THREE.Group();
            subGreenLand4.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand4);

            const subGreenLand5 = new THREE.Group();
            subGreenLand5.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand5);

            const subGreenLand6 = new THREE.Group();
            subGreenLand6.position.set(0, 0, 5);
            cityBlocks.add(subGreenLand6);


            // Cluster 1
            const subGreenLandCL1 = new THREE.Group();
            subGreenLandCL1.position.set(-320, 0, 80);
            cityBlocks.add(subGreenLandCL1);
            // Cluster 2
            const subGreenLandCL2 = new THREE.Group();
            subGreenLandCL2.position.set(-320, 0, 31);
            cityBlocks.add(subGreenLandCL2);
            // Cluster 3
            const subGreenLandCL3 = new THREE.Group();
            subGreenLandCL3.position.set(-320, 0, -12);
            cityBlocks.add(subGreenLandCL3);
            // Cluster 4
            const subGreenLandCL4 = new THREE.Group();
            subGreenLandCL4.position.set(-320, 0, -55);
            cityBlocks.add(subGreenLandCL4);
            // Cluster 5
            const subGreenLandCL5 = new THREE.Group();
            subGreenLandCL5.position.set(-320, 0, -102);
            cityBlocks.add(subGreenLandCL5);
            // Cluster 6
            const subGreenLandCL6 = new THREE.Group();
            subGreenLandCL6.position.set(-320, 0, -151);
            cityBlocks.add(subGreenLandCL6);
            // Cluster 7
            const subGreenLandCL7 = new THREE.Group();
            subGreenLandCL7.position.set(-320, 0, -199);
            cityBlocks.add(subGreenLandCL7);
            // Cluster 8
            const subGreenLandCL8 = new THREE.Group();
            subGreenLandCL8.position.set(-620, 0, -12);
            cityBlocks.add(subGreenLandCL8);
            // Cluster 9
            const subGreenLandCL9 = new THREE.Group();
            subGreenLandCL9.position.set(-620, 0, 31);
            cityBlocks.add(subGreenLandCL9);
            // Cluster 10
            const subGreenLandCL10 = new THREE.Group();
            subGreenLandCL10.position.set(-620, 0, 80);
            cityBlocks.add(subGreenLandCL10);

            // Lake Near 
            const subGreenLandCL11 = new THREE.Group();
            subGreenLandCL11.position.set(-328, 0, -296);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL11);
            // Lake Near 
            const subGreenLandCL12 = new THREE.Group();
            subGreenLandCL12.position.set(-10, 0, -296);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL12);
            // Lake Near Horizontal
            const subGreenLandCL13 = new THREE.Group();
            subGreenLandCL13.position.set(-364, 0, -20);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL13);
            // Lake Near 
            const subGreenLandCL14 = new THREE.Group();
            subGreenLandCL14.position.set(-10, 0, -380);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL14);
            // Lake Near 
            const subGreenLandCL15 = new THREE.Group();
            subGreenLandCL15.position.set(-335, 0, -380);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL15);
            // Lake Near 
            const subGreenLandCL16 = new THREE.Group();
            subGreenLandCL16.position.set(-10, 0, -380);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL16);
            // Lake Near 
            const subGreenLandCL17 = new THREE.Group();
            subGreenLandCL17.position.set(-10, 0, -296);// Elevated to be above the lake surface
            cityBlocks.add(subGreenLandCL17);

            // BLOCK B -1
            const subGreenLandBB1 = new THREE.Group();
            subGreenLandBB1.position.set(-350, 0, -411);
            cityBlocks.add(subGreenLandBB1);

            // BLOCK B - 2 (Position adjusted for 2x size)
            const subGreenLandBB2 = new THREE.Group();
            subGreenLandBB2.position.set(-350, 0, -480);
            cityBlocks.add(subGreenLandBB2);
            // BLOCK B - 3
            const subGreenLandBB3 = new THREE.Group();
            subGreenLandBB3.position.set(-350, 0, -548);
            cityBlocks.add(subGreenLandBB3);
            // BLOCK B - 4
            const subGreenLandBB4 = new THREE.Group();
            subGreenLandBB4.position.set(-355, 0, -618);
            cityBlocks.add(subGreenLandBB4);

            // BLOCK A - 1
            const subGreenLandBA1 = new THREE.Group();
            subGreenLandBA1.position.set(-20, 0, -618);
            cityBlocks.add(subGreenLandBA1);
            // BLOCK A - 2
            const subGreenLandBA2 = new THREE.Group();
            subGreenLandBA2.position.set(-20, 0, -548);
            cityBlocks.add(subGreenLandBA2);
            // BLOCK A - 3
            const subGreenLandBA3 = new THREE.Group();
            subGreenLandBA3.position.set(-20, 0, -480);
            cityBlocks.add(subGreenLandBA3);
            // BLOCK A - 4
            const subGreenLandBA4 = new THREE.Group();
            subGreenLandBA4.position.set(-20, 0, -411);
            cityBlocks.add(subGreenLandBA4);

            cityBlocks.userData.lands = {
                subGreenLand1, subGreenLand2, subGreenLand3, subGreenLand4, subGreenLand5, subGreenLand6,
                subGreenLandCL1, subGreenLandCL2, subGreenLandCL3, subGreenLandCL4, subGreenLandCL5,
                subGreenLandCL6, subGreenLandCL7, subGreenLandCL8, subGreenLandCL9, subGreenLandCL10,
                subGreenLandCL11, subGreenLandCL12, subGreenLandCL13, subGreenLandCL14, subGreenLandCL15,
                subGreenLandCL16, subGreenLandCL17,
                subGreenLandBB1, subGreenLandBB2, subGreenLandBB3, subGreenLandBB4,
                subGreenLandBA1, subGreenLandBA2, subGreenLandBA3, subGreenLandBA4
            };
            window.__cityBlocks = cityBlocks;
        }

        function buildAllHouses(cityBlocks) {
            const L = cityBlocks.userData.lands;
            setLoaderProgress(18, 'Building city blocks...');
            createHouseBunch(L.subGreenLand6, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 30, startX: 0, startZ: 5, unitSpacing: 20, houseGap: 280, rowSpacing: 25, startId: 1, clusterName: "BUNCH-6", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseBunch(L.subGreenLand5, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 28, startX: 0, startZ: 60, unitSpacing: 20, houseGap: 280, rowSpacing: 25, startId: 2, clusterName: "BUNCH-5", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseBunch(L.subGreenLand4, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 24, startX: 0, startZ: 115, unitSpacing: 20, houseGap: 280, rowSpacing: 25, startId: 2, clusterName: "BUNCH-4", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseBunch(L.subGreenLand3, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 27, startX: 0, startZ: 170, unitSpacing: 20, houseGap: 280, rowSpacing: 25, startId: 2, clusterName: "BUNCH-3", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseBunch(L.subGreenLand2, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 28, startX: 0, startZ: 225, unitSpacing: 20, houseGap: 280, rowSpacing: 25, startId: 2, clusterName: "BUNCH-2", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseBunch(L.subGreenLand1, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 280, unitSpacing: 15.5, houseGap: 280, rowSpacing: 25, startId: 2, clusterName: "BUNCH-1", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            setLoaderProgress(32, 'Building clusters...');

            createHouseCluster(L.subGreenLandCL1, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 23, startId: 2, clusterName: "CLUSTER-1", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL2, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 20, startId: 2, clusterName: "CLUSTER-2", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL3, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 20, startId: 2, clusterName: "CLUSTER-3", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL4, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 20, startId: 2, clusterName: "CLUSTER-4", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL5, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 20, startId: 2, clusterName: "CLUSTER-5", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL6, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 22, startId: 2, clusterName: "CLUSTER-6", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL7, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 22, startId: 2, clusterName: "CLUSTER-7", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL8, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 15.4, houseGap: 280, rowSpacing: 22, startId: 2, clusterName: "CLUSTER-8", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL9, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 36, startX: 0, startZ: 210, unitSpacing: 15.5, houseGap: 280, rowSpacing: 22, startId: 2, clusterName: "CLUSTER-9", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            createHouseCluster(L.subGreenLandCL10, { houseOX: 150, houseOZ: 250, carOX: -460, carOZ: 100, serialCount: 34, startX: 0, startZ: 210, unitSpacing: 16, houseGap: 280, rowSpacing: 22, startId: 2, clusterName: "CLUSTER-10", houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90 });
            setLoaderProgress(42, 'Building block zones...');
            // BLOCK B -1
            createHouseCluster(L.subGreenLandBB1, {
                serialCount: 36, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK B - 1",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            // BLOCK B - 2
            createHouseCluster(L.subGreenLandBB2, {
                serialCount: 36, startX: 0, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK B - 2", hScale: 4,
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                houseOX: 80,
                houseOZ: 200,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hRotate: 90
            });
            // BLOCK B - 3
            createHouseCluster(L.subGreenLandBB3, {
                serialCount: 36, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK B - 3",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            // BLOCK B - 4
            createHouseCluster(L.subGreenLandBB4, {
                serialCount: 36, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK B - 4",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            addInterBlockRoads([L.subGreenLandBB1, L.subGreenLandBB2, L.subGreenLandBB3, L.subGreenLandBB4]);
            // BLOCK A - 1
            // createHouseCluster(L.subGreenLandBA1, {
            //     serialCount: 10, startX: 0, startZ: 210, unitSpacing: 8.9, houseGap: 10, rowSpacing: 16, startId: 2,
            //     clusterName: "BLOCK A - 1", hScale: 2,
            //     innerGapScale: { x: 0.53, y: .8 },
            //     outerGapScale: 0.5
            // });
            // BLOCK A - 2
            createHouseCluster(L.subGreenLandBA2, {
                serialCount: 22, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK A - 2",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            setLoaderProgress(52, 'Building premium blocks...');
            // BLOCK A - 3
            createHouseCluster(L.subGreenLandBA3, {
                serialCount: 30, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK A - 3",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            // BLOCK A - 4
            createHouseCluster(L.subGreenLandBA4, {
                serialCount: 20, startX: 3, startZ: 210, unitSpacing: 17.5, houseGap: 210, rowSpacing: 32, startId: 2,
                clusterName: "BLOCK A - 4",
                innerGapScale: { x: 1.25, y: 1.8 },
                outerGapScale: 0.8,
                carOX: 160, carOZ: 200,
                hasCarParking: true,
                poolOX: -270,
                poolOZ: -250,
                hasPool: false, houseDesign: 'custom', houseOX: 80, houseOZ: 310, hScale: 4, hRotate: 90
            });
            addInterBlockRoads([L.subGreenLandBA4, L.subGreenLandBA3, L.subGreenLandBA2]);
            setLoaderProgress(58, 'Building lake-side estates...');

            createHouseCluster(L.subGreenLandCL11, {
                innerGapScale: { x: 1, y: .9 },
                outerGapScale: 1.5,
                serialCount: 8,
                startX: 0,
                startZ: 262,
                unitSpacing: 38,
                houseGap: 300,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 140,
                poolOX: -550,
                poolOZ: -1050,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                houseDesign: 'customV2',
                hScale: 7,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
                carW: 200,
                carL: 460
            });
            createHouseCluster(L.subGreenLandCL12, {
                innerGapScale: { x: 1, y: .9 },
                outerGapScale: 1.5,
                serialCount: 8,
                startX: 0,
                startZ: 262,
                unitSpacing: 38,
                houseGap: 300,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 20,
                poolOX: -550,
                poolOZ: -1050,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                carW: 200,
                carL: 460,
                houseDesign: 'customV2',
                hScale: 7,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
            });
            createHouseCluster(L.subGreenLandCL13, {
                serialCount: 12,
                startX: 0,
                startZ: 190,
                unitSpacing: 21,
                houseGap: 300,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 550,
                hWidth: 320,
                basePlotW: 1200,
                basePlotD: 1400,
                hasWing: false,
                hFloorH: 20,
                houseOX: 200,
                houseOZ: 300,
                poolOX: -250,
                poolOZ: -150,
                carOX: -150,
                carOZ: 100,
                playOX: -270,
                playOZ: 200,
                carW: 100,
                carL: 260,
                hRotate: 0,
                houseDesign: 'custom',
                hScale: 4,
                AreaRotation: 93,
                houseOX: 80, houseOZ: 500,
            });
            createHouseCluster(L.subGreenLandCL14, {
                innerGapScale: { x: 1, y: .5 },
                outerGapScale: 1.5,
                serialCount: 5,
                startX: 0,
                startZ: 262,
                unitSpacing: 38, // Increased for much larger houses
                houseGap: 340,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 140,
                houseOX: 200,
                houseOZ: 500,
                poolOX: -570,
                poolOZ: -750,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                carW: 200,
                carL: 460,
                rotation: 180,
                houseDesign: 'customV2',
                hScale: 7,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
            });
            createHouseCluster(L.subGreenLandCL15, {
                innerGapScale: { x: 1, y: .5 },
                outerGapScale: 1.5,
                serialCount: 7,
                startX: 0,
                startZ: 262,
                unitSpacing: 45,
                houseGap: 340,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 40,
                houseOX: 200,
                houseOZ: 500,
                poolOX: -570,
                poolOZ: -750,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                carW: 200,
                carL: 460,
                rotation: 180,
                houseDesign: 'customV2',
                hScale: 7,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
            });
            createHouseCluster(L.subGreenLandCL16, {
                innerGapScale: { x: 1, y: .5 },
                outerGapScale: 1.5,
                serialCount: 7,
                startX: 200,
                startZ: 255,
                unitSpacing: 32,
                houseGap: 340,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 40,
                houseOX: 200,
                houseOZ: 500,
                poolOX: -570,
                poolOZ: -750,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                carW: 200,
                carL: 460,
                rotation: 180,
                houseDesign: 'customV2',
                hScale: 5,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
                houseAreaRotation: 54,
            });
            createHouseCluster(L.subGreenLandCL17, {
                innerGapScale: { x: 1, y: .5 },
                outerGapScale: 1.5,
                serialCount: 7,
                startX: 330,
                startZ: 280,
                unitSpacing: 32,
                houseGap: 340,
                rowSpacing: 70,
                startId: 2,
                clusterName: "",
                hasPool: true,
                carCount: 1,
                hasPlayground: true,
                singleRow: true,
                hDepth: 1550,
                hWidth: 520,
                basePlotW: 2000,
                basePlotD: 4000,
                hasWing: false,
                hFloorH: 40,
                houseOX: 200,
                houseOZ: 500,
                poolOX: -570,
                poolOZ: -750,
                carOX: -150,
                carOZ: 100,
                playOX: -570,
                playOZ: 200,
                carW: 200,
                carL: 460,
                rotation: 180,
                houseDesign: 'customV2',
                hScale: 5,
                hRotate: 0,
                houseOX: -450, houseOZ: 900,
                houseAreaRotation: 90,
            });
            setLoaderProgress(62, 'City blocks complete');
        }

        function initRoadsAndExtras() {
            setLoaderProgress(65, 'Building roads and landmarks...');

            // ADDING THE CUSTOM BUILDING FROM customeHouseBuilding.html
            const customBuildingGroup = new THREE.Group();
            customBuildingGroup.position.set(-300, 0, 550); // Near the roadside/flag area
            scene.add(customBuildingGroup);

            // createHouseCluster(customBuildingGroup, {
            //     innerGapScale: { x: 1, y: .5 },
            //     outerGapScale: .5,
            //     serialCount: 16,
            //     startX: 0,
            //     startZ: 0,
            //     unitSpacing: 6,
            //     houseGap: 40,
            //     rowSpacing: 10,
            //     startId: 2,
            //     clusterName: "CUSTOM-CLUSTER",
            //     hasPool: true,
            //     carCount: 2,
            //     hasPlayground: true,
            //     singleRow: true,
            //     hDepth: 400,
            //     hWidth: 350,
            //     basePlotW: 300,
            //     basePlotD: 250,
            //     hasWing: false,
            //     hFloorH: 40,
            //     houseOX: 0,
            //     houseOZ: 0,
            //     poolOX: -550,
            //     poolOZ: -550,
            //     poolW: 100,
            //     poolL: 260,
            //     carOX: 300,
            //     carOZ: 200,
            //     playOX: -350,
            //     playOZ: 450,
            //     carW: 100,
            //     carL: 260, 
            //     rotation: 0,
            //     houseDesign: 'customV3',
            //     hScale:6,
            //     hRotate:90,
            //     houseOX: 350, houseOZ: 400,
            //     houseAreaRotation:0,
            // });

            // Shared materials for all roads
            const asphaltBaseMat = getSharedMaterial('asphaltBase', () => new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
            const markingsMat = getSharedMaterial('roadMarkings', () => new THREE.MeshStandardMaterial({ map: createMarkingsTexture(), transparent: true, depthWrite: false, blending: THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));

            ROAD_CONFIGS.forEach(config => {
                if (config.hidden) return;
                const curve = new THREE.CatmullRomCurve3(config.points);
                const roadGeo = createRoadGeometry(curve, config.width, config.segments);

                // Create a group for each road to handle position and rotation together
                const roadGroup = new THREE.Group();
                roadGroup.userData.noOptimize = true;
                scene.add(roadGroup);

                // Check if elevated
                const isElevated = (config.position && config.position.y > 5);

                let localBaseMat = asphaltBaseMat;
                if (isElevated) {
                    localBaseMat = asphaltBaseMat.clone();
                    localBaseMat.polygonOffset = false; // Trust true depth for elevated roads
                }

                const baseMesh = new THREE.Mesh(roadGeo, localBaseMat);
                baseMesh.position.y = 0.15; // Increased lift to 0.15 to prevent Z-fighting at close range
                baseMesh.receiveShadow = true;
                roadGroup.add(baseMesh);

                const markingsMesh = new THREE.Mesh(roadGeo, markingsMat);
                markingsMesh.position.y = 0.17; // Slightly above baseMesh
                markingsMesh.renderOrder = 1;
                roadGroup.add(markingsMesh);

                // Apply Position if defined
                if (config.position) {
                    roadGroup.position.set(config.position.x || 0, config.position.y || 0, config.position.z || 0);
                }

                // Apply Rotation if defined
                if (config.rotation) {
                    roadGroup.rotation.set(config.rotation.x || 0, config.rotation.y || 0, config.rotation.z || 0);
                }

                // Add Lamp Posts along the road (Skip very small or invisible roads, or if skipLamps is true)
                if (config.width >= 4 && !config.skipLamps) {
                    const length = curve.getLength();
                    const spacing = 150; // Distance between lamps
                    const count = Math.floor(length / spacing);

                    for (let i = 0; i <= count; i++) {
                        const t = count > 0 ? i / count : 0.5;
                        const point = curve.getPointAt(t);
                        const tangent = curve.getTangentAt(t).normalize();
                        const normal = new THREE.Vector3(0, 1, 0);
                        const side = new THREE.Vector3().crossVectors(tangent, normal).normalize();

                        // Place lamp on both sides for wider roads
                        const offsets = config.width > 8 ? [1, -1] : [1];
                        offsets.forEach(dir => {
                            const lamp = createLampPost();
                            const offsetDist = (config.width / 2) + 2.5;
                            const lampPos = point.clone().add(side.clone().multiplyScalar(offsetDist * dir));
                            lamp.position.copy(lampPos);

                            // Align with road group's relative space
                            // Since we are adding it to the scene, we need to account for config.position/rotation
                            // OR we add it to roadGroup! (Better)

                            // Face the road
                            const angle = Math.atan2(tangent.x, tangent.z);
                            lamp.rotation.y = angle + (dir > 0 ? 0 : Math.PI);

                            roadGroup.add(lamp);
                        });
                    }
                }
            });

            // --- MANUAL LAMP PLACEMENT ---
            // Create lamp posts from the CUSTOM_LAMPS array
            CUSTOM_LAMPS.forEach(cfg => {
                const lamp = createLampPost();
                lamp.position.set(cfg.x || 0, cfg.y || 0, cfg.z || 0);
                lamp.rotation.set(cfg.rx || 0, cfg.ry || 0, cfg.rz || 0);
                if (cfg.scale) lamp.scale.setScalar(cfg.scale);
                scene.add(lamp);
            });



            // --- Initialize Metro ---
            buildInfra();
            createTrain({ posX: -700, posY: 22, posZ: 999, rotY: 0, count: 12 });
            createTrain({ posX: 600, posY: 22, posZ: 1003, rotY: 180, count: 12 });

            // --- Initialize Small River (Lake) ---
            sr_waterTexture = sr_createWaterTexture();
            sr_createRiverAndBanks(SR_LAKE_CONFIG);
            sr_createRiverAndBanks(SR_LAKE_CONFIG_BUNCH);
            sr_createRiverAndBanks(SR_LAKE_CONFIG_MAIN_RIVER);
            sr_createRiverAndBanks(SR_LAKE_CONFIG_CENTER_LAKE);

            // --- Central Park Area ---
            srv2_createParkArea(scene, {
                w: 160, d: 180,
                x: 100, y: 0.1, z: 450,
                ry: Math.PI / 2,
                landColor: 0xB5E550
            });

            // Internal Central Park Path
            // srv2_createParkPath(scene, {
            //     points: [
            //         new THREE.Vector3(-780, 0.2, 170),
            //         new THREE.Vector3(-750, 0.2, 200),
            //         new THREE.Vector3(-720, 0.2, 230)
            //     ],
            //     width: 2.5
            // });

            // --- Side Park (Small) ---
            // srv2_createParkArea(scene, {
            //     w: 30, d: 30,
            //     x: -450, y: 0.1, z: 500,
            //     ry: -Math.PI / 4
            // });

            // --- Fill Empty Curved Area with Houses ---
            // Western Link Houses (Merged Dual-Row Staggered Serial)
            createCurveHouseBunch(scene, ROAD_CONFIGS[0], {
                houseSpacing: 18, // Distance along the road between staggered neighbors
                offsetDistance: 18,
                landWidth: 45,
                startId: 500,
                totalHouses: 63,
                separateRows: true, // Dual-row restored
                innerGapScale: { x: 0.8, y: 0.5 },
                houseOX: 200,
                houseOZ: 150,
                houseDesign: 'custom',
                hScale: 3,
                hRotate: 90,
                poolOX: -270,
                carOX: -150,
                rotation: 90
            });

            // --- Added Shop Market (Bangla Bosoti Commercial Area) ---
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 22,
                rotY: -180, scale: 1
            });
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 78,
                rotY: -180, scale: 1
            });
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 135,
                rotY: -180, scale: 1
            });
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 190,
                rotY: -180, scale: 1
            });
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 240,
                rotY: -180, scale: 1
            });
            createShopMarket({
                posX: -20, posY: 0.1, posZ: 300,
                rotY: -180, scale: 1
            });
            // Zone - A
            createCurveHouseBunch(scene, ROAD_CONFIGS[1], {
                innerGapScale: { x: .6, y: .5 },
                outerGapScale: 2.2,
                houseSpacing: 1,
                offsetDistance: 16,
                landWidth: 15,
                startId: 500,
                houseCount: 18,
                separateRows: true,
                isTerrace: true,
                houseDesign: 'custom',
                hScale: 2,
                hRotate: 90,
                houseRotation: 0,
                houseOX: 100,
                houseOZ: 180,
                poolOX: -270,
                carOX: -150,
            });
            // Zone - B
            createCurveHouseBunch(scene, ROAD_CONFIGS[2], {
                innerGapScale: { x: .6, y: .5 },
                outerGapScale: 2.2,
                houseSpacing: 1,
                offsetDistance: 16,
                landWidth: 15,
                startId: 500,
                houseCount: 55,
                separateRows: true,
                isTerrace: true,
                houseDesign: 'custom',
                hScale: 2,
                hRotate: 90,
                houseRotation: 0,
                houseOX: 100,
                houseOZ: 180,
                poolOX: -270,
                carOX: -150,
            });
            // Zone - C
            createCurveHouseBunch(scene, ROAD_CONFIGS[3], {
                innerGapScale: { x: .6, y: .5 },
                outerGapScale: 2.2,
                houseSpacing: 1,
                offsetDistance: 16,
                landWidth: 15,
                startId: 500,
                houseCount: 29,
                separateRows: true,
                isTerrace: true,
                houseDesign: 'custom',
                hScale: 2,
                hRotate: 90,
                houseRotation: 0,
                houseOX: 100,
                houseOZ: 180,
                poolOX: -270,
                carOX: -150,
            });
            // Zone - D
            createCurveHouseBunch(scene, ROAD_CONFIGS[4], {
                innerGapScale: { x: .6, y: .5 },
                outerGapScale: 2.2,
                houseSpacing: 1,
                offsetDistance: 16,
                landWidth: 15,
                startId: 500,
                houseCount: 29,
                separateRows: true,
                isTerrace: true,
                houseDesign: 'custom',
                hScale: 2,
                hRotate: 90,
                houseRotation: 0,
                houseOX: 100,
                houseOZ: 180,
                poolOX: -270,
                carOX: -150,
            });

            // --- Zone-A House Block Initialization ---
            // createZoneABlock(scene, {
            //     carve: 46,         // Curvature intensity
            //     posX: 350,        // Position X
            //     posY: 2,           // Position Y
            //     posZ: 430,        // Position Z
            //     rotX: 0,           // Rotation X
            //     rotY: -60,         // Rotation Y
            //     serialCount: 18,   // 18 houses
            //     hScale: 0.8
            // });
            // createZoneABlock(scene, {
            //     carve: 46,         // Curvature intensity
            //     posX: 350,        // Position X
            //     posY: 2,           // Position Y
            //     posZ: 230,        // Position Z
            //     rotX: 0,           // Rotation X
            //     rotY: -60,         // Rotation Y
            //     serialCount: 44,   // 44 houses
            //     hScale: 0.8
            // });

            // --- Create Custom Animated Trees ---
            const leftForestPositions = generateLeftForestPositions(LEFT_FOREST_ZONES);
            [...customTreePositions, ...leftForestPositions].forEach(pos => {
                createAnimatedTree(
                    new THREE.Vector3(pos.x, pos.y, pos.z),
                    new THREE.Euler(0, Math.random() * Math.PI * 2, 0),
                    pos.scale || 5.0
                );
            });

            console.log("Masterplan Initialization Complete. Proceeding to Optimization...");
        }

        /**

         * Creates a custom road with 3D thickness using THREE.BufferGeometry
         * @param {THREE.Scene} scene - The scene to add the road to
         * @param {Object} options - { points: [], width: 4, thickness: 0.5, segments: 128, style: 'dashed' }
         */

        // Create strait road with depth
        function createCustomRoad(scene, options) {
            const {
                points = [],
                width = 4,
                thickness = 0.01,
                segments = 128,
                style = 'dashed',
                position = { x: 0, y: 0, z: 0 },
                rotation = { x: 0, y: 0, z: 0 },
                color = null // Custom base color
            } = options;

            if (points.length < 2) return null;

            const curve = new THREE.CatmullRomCurve3(points);
            const curvePoints = curve.getPoints(segments);
            const tangent = new THREE.Vector3();

            const vertices = [];
            const indices = [];
            const uvs = [];

            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const p = curvePoints[i];

                curve.getTangentAt(t, tangent);
                const normal = new THREE.Vector3(0, 1, 0);
                const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

                // Calculate 4 vertices per segment (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
                const pTL = p.clone().add(binormal.clone().multiplyScalar(width / 2)).add(new THREE.Vector3(0, thickness, 0));
                const pTR = p.clone().add(binormal.clone().multiplyScalar(-width / 2)).add(new THREE.Vector3(0, thickness, 0));
                const pBL = p.clone().add(binormal.clone().multiplyScalar(width / 2));
                const pBR = p.clone().add(binormal.clone().multiplyScalar(-width / 2));

                // Push vertices: Top Face (0, 1), Left Side (2, 3), Right Side (4, 5)
                // We duplicate vertices to have sharp edges (different normals/UVs)

                // Top vertices
                vertices.push(pTL.x, pTL.y, pTL.z); // 0
                vertices.push(pTR.x, pTR.y, pTR.z); // 1
                uvs.push(0, t * (curve.getLength() / width));
                uvs.push(1, t * (curve.getLength() / width));

                // Left side vertices
                vertices.push(pTL.x, pTL.y, pTL.z); // 2
                vertices.push(pBL.x, pBL.y, pBL.z); // 3
                uvs.push(0, t * (curve.getLength() / thickness));
                uvs.push(0.1, t * (curve.getLength() / thickness)); // Using tiny bit of texture space for sides

                // Right side vertices
                vertices.push(pTR.x, pTR.y, pTR.z); // 4
                vertices.push(pBR.x, pBR.y, pBR.z); // 5
                uvs.push(0, t * (curve.getLength() / thickness));
                uvs.push(0.1, t * (curve.getLength() / thickness));

                if (i < segments) {
                    const base = i * 6;
                    // Top Face
                    indices.push(base, base + 6, base + 1);
                    indices.push(base + 1, base + 6, base + 7);
                    // Left Wall
                    indices.push(base + 2, base + 3, base + 8);
                    indices.push(base + 3, base + 9, base + 8);
                    // Right Wall
                    indices.push(base + 4, base + 10, base + 5);
                    indices.push(base + 5, base + 10, base + 11);
                }
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();

            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');

            if (style === 'lake') {
                // Optimized water material with GPU-side animation
                const mat = new THREE.MeshStandardMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8,
                    roughness: 0.2,
                    metalness: 0.3
                });

                mat.onBeforeCompile = (shader) => {
                    shader.uniforms.uTime = globalUniforms.uTime;
                    shader.vertexShader = `
                        uniform float uTime;
                        ${shader.vertexShader}
                    `.replace(
                        '#include <begin_vertex>',
                        `
                        #include <begin_vertex>
                        // Only move top vertices
                        if (position.y > 0.0) {
                            float wave = sin(position.x * 0.04 + uTime * 2.0) * 1.5 + 
                                         cos(position.z * 0.04 + uTime * 1.5) * 1.5 + 
                                         sin((position.x + position.z) * 0.02 + uTime * 0.8) * 2.0;
                            transformed.y += wave;
                        }
                        `
                    );

                    // Ripple animation for lake
                    shader.fragmentShader = shader.fragmentShader.replace(
                        '#include <map_fragment>',
                        `
                        vec2 uvOffset = vec2(sin(uTime * 0.5) * 0.02, -uTime * 0.08);
                        vec4 texelColor = texture2D(map, vUv + uvOffset);
                        diffuseColor *= texelColor;
                        `
                    );
                };

                const roadMesh = new THREE.Mesh(geometry, mat);
                roadMesh.userData.noOptimize = true;
                if (position) roadMesh.position.set(position.x || 0, position.y || 0, position.z || 0);
                if (rotation) roadMesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
                scene.add(roadMesh);
                return roadMesh;
            }

            // Asphalt Base
            ctx.fillStyle = color || '#222222';
            ctx.fillRect(0, 0, 128, 512);

            // Sidebar color for side walls (using a small strip of the texture)
            ctx.fillStyle = '#444444';
            ctx.fillRect(0, 0, 15, 512);

            // Noise/Grit for road
            for (let i = 0; i < 2000; i++) {
                const x = 15 + Math.random() * 113;
                const y = Math.random() * 512;
                const gray = 20 + Math.random() * 30;
                ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
                ctx.fillRect(x, y, 1, 1);
            }

            if (style !== 'lake') {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                if (style === 'dashed') {
                    ctx.setLineDash([80, 100]);
                    ctx.beginPath(); ctx.moveTo(71, 0); ctx.lineTo(71, 512); ctx.stroke();
                } else if (style === 'double') {
                    ctx.beginPath();
                    ctx.moveTo(60, 0); ctx.lineTo(60, 512);
                    ctx.moveTo(68, 0); ctx.lineTo(68, 512);
                    ctx.stroke();
                } else if (style === 'solid') {
                    ctx.setLineDash([]);
                    ctx.beginPath(); ctx.moveTo(71, 0); ctx.lineTo(71, 512); ctx.stroke();
                }

                // Side Lines
                ctx.strokeStyle = 'rgba(255,255,255,1)';
                ctx.setLineDash([]);
                ctx.strokeRect(17, -10, 2, 532);
                ctx.strokeRect(124, -10, 2, 532);
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

            const material = (style === 'lake') ?
                new THREE.MeshStandardMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.8,
                    roughness: 0.2,
                    metalness: 0.3
                }) :
                new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide
                });

            const roadMesh = new THREE.Mesh(geometry, material);

            // Apply Position
            if (position) {
                roadMesh.position.set(position.x || 0, position.y || 0, position.z || 0);
            }

            // Apply Rotation
            if (rotation) {
                roadMesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
            }

            scene.add(roadMesh);
            return roadMesh;
        }

        function sceneRender(time) {
            if (!isPageVisible) return;
            if (!renderer || !scene || !camera) return;

            const delta = Math.min(renderClock.getDelta(), 0.05);
            updateControlsFrame(delta);

            if (!window.isSceneOptimized) {
                renderer.render(scene, camera);
                return;
            }

            renderFrame++;
            const t = time * 0.001;
            globalUniforms.uTime.value = t;
            const interacting = introActive;

            if (!interacting && flagObj && flagObj.animateFlag && renderFrame % PERF.flagAnimInterval === 0) {
                flagObj.animateFlag(time);
            }

            // --- Cinematic fog reveal (intro phase 1) ---
            if (introPhase === 'fog' && !fogRevealComplete && scene && scene.fog) {
                if (fogRevealStartTime === null) fogRevealStartTime = time;

                const elapsed = time - fogRevealStartTime;
                const progress = Math.min(elapsed / INTRO.fogDurationMs, 1);
                const eased = progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                scene.fog.density = INTRO.fogDensityStart - (INTRO.fogDensityStart - INTRO.fogDensityEnd) * eased;

                if (progress >= 1) {
                    fogRevealComplete = true;
                    scene.fog.density = INTRO.fogDensityEnd;
                    onIntroFogComplete();
                }
                requestRender();
            }

            // Update River animation

            if (!interacting && river && renderFrame % 2 === 0) river.update(time);

            // Animate Sky
            if (isNight && stars) {
                stars.rotation.y += 0.0001; // Slow rotation of starfield
                stars.rotation.x += 0.00005;
                if (stars.material.uniforms) {
                    stars.material.uniforms.uTime.value = time * 0.001;
                }
                if (stars.userData.cloudGroup) {
                    stars.userData.cloudGroup.rotation.y += 0.00005;
                }
                requestRender();
            }

            // Small river texture animation (optimized)
            if (!interacting && sr_waterTexture && renderFrame % 2 === 0) {
                sr_waterTexture.offset.y -= 0.00556;
            }


            if (!introActive) {
                if (camera.position.y < 2.0) camera.position.y = 2.0;
                if (controls.target.y < 0) controls.target.y = 0;
            }

            renderer.render(scene, camera);
        }

        function startRenderLoop() {
            if (animationLoopId !== null) return;
            renderer.setAnimationLoop(sceneRender);
            animationLoopId = true;
        }

        function stopRenderLoop() {
            if (renderer) renderer.setAnimationLoop(null);
            animationLoopId = null;
        }


        // function createSquareGrid(size = 120, divisions = 80) {
        //     const vertices = [];
        //     const step = size / divisions;
        //     const half = size / 2;

        //     for (let i = 0; i <= divisions; i++) {
        //         const k = -half + i * step;

        //         // Vertical line
        //         vertices.push(-half, 0, k, half, 0, k);
        //         // Horizontal line
        //         vertices.push(k, 0, -half, k, 0, half);
        //     }

        //     const geometry = new THREE.BufferGeometry();
        //     geometry.setAttribute(
        //         'position',
        //         new THREE.Float32BufferAttribute(vertices, 3)
        //     );

        //     const material = new THREE.LineBasicMaterial({ color: 0x697565 });
        //     return new THREE.LineSegments(geometry, material);
        // }



        // Center Flag
        function createFlag(scene, position = { x: 0, y: 0, z: 0 }) {
            const group = new THREE.Group();

            /* =========================
               Flag Pole
            ========================= */
            const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 10, 16);
            const poleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const pole = new THREE.Mesh(poleGeometry, poleMaterial);

            pole.position.set(0, 5, 0);
            group.add(pole);

            /* =========================
               Create Text Canvas
            ========================= */
            const canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 512;
            const ctx = canvas.getContext("2d");

            // Background
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw Logo from assets/images/bbl.png
            const logo = new Image();
            logo.src = 'assets/images/bbl.png';
            logo.onload = () => {
                const logoSize = 200;
                ctx.drawImage(logo, (canvas.width - logoSize) / 2, (canvas.height / 2) - logoSize + 20, logoSize, logoSize);
                flagTexture.needsUpdate = true;
            };

            // Text
            ctx.font = "bold 60px Arial";
            ctx.fillStyle = "#006a4e"; // Green text for contrast
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Bangla Bosoti Square", canvas.width / 2, canvas.height / 2 + 100);

            const flagTexture = new THREE.CanvasTexture(canvas);
            const flagGeometry = new THREE.PlaneGeometry(6, 3, 8, 8);
            const flagMaterial = new THREE.MeshBasicMaterial({
                map: flagTexture,
                side: THREE.DoubleSide
            });

            const flag = new THREE.Mesh(flagGeometry, flagMaterial);
            flag.position.set(3, 7.5, 0);
            group.add(flag);

            /* =========================
               Position Group
            ========================= */
            group.position.set(position.x, position.y, position.z);
            scene.add(group);

            /* =========================
               Wave Animation
            ========================= */
            function animateFlag(time) {
                const pos = flag.geometry.attributes.position;

                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i);
                    pos.setZ(i, Math.sin(x * 2 + time * 0.005) * 0.2);
                }

                pos.needsUpdate = true;
            }

            return { group, animateFlag };
        }


        function createRoadGeometry(curve, width, segments) {
            const points = curve.getSpacedPoints(segments);
            const vertices = [];
            const uvs = [];
            const indices = [];

            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const p = points[i];
                const tangent = curve.getTangentAt(t).normalize();
                const binormal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

                const pL = p.clone().add(binormal.clone().multiplyScalar(width / 2));
                const pR = p.clone().add(binormal.clone().multiplyScalar(-width / 2));

                vertices.push(pL.x, 0, pL.z, pR.x, 0, pR.z);

                const dist = t * curve.getLength();
                uvs.push(0, dist / 20, 1, dist / 20);

                if (i < segments) {
                    const idx = i * 2;
                    indices.push(idx, idx + 2, idx + 1, idx + 1, idx + 2, idx + 3);
                }
            }

            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geo.setIndex(indices);
            geo.computeVertexNormals();
            return geo;
        }

        function createMarkingsTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 1024;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 512, 1024);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 12;
            ctx.setLineDash([60, 60]);
            ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(256, 1024); ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = 8;
            ctx.strokeRect(15, -10, 2, 1044);
            ctx.strokeRect(495, -10, 2, 1044);
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.anisotropy = 4; // Reduced from 16 for better performance
            return texture;
        }



        /**
         * Creates a stylized road lamp post.
         */
        function createLampPost() {
            const group = new THREE.Group();

            // Pole (Reduced height)
            const poleGeo = getSharedGeometry('lampPole', () => new THREE.CylinderGeometry(0.15, 0.25, 12, 8));
            const poleMat = getSharedMaterial('lampPoleMat', () => new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 }));
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 6;
            pole.castShadow = true;
            group.add(pole);

            // Arm
            const armGeo = getSharedGeometry('lampArm', () => new THREE.CylinderGeometry(0.1, 0.1, 5, 8));
            const arm = new THREE.Mesh(armGeo, poleMat);
            arm.rotation.z = Math.PI / 2;
            arm.position.set(2.5, 11.5, 0); // Adjusted for shorter pole
            group.add(arm);

            // Lamp Head
            const headGeo = getSharedGeometry('lampHead', () => new THREE.BoxGeometry(2, 0.6, 1.2));
            const head = new THREE.Mesh(headGeo, poleMat);
            head.position.set(4.8, 11.5, 0); // Adjusted
            group.add(head);

            // Bulb (Emissive)
            const bulbGeo = getSharedGeometry('lampBulb', () => new THREE.SphereGeometry(0.5, 8, 8));
            const bulbMat = getSharedMaterial('lampBulbMat', () => new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0x000000,
                emissiveIntensity: 0,
                transparent: true,
                opacity: 0.9
            }));
            const bulb = new THREE.Mesh(bulbGeo, bulbMat);
            bulb.position.set(4.8, 11.1, 0); // Adjusted
            bulb.name = 'lampBulb';
            group.add(bulb);

            // Light Cone Effect (Fake Light) - "Large area expend"
            const coneGeo = getSharedGeometry('lampLightCone', () => new THREE.ConeGeometry(30, 22, 16, 1, true)); // Significantly larger
            const coneMat = getSharedMaterial('lampLightConeMat', () => new THREE.MeshBasicMaterial({
                color: 0xffffaa,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending
            }));
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.set(4.8, 1, 0); // Grounded
            cone.rotation.x = 0;
            cone.name = 'lampCone';
            group.add(cone);

            return group;
        }

        function createTree() {
            const treeGroup = new THREE.Group();
            treeGroup.name = 'stdTree';
            treeGroup.userData.isTree = true;
            treeGroup.userData.treeType = 'standard';
            // Internal height is 1.15. Normalize to 1.0 (1/1.15 = 0.869)
            treeGroup.scale.set(10.87, 0.87, 0.87);

            // Trunk (height 0.5)
            const trunkGeometry = getSharedGeometry('stdTrunk', () => new THREE.CylinderGeometry(0.08, 0.08, 0.5, 6));
            const trunkMaterial = getSharedMaterial('stdTrunkMat', () => new THREE.MeshBasicMaterial({ color: 0x8D6E63 }));
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.userData.isTree = true;
            trunk.position.y = 0.25;
            treeGroup.add(trunk);

            // Foliage
            const leavesMaterial = getSharedMaterial('stdLeafMat', () => new THREE.MeshBasicMaterial({ color: 0x388E3C }));
            const lowerConeGeo = getSharedGeometry('stdLowerLeaf', () => new THREE.ConeGeometry(0.3, 0.6, 8));
            const lowerCone = new THREE.Mesh(lowerConeGeo, leavesMaterial);
            lowerCone.userData.isTree = true;
            lowerCone.position.y = 0.6;
            treeGroup.add(lowerCone);

            const upperConeGeo = getSharedGeometry('stdUpperLeaf', () => new THREE.ConeGeometry(0.2, 0.5, 8));
            const upperCone = new THREE.Mesh(upperConeGeo, leavesMaterial);
            upperCone.userData.isTree = true;
            upperCone.position.y = 0.9;
            treeGroup.add(upperCone);

            return treeGroup;
        }

        /**
         * Creates a simple stylized tree with minimal foliage geometry.
         */
        function createHighQualityTree() {
            const treeGroup = new THREE.Group();
            treeGroup.name = 'hqTree';
            treeGroup.userData.isTree = true;
            treeGroup.userData.treeType = 'highQuality';
            treeGroup.scale.set(0.4, 0.4, 0.4);

            const trunkMat = getSharedMaterial('hqTrunkMat', () => new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.88 }));
            const trunkGeo = getSharedGeometry('hqTrunk', () => {
                const g = new THREE.CylinderGeometry(0.15, 0.2, 1.0, 6);
                g.translate(0, 0.5, 0);
                return g;
            });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.userData.isTree = true;
            treeGroup.add(trunk);

            const leafMat = getSharedMaterial('hqLeafMat', () => new THREE.MeshStandardMaterial({ color: 0x2E7D32 }));
            const mergedLeafGeo = getSharedGeometry('hqLeafMerged', () => {
                const geos = [];
                const sphere = new THREE.SphereGeometry(0.7, 8, 8);
                const s1 = sphere.clone(); s1.translate(0, 1.0, 0); geos.push(s1);
                const s2 = sphere.clone(); s2.scale(0.85, 0.85, 0.85); s2.translate(0, 1.6, 0); geos.push(s2);
                const s3 = sphere.clone(); s3.scale(0.65, 0.65, 0.65); s3.translate(0, 2.1, 0); geos.push(s3);
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            const leaves = new THREE.Mesh(mergedLeafGeo, leafMat);
            leaves.userData.isTree = true;
            treeGroup.add(leaves);

            return treeGroup;
        }

        /**
         * The following system uses a variation cache for procedurally generated animated trees
         * to drastically reduce scene graph complexity and memory usage.
         */

        const animatedTreeVariations = new Map();
        function getCachedAnimatedTree(variationId = 0) {
            if (!animatedTreeVariations.has(variationId)) {
                const group = new THREE.Group();
                // Create a temporary group to hold the procedural tree
                const tempTree = new THREE.Group();
                // We use a fixed seed for each variation to ensure consistency
                // (Though current createAnimatedTree is random, we just take one result)
                createAnimatedTreeInternal(tempTree, new THREE.Vector3(0, 0, 0), new THREE.Euler(0, 0, 0), 27.5);
                animatedTreeVariations.set(variationId, tempTree);
            }
            return animatedTreeVariations.get(variationId).clone();
        }

        /**
         * The internal procedural logic for createAnimatedTree
         */
        function createAnimatedTreeInternal(targetParent, position, rotation, scale = 3.0) {
            const treeGroup = new THREE.Group();
            treeGroup.name = 'animatedTree';
            treeGroup.userData.isTree = true;
            treeGroup.userData.treeType = 'animated';
            treeGroup.position.copy(position);
            treeGroup.rotation.copy(rotation);
            const s = scale / 27.5;
            treeGroup.scale.set(s, s, s);
            targetParent.add(treeGroup);

            const barkMat = getSharedMaterial('animatedTreeBark', () => new THREE.MeshStandardMaterial({ color: 0x2b1d0e, roughness: 0.9 }));
            const leafShape = new THREE.Shape();
            leafShape.moveTo(0, 0);
            leafShape.quadraticCurveTo(0.5, 0.5, 0, 1.2);
            leafShape.quadraticCurveTo(-0.5, 0.5, 0, 0);
            const leafGeo = getSharedGeometry('animatedTreeLeafGeo', () => new THREE.ShapeGeometry(leafShape));
            const leafColors = [0x2d4c1e, 0x3a5a2a, 0x4b6e32, 0x1e3a12];
            const leafMats = leafColors.map((c, i) => getSharedMaterial(`animatedTreeLeafMat${i}`, () => {
                const mat = new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.8 });
                mat.userData.isLeaf = true;
                return mat;
            }));

            function growBranch(startPos, direction, length, thickness, depth) {
                if (depth > 6) return;
                const endPos = new THREE.Vector3().addVectors(startPos, direction.clone().multiplyScalar(length));
                const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
                const branchGeo = getSharedGeometry('animatedTreeBranch', () => new THREE.CylinderGeometry(0.7, 1.0, 1, 5));
                const branch = new THREE.Mesh(branchGeo, barkMat);
                branch.userData.isTree = true;
                branch.userData.treeType = 'animated';
                branch.position.copy(midpoint);
                branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
                branch.scale.set(thickness, length, thickness);
                treeGroup.add(branch);

                if (depth >= 2) {
                    const baseCount = depth >= 4 ? 8 : (depth >= 3 ? 6 : 4);
                    const leafCount = Math.floor(Math.random() * 4) + baseCount;
                    for (let i = 0; i < leafCount; i++) {
                        const leaf = new THREE.Mesh(leafGeo, leafMats[Math.floor(Math.random() * leafMats.length)]);
                        leaf.userData.isTree = true;
                        leaf.userData.treeType = 'animated';
                        const spread = length * 3.0;
                        leaf.position.copy(endPos).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.5, (Math.random() - 0.5) * spread));
                        const ls = 1.0 + Math.random() * 1.5;
                        leaf.scale.set(ls, ls, ls);
                        leaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                        treeGroup.add(leaf);
                    }
                }
                const numBranches = (depth === 0) ? 1 : (Math.random() > 0.8 ? 3 : 2);
                for (let i = 0; i < numBranches; i++) {
                    const nextDir = direction.clone();
                    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                    nextDir.applyAxisAngle(axis, 0.3 + Math.random() * 0.4);
                    growBranch(endPos, nextDir, length * (0.7 + Math.random() * 0.2), thickness * 0.7, depth + 1);
                }
            }
            growBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 5.5, 0.9, 0);
        }

        /**
         * Public API that uses the variation cache
         */
        function createAnimatedTree(position, rotation, scale = 3.0) {
            const variationId = Math.floor(Math.random() * 8); // 8 unique tree shapes
            const tree = getCachedAnimatedTree(variationId);
            tree.position.copy(position);
            tree.rotation.copy(rotation);
            const s = scale / 27.5;
            tree.scale.set(s, s, s);
            tree.updateMatrix();
            tree.matrixAutoUpdate = false;
            tree.traverse(c => {
                if (c.isMesh) {
                    c.updateMatrix();
                    c.matrixAutoUpdate = false;
                }
            });
            scene.add(tree);
            return tree;
        }

        function createGTree(scale = 4.0) {
            const treeGroup = new THREE.Group();
            treeGroup.name = 'gtree';
            treeGroup.userData.isTree = true;
            treeGroup.userData.treeType = 'gtree';
            // Internal height for depth 2: Seg(10) + Child(7.5) + GChild(5.625) = 23.125
            // Normalize to 1.0: 1 / 23.125 = 0.043
            const internalScale = 0.043;
            treeGroup.scale.set(scale * internalScale, scale * internalScale, scale * internalScale);

            const barkMaterial = getSharedMaterial('gtreeBark', () => new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 }));
            const leafMaterial = getSharedMaterial('gtreeLeaf', () => new THREE.MeshStandardMaterial({
                color: 0x22c55e,
                emissive: 0x064e3b,
                transparent: true,
                opacity: 0.85
            }));

            function createFoliageBunch(radius) {
                const bunchGroup = new THREE.Group();
                // Match gtree.html proportions: radius-based sub-branches
                const subBranchGeo = getSharedGeometry(`gtreeSubBranch_${radius.toFixed(2)}`, () => new THREE.CylinderGeometry(radius * 0.5, radius * 0.8, radius * 8, 6));
                const subBranch = new THREE.Mesh(subBranchGeo, barkMaterial);
                subBranch.position.y = radius * 4;
                bunchGroup.add(subBranch);

                const leafDensity = 1;
                for (let i = 0; i < leafDensity; i++) {
                    const leafSize = radius * (10 + Math.random() * 5); // Slimmer bushy look
                    const leafGeo = getSharedGeometry('gtreeLeafSphere', () => new THREE.SphereGeometry(1, 7, 7));
                    const leaf = new THREE.Mesh(leafGeo, leafMaterial);
                    leaf.userData.isTree = true;
                    leaf.scale.setScalar(leafSize);

                    // _-- GTREE LEAF SET Y POSITION __
                    leaf.position.set(
                        (Math.random() - 0.1) * radius * 12,
                        5,
                        (Math.random() - 0.1) * radius * 12
                    );

                    // Store for animation
                    leaf.userData.originalPos = leaf.position.clone();
                    breathingObjects.push(leaf);
                    bunchGroup.add(leaf);
                }
                return bunchGroup;
            }

            function buildMainStructure(parentGroup, height, radius, depth) {
                const geometry = getSharedGeometry(`gtreeBranchSeg_${depth}`, () => new THREE.CylinderGeometry(0.7, 1.0, 10, 6)); // 6 instead of 8
                const segment = new THREE.Mesh(geometry, barkMaterial);
                segment.userData.isTree = true;
                segment.scale.set(radius, 1, radius);
                segment.castShadow = true;
                segment.position.y = height / 2;
                parentGroup.add(segment);

                if (depth === 0) {
                    const bunch = createFoliageBunch(radius);
                    bunch.position.y = height;
                    parentGroup.add(bunch);
                } else {
                    const numChildren = 3; // Fuller tree
                    for (let i = 0; i < numChildren; i++) {
                        const nextGroup = new THREE.Group();
                        nextGroup.position.y = height;
                        const spread = 0.8;
                        nextGroup.rotation.x = (Math.random() - 0.5) * spread;
                        nextGroup.rotation.z = (Math.random() - 0.5) * spread;
                        nextGroup.rotation.y = (Math.random() * Math.PI * 2);
                        parentGroup.add(nextGroup);
                        buildMainStructure(nextGroup, height * 0.75, radius * 0.7, depth - 1);
                    }
                }
            }

            function buildRoots(baseRadius, treeGroup) {
                const numRoots = 3; // Reduced from 4
                const rootGeo = getSharedGeometry('gtreeRootSeg', () => new THREE.CylinderGeometry(0.5, 0.8, 10, 5));
                for (let i = 0; i < numRoots; i++) {
                    const rootAngle = (i / numRoots) * Math.PI * 2;
                    const rootPart = new THREE.Mesh(rootGeo, barkMaterial);
                    rootPart.userData.isTree = true;
                    rootPart.scale.set(baseRadius, 0.4, baseRadius); // Short stubby roots

                    const nextX = Math.cos(rootAngle) * 4;
                    const nextZ = Math.sin(rootAngle) * 4;
                    const nextY = -1;

                    rootPart.position.set(nextX / 2, 0, nextZ / 2);
                    rootPart.lookAt(nextX, nextY, nextZ);
                    rootPart.rotateX(Math.PI / 2);
                    treeGroup.add(rootPart);
                }
            }

            buildMainStructure(treeGroup, 10, 0.7, 2); // Depth 2 for performance & shorter look
            buildRoots(0.7, treeGroup);

            return treeGroup;
        }

        // --- MODULAR HOUSE SYSTEM (srv2) FROM customeHouse.html ---
        function srv2_finalizeMesh(mesh, parent, config) {
            const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = config;
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false; // Major performance win for static objects
            mesh.updateMatrix(); // Ensure the initial matrix is calculated
            parent.add(mesh);
            return mesh;
        }

        function srv2_createWall(parent, config) {
            const { w = 5, h = 3, t = 0.2, color = 0xffffff } = config;
            const geoKey = `box_${w}_${h}_${t}_translated_y`;
            const geometry = getSharedGeometry(geoKey, () => {
                const g = new THREE.BoxGeometry(w, h, t);
                g.translate(0, h / 2, 0);
                return g;
            });
            const matKey = `mat_wall_${color}`;
            const material = getSharedMaterial(matKey, () => new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.5,
                metalness: 0
            }));
            const wall = new THREE.Mesh(geometry, material);
            return srv2_finalizeMesh(wall, parent, config);
        }

        function srv2_createFloor(parent, config) {
            const { w = 5, d = 5, t = 0.15, color = 0xcccccc } = config;
            const geoKey = `box_${w}_${t}_${d}_translated_y`;
            const geometry = getSharedGeometry(geoKey, () => {
                const g = new THREE.BoxGeometry(w, t, d);
                g.translate(0, t / 2, 0);
                return g;
            });
            const matKey = `mat_floor_${color}`;
            const material = getSharedMaterial(matKey, () => new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.4,
                metalness: 0.2
            }));
            const floor = new THREE.Mesh(geometry, material);
            return srv2_finalizeMesh(floor, parent, config);
        }

        function srv2_createWindow(parent, config) {
            const { w = 1.5, h = 1.5, borderT = 0.1 } = config;
            const group = new THREE.Group();

            const glassGeo = getSharedGeometry(`winGlass_${w}_${h}`, () => new THREE.BoxGeometry(w, h, 0.05));
            const glassMat = getSharedMaterial('winGlassMat', () => new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 }));
            const glass = new THREE.Mesh(glassGeo, glassMat);
            group.add(glass);

            const borderMat = getSharedMaterial('winBorderMat', () => new THREE.MeshStandardMaterial({ color: 0x333333 }));
            const createPart = (bw, bh, px, py) => {
                const partGeo = getSharedGeometry(`winPart_${bw}_${bh}`, () => new THREE.BoxGeometry(bw, bh, 0.15));
                const p = new THREE.Mesh(partGeo, borderMat);
                p.position.set(px, py, 0);
                group.add(p);
            };
            createPart(w + borderT * 2, borderT, 0, h / 2 + borderT / 2);
            createPart(w + borderT * 2, borderT, 0, -h / 2 - borderT / 2);
            createPart(borderT, h, -w / 2 - borderT / 2, 0);
            createPart(borderT, h, w / 2 + borderT / 2, 0);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createFancyWindow(parent, config) {
            const { w = 2, h = 2.8, trimT = 0.2, frameT = 0.05, hasTree = true } = config;
            const group = new THREE.Group();

            const trimMat = getSharedMaterial('fancyWinTrim', () => new THREE.MeshStandardMaterial({ color: 0xfff0e0, roughness: 0.9 }));
            const frameMat = getSharedMaterial('fancyWinFrame', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
            const glassMat = getSharedMaterial('fancyWinGlass', () => new THREE.MeshStandardMaterial({ color: 0x11181c, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.85 }));
            const leafMat = getSharedMaterial('fancyWinLeaf', () => new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 }));
            const flowerMat = getSharedMaterial('fancyWinFlower', () => new THREE.MeshStandardMaterial({ color: 0xfff0f0, roughness: 0.5 }));

            const baseDepth = 0.15;
            const trimDepth = 0.28;

            const archY = h / 2 - w / 2;
            const shape = new THREE.Shape();
            shape.moveTo(-w / 2 - trimT, -h / 2);
            shape.lineTo(w / 2 + trimT, -h / 2);
            shape.lineTo(w / 2 + trimT, archY);
            shape.absarc(0, archY, w / 2 + trimT, 0, Math.PI, false);
            shape.lineTo(-w / 2 - trimT, -h / 2);

            const hole = new THREE.Path();
            hole.moveTo(-w / 2, -h / 2);
            hole.lineTo(-w / 2, archY);
            hole.absarc(0, archY, w / 2, Math.PI, 0, true);
            hole.lineTo(w / 2, -h / 2);
            hole.lineTo(-w / 2, -h / 2);
            shape.holes.push(hole);

            const outerGeo = new THREE.ExtrudeGeometry(shape, { depth: trimDepth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.04, bevelSegments: 3 });
            const outerFrame = new THREE.Mesh(outerGeo, trimMat);
            group.add(outerFrame);

            const sillW = w + trimT * 4;
            const sillH = 0.25;
            const sillD = trimDepth + 0.25;
            const sillGeo = getSharedGeometry(`fancyWinSill_${sillW}_${sillH}_${sillD}`, () => new THREE.BoxGeometry(sillW, sillH, sillD));
            const sill = new THREE.Mesh(sillGeo, trimMat);
            sill.position.set(0, -h / 2 - sillH / 2, sillD / 2 - trimDepth / 2 - 0.05);
            group.add(sill);

            const corbel = (cx) => {
                const cGroup = new THREE.Group();
                const base = new THREE.Mesh(getSharedGeometry('corbelBase', () => new THREE.BoxGeometry(0.2, 0.5, 0.25)), trimMat);
                base.position.set(0, -0.25, 0);
                const curve = new THREE.Mesh(getSharedGeometry('corbelCurve', () => new THREE.SphereGeometry(0.12, 16, 16)), trimMat);
                curve.position.set(0, -0.4, 0.1);
                cGroup.add(base, curve);
                cGroup.position.set(cx, -h / 2 - sillH, sillD / 2 - trimDepth / 2);
                group.add(cGroup);
            };
            corbel(-w / 2 + 0.1);
            corbel(w / 2 - 0.1);
            corbel(0);

            if (hasTree) {
                const boxW = w + trimT * 2;
                const boxH = 0.45;
                const boxD = 0.35;
                const fBox = new THREE.Mesh(getSharedGeometry(`flowerBox_${boxW}`, () => new THREE.BoxGeometry(boxW, boxH, boxD)), trimMat);
                fBox.position.set(0, -h / 2 + boxH / 2 - 0.05, sillD - 0.05);
                group.add(fBox);

                for (let i = 0; i < 20; i++) {
                    const r = 0.06 + Math.random() * 0.08;
                    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), leafMat);
                    leaf.userData.isTree = true;
                    leaf.userData.treeType = 'standard';
                    leaf.position.set((Math.random() - 0.5) * (boxW - 0.1), -h / 2 + boxH / 2 + Math.random() * 0.2, sillD + (Math.random() * boxD - boxD / 2));
                    group.add(leaf);
                }
            }

            const innerShape = new THREE.Shape();
            innerShape.moveTo(-w / 2, -h / 2);
            innerShape.lineTo(w / 2, -h / 2);
            innerShape.lineTo(w / 2, archY);
            innerShape.absarc(0, archY, w / 2, 0, Math.PI, false);
            innerShape.lineTo(-w / 2, -h / 2);
            const innerHole = new THREE.Path();
            innerHole.moveTo(-w / 2 + frameT, -h / 2 + frameT);
            innerHole.lineTo(-w / 2 + frameT, archY);
            innerHole.absarc(0, archY, w / 2 - frameT, Math.PI, 0, true);
            innerHole.lineTo(w / 2 - frameT, -h / 2 + frameT);
            innerHole.lineTo(-w / 2 + frameT, -h / 2 + frameT);
            innerShape.holes.push(innerHole);

            const innerFrameMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(innerShape, { depth: baseDepth, bevelEnabled: false }), frameMat);
            innerFrameMesh.position.z = 0.02;
            group.add(innerFrameMesh);

            const glassShape = new THREE.Shape();
            glassShape.moveTo(-w / 2, -h / 2);
            glassShape.lineTo(w / 2, -h / 2);
            glassShape.lineTo(w / 2, archY);
            glassShape.absarc(0, archY, w / 2, 0, Math.PI, false);
            glassShape.lineTo(-w / 2, -h / 2);
            const glassObj = new THREE.Mesh(new THREE.ExtrudeGeometry(glassShape, { depth: 0.01, bevelEnabled: false }), glassMat);
            glassObj.position.z = baseDepth / 2 - 0.02;
            group.add(glassObj);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createDoor(parent, config) {
            const { w = 1.2, h = 2.2, borderT = 0.15, isOpen = false } = config;
            const group = new THREE.Group();
            const doorGroup = new THREE.Group();

            const doorMat = getSharedMaterial('doorMatBody', () => new THREE.MeshStandardMaterial({ color: 0x4d2a1a }));
            const doorGeo = getSharedGeometry(`doorBodyGeo_${w}_${h}`, () => {
                const g = new THREE.BoxGeometry(w, h, 0.1);
                g.translate(w / 2, h / 2, 0);
                return g;
            });
            const doorBody = new THREE.Mesh(doorGeo, doorMat);
            doorGroup.add(doorBody);

            const handleMat = getSharedMaterial('doorHandleMat', () => new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 }));
            const handleGeo = getSharedGeometry('doorHandleGeo', () => new THREE.SphereGeometry(0.06, 16, 16));

            const handle = new THREE.Mesh(handleGeo, handleMat);
            handle.position.set(w - 0.2, h / 2, 0.1);
            doorGroup.add(handle);

            const handleBack = handle.clone();
            handleBack.position.z = -0.1;
            doorGroup.add(handleBack);

            doorGroup.position.x = -w / 2;
            if (isOpen) doorGroup.rotation.y = -Math.PI / 5.5;
            group.add(doorGroup);

            const frameMat = getSharedMaterial('doorFrameMat', () => new THREE.MeshStandardMaterial({ color: 0x222222 }));
            const createFrame = (fw, fh, px, py) => {
                const fGeo = getSharedGeometry(`doorFramePart_${fw}_${fh}`, () => new THREE.BoxGeometry(fw, fh, 0.2));
                const f = new THREE.Mesh(fGeo, frameMat);
                f.position.set(px, py, 0);
                group.add(f);
            };
            createFrame(w + borderT * 2, borderT, 0, h + borderT / 2);
            createFrame(borderT, h + borderT, -w / 2 - borderT / 2, h / 2);
            createFrame(borderT, h + borderT, w / 2 + borderT / 2, h / 2);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createMainDoor(parent, config) {
            const { w = 2.4, h = 2.8, borderT = 0.2, isOpen = false } = config;
            const group = new THREE.Group();

            const frameMat = getSharedMaterial('mainDoorFrame', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
            const doorMat = getSharedMaterial('mainDoorWood', () => new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.6 }));
            const glassMat = getSharedMaterial('mainDoorGlass', () => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.95 }));
            const handleMat = getSharedMaterial('mainDoorHandle', () => new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.2 }));

            const createFrame = (fw, fh, px, py) => {
                const f = new THREE.Mesh(getSharedGeometry(`mainDoorFrame_${fw}_${fh}`, () => new THREE.BoxGeometry(fw, fh, 0.3)), frameMat);
                f.position.set(px, py, 0);
                group.add(f);
            };

            createFrame(borderT, h + 0.8 + borderT, -w / 2 - borderT / 2, (h + 0.8) / 2);
            createFrame(borderT, h + 0.8 + borderT, w / 2 + borderT / 2, (h + 0.8) / 2);
            createFrame(w + borderT * 2, borderT, 0, h + borderT / 2); // Transom separator
            createFrame(w + borderT * 2, borderT, 0, h + 0.8 + borderT / 2); // Top roof frame

            // Overhead transom window
            const transom = new THREE.Mesh(getSharedGeometry(`transom_${w}`, () => new THREE.BoxGeometry(w, 0.8 - borderT, 0.05)), glassMat);
            transom.position.set(0, h + 0.4 + borderT / 2, 0);
            group.add(transom);

            // Left Door Leaf
            const leftDoor = new THREE.Group();
            const bodyL = new THREE.Mesh(getSharedGeometry(`doorBodyL_${w}_${h}`, () => new THREE.BoxGeometry(w / 2, h, 0.1)), doorMat);
            bodyL.position.set(w / 4, h / 2, 0);
            leftDoor.add(bodyL);

            const panelL = new THREE.Mesh(getSharedGeometry(`doorPanelL_${w}_${h}`, () => new THREE.BoxGeometry(w / 3, h * 0.7, 0.13)), doorMat);
            panelL.position.set(w / 4, h / 2, 0);
            leftDoor.add(panelL);

            const glassL = new THREE.Mesh(getSharedGeometry(`doorGlassL_${w}_${h}`, () => new THREE.BoxGeometry(w / 8, h * 0.6, 0.15)), glassMat);
            glassL.position.set(w / 4, h / 2, 0);
            leftDoor.add(glassL);

            const handleL = new THREE.Mesh(getSharedGeometry('doorHandleStick', () => new THREE.CylinderGeometry(0.02, 0.02, 0.8)), handleMat);
            handleL.position.set(w / 2 - 0.1, h / 2, 0.12);
            leftDoor.add(handleL);

            leftDoor.position.x = -w / 2;
            if (isOpen) leftDoor.rotation.y = -Math.PI / 2.5;
            group.add(leftDoor);

            // Right Door Leaf
            const rightDoor = new THREE.Group();
            const bodyR = new THREE.Mesh(getSharedGeometry(`doorBodyR_${w}_${h}`, () => new THREE.BoxGeometry(w / 2, h, 0.1)), doorMat);
            bodyR.position.set(-w / 4, h / 2, 0);
            rightDoor.add(bodyR);

            const panelR = new THREE.Mesh(getSharedGeometry(`doorPanelR_${w}_${h}`, () => new THREE.BoxGeometry(w / 3, h * 0.7, 0.13)), doorMat);
            panelR.position.set(-w / 4, h / 2, 0);
            rightDoor.add(panelR);

            const glassR = new THREE.Mesh(getSharedGeometry(`doorGlassR_${w}_${h}`, () => new THREE.BoxGeometry(w / 8, h * 0.6, 0.15)), glassMat);
            glassR.position.set(-w / 4, h / 2, 0);
            rightDoor.add(glassR);

            const handleR = new THREE.Mesh(getSharedGeometry('doorHandleStick', () => new THREE.CylinderGeometry(0.02, 0.02, 0.8)), handleMat);
            handleR.position.set(-w / 2 + 0.1, h / 2, 0.12);
            rightDoor.add(handleR);

            rightDoor.position.x = w / 2;
            if (isOpen) rightDoor.rotation.y = Math.PI / 2.5;
            group.add(rightDoor);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createBeamSet(parent, config) {
            const { w = 0.3, h = 4, dist = 5, isCircle = false, count = 4, style = 'default' } = config;
            const group = new THREE.Group();
            const beamMat = getSharedMaterial('beamMatLight', () => new THREE.MeshStandardMaterial({ color: 0xdddddd }));
            const beamGeo = getSharedGeometry(`beamGeo_${w}_${h}_${isCircle}`, () => {
                return isCircle ? new THREE.CylinderGeometry(w / 2, w / 2, h, 16) : new THREE.BoxGeometry(w, h, w);
            });

            let positions = [];
            if (style === 'X' || style === 'x') {
                for (let i = 0; i < count; i++) {
                    const px = count === 1 ? 0 : -dist / 2 + (i / (count - 1)) * dist;
                    positions.push({ px: px, pz: 0 });
                }
            } else if (style === 'Y' || style === 'y' || style === 'Z' || style === 'z') {
                for (let i = 0; i < count; i++) {
                    const pz = count === 1 ? 0 : -dist / 2 + (i / (count - 1)) * dist;
                    positions.push({ px: 0, pz: pz });
                }
            } else if (count === 4) {
                positions = [{ px: -dist / 2, pz: -dist / 2 }, { px: dist / 2, pz: -dist / 2 }, { px: -dist / 2, pz: dist / 2 }, { px: dist / 2, pz: dist / 2 }];
            } else {
                for (let i = 0; i < count; i++) {
                    const angle = (i / count) * Math.PI * 2;
                    positions.push({ px: Math.cos(angle) * (dist / 2), pz: Math.sin(angle) * (dist / 2) });
                }
            }
            positions.forEach(pos => {
                const beam = new THREE.Mesh(beamGeo, beamMat);
                beam.position.set(pos.px, h / 2, pos.pz);
                // or default square corners/radial distribution
                beam.castShadow = true;
                group.add(beam);
            });
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createBalcony(parent, config) {
            const { w = 4, d = 1.5, hasLeftRail = true, hasRightRail = true } = config;
            const group = new THREE.Group();

            const woodMat = getSharedMaterial('balconyWoodMat', () => new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
            const baseGeo = getSharedGeometry(`balconyBaseGeo_${w}_${d}`, () => new THREE.BoxGeometry(w, 0.15, d));
            const base = new THREE.Mesh(baseGeo, woodMat);
            group.add(base);

            const barGeo = getSharedGeometry('balconyBarGeo', () => new THREE.BoxGeometry(0.05, 1, 0.05));
            const frontBarCount = Math.ceil(w * 3);
            for (let i = 0; i <= frontBarCount; i++) {
                const bar = new THREE.Mesh(barGeo, woodMat);
                bar.position.set((-w / 2) + (i * w / frontBarCount), 0.5, d / 2);
                group.add(bar);
            }

            const railGeo = getSharedGeometry(`balconyRailGeo_${w}`, () => new THREE.BoxGeometry(w, 0.08, 0.08));
            const rail = new THREE.Mesh(railGeo, woodMat);
            rail.position.set(0, 1, d / 2);
            group.add(rail);

            const sideBarCount = Math.ceil(d * 3);
            if (hasLeftRail) {
                for (let i = 0; i <= sideBarCount; i++) {
                    const bar = new THREE.Mesh(barGeo, woodMat);
                    bar.position.set(-w / 2, 0.5, (-d / 2) + (i * d / sideBarCount));
                    group.add(bar);
                }
                const sideRailGeo = getSharedGeometry(`balconySideRailGeo_${d}`, () => new THREE.BoxGeometry(0.08, 0.1, d));
                const sideRail = new THREE.Mesh(sideRailGeo, woodMat);
                sideRail.position.set(-w / 2, 1, 0);
                group.add(sideRail);
            }
            if (hasRightRail) {
                for (let i = 0; i <= sideBarCount; i++) {
                    const bar = new THREE.Mesh(barGeo, woodMat);
                    bar.position.set(w / 2, 0.5, (-d / 2) + (i * d / sideBarCount));
                    group.add(bar);
                }
                const sideRailGeo = getSharedGeometry(`balconySideRailGeo_${d}`, () => new THREE.BoxGeometry(0.08, 0.1, d));
                const sideRail = new THREE.Mesh(sideRailGeo, woodMat);
                sideRail.position.set(w / 2, 1, 0);
                group.add(sideRail);
            }
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createRoof(parent, config) {
            const { w = 6, d = 8, h = 2, faces = 2, style = 'pitched', color = 0xfa6557 } = config;
            const group = new THREE.Group();

            const roofMat = getSharedMaterial(`srv2RoofMat_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.3 }));

            let actualFaces = faces;
            if (style === 'square') actualFaces = 4;
            else if (style === 'circle' || faces === 'circle') actualFaces = 32;
            else if (Number(faces) > 2) actualFaces = Number(faces);
            else if (style === 'pitched') actualFaces = 2;

            if (style === 'pitched') {
                if (actualFaces >= 4) {
                    // Hip Roof (4-faced pitched)
                    const oW = w + 1.0;
                    const oD = d + 1.0;

                    const slab = new THREE.Mesh(getSharedGeometry(`hipRoofSlab_${oW}_${oD}`, () => new THREE.BoxGeometry(oW, 0.1, oD)), roofMat);
                    group.add(slab);

                    const oMaxSize = Math.max(oW, oD);
                    const coneRadius = (oMaxSize / 2) * Math.sqrt(2);
                    const coneGeo = getSharedGeometry(`hipRoofCone_${coneRadius}_${h}`, () => new THREE.ConeGeometry(coneRadius, h, 4));
                    const cone = new THREE.Mesh(coneGeo, roofMat);
                    cone.rotation.y = Math.PI / 4;
                    cone.position.y = h / 2 + 0.05;
                    cone.scale.set(oW / oMaxSize, 1, oD / oMaxSize);
                    group.add(cone);

                    const addFaceSeams = (w_side, startZ, isXAxis) => {
                        const seams = new THREE.Group();
                        const numSeams = 12;
                        for (let i = 0; i <= numSeams; i++) {
                            const p = -w_side / 2 + (i / numSeams) * w_side;
                            const start = isXAxis ? new THREE.Vector3(p, 0.05, startZ) : new THREE.Vector3(startZ, 0.05, p);
                            const end = new THREE.Vector3(0, h + 0.05, 0);
                            const dist = start.distanceTo(end);
                            const seam = new THREE.Mesh(getSharedGeometry('srv2RoofSeam', () => new THREE.CylinderGeometry(0.02, 0.02, 1, 6)), roofMat);
                            seam.scale.y = dist;
                            seam.position.copy(start).lerp(end, 0.5);
                            seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
                            seams.add(seam);
                        }
                        return seams;
                    };
                    group.add(addFaceSeams(oW, oD / 2, true));
                    group.add(addFaceSeams(oW, -oD / 2, true));
                    group.add(addFaceSeams(oD, oW / 2, false));
                    group.add(addFaceSeams(oD, -oW / 2, false));
                } else {
                    // Standard 2-faced
                    const createS = (rz, ox) => {
                        const s = new THREE.Group();
                        const b = new THREE.Mesh(getSharedGeometry(`pitchRoofPart_${w}_${d}`, () => new THREE.BoxGeometry(w / 2 + 0.5, 0.1, d)), roofMat);
                        s.add(b);
                        for (let i = 0; i < 20; i++) {
                            const r = new THREE.Mesh(getSharedGeometry(`roofRidges_${w}_${d}`, () => new THREE.BoxGeometry(0.04, 0.06, d)), roofMat);
                            r.position.set((-w / 4) + (i * w / 38), 0.05, 0);
                            s.add(r);
                        }
                        s.rotation.z = rz;
                        s.position.x = ox;
                        return s;
                    };
                    group.add(createS(Math.PI / 6, -w / 4));
                    group.add(createS(-Math.PI / 6, w / 4));
                }
            } else if (style === 'flat') {
                group.add(new THREE.Mesh(getSharedGeometry(`flatRoof_${w}_${d}`, () => new THREE.BoxGeometry(w, 0.2, d)), roofMat));
            }

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createGable(parent, config) {
            const { w = 6, h = 1.5, t = 0.2, color = 0xeee8aa } = config;
            const group = new THREE.Group();

            const shapeKey = `gableShape_${w}_${h}_${t}`;
            const geometry = getSharedGeometry(shapeKey, () => {
                const shape = new THREE.Shape();
                shape.moveTo(-w / 2, 0);
                shape.lineTo(w / 2, 0);
                shape.lineTo(0, h);
                shape.lineTo(-w / 2, 0);
                const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
                g.translate(0, 0, -t / 2);
                return g;
            });

            const material = getSharedMaterial(`mat_gable_${color}`, () => new THREE.MeshStandardMaterial({ color: color }));
            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createStairs(parent, config) {
            const { steps = 3, w = 1.5, stepH = 0.17, stepD = 0.4, color = 0xeeeeee } = config;
            const group = new THREE.Group();
            const mat = getSharedMaterial(`mat_stairs_${color}`, () => new THREE.MeshStandardMaterial({ color: color }));
            const railMat = getSharedMaterial('railMatModern', () => new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.1 }));

            const stepGeo = getSharedGeometry(`stepGeo_${w}_${stepH}_${stepD}`, () => new THREE.BoxGeometry(w, stepH, stepD));
            for (let i = 0; i < steps; i++) {
                const step = new THREE.Mesh(stepGeo, mat);
                step.position.set(0, (i * stepH) + stepH / 2, i * stepD);
                step.castShadow = true;
                step.receiveShadow = true;
                group.add(step);
            }

            const railHeight = 0.8;
            const railT = 0.03;

            [-1, 1].forEach(side => {
                const curveKey = `railCurve_${w}_${steps}_${stepH}_${stepD}_${side}`;
                const railGeo = getSharedGeometry(curveKey, () => {
                    const curve = new THREE.CatmullRomCurve3([
                        new THREE.Vector3((w / 2 - 0.05) * side, railHeight, -stepD / 2),
                        new THREE.Vector3((w / 2 - 0.05) * side, (steps - 1) * stepH + railHeight, (steps - 1) * stepD + stepD / 2)
                    ]);
                    return new THREE.TubeGeometry(curve, 20, railT, 8, false);
                });
                const rail = new THREE.Mesh(railGeo, railMat);
                group.add(rail);

                const postGeoKey = (h) => `railPost_${railT}_${h}`;
                for (let i = 0; i < steps; i += 2) {
                    const h = railHeight + (i * stepH);
                    const postGeo = getSharedGeometry(postGeoKey(h), () => {
                        const g = new THREE.CylinderGeometry(railT, railT, h);
                        // g.translate(0, h/2, 0); // Already handled in position.set(..., h/2, ...)
                        return g;
                    });
                    const post = new THREE.Mesh(postGeo, railMat);
                    post.position.set((w / 2 - 0.05) * side, h / 2, i * stepD);
                    group.add(post);
                }
            });

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createWallVine(parent, config) {
            const { h = 2, w = 1.5, depth = 0.3, leafColor = 0x2d5a27, stemColor = 0x4d2a1a } = config;
            const group = new THREE.Group();
            group.userData.isTree = true;
            group.userData.treeType = 'standard';

            const leafMat = getSharedMaterial(`mat_leaf_${leafColor}`, () => new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.8 }));
            const stemMat = getSharedMaterial(`mat_stem_${stemColor}`, () => new THREE.MeshStandardMaterial({ color: stemColor, roughness: 0.9 }));
            const leafGeo = getSharedGeometry('leafGeoVine', () => new THREE.CylinderGeometry(0.15, 0.15, 0.02, 3));

            const vineCount = 6;
            for (let i = 0; i < vineCount; i++) {
                const startX = (Math.random() - 0.5) * w;
                const startZ = (Math.random() - 0.5) * depth;

                const points = [];
                const segments = 8;
                for (let j = 0; j <= segments; j++) {
                    const ratio = j / segments;
                    points.push(new THREE.Vector3(
                        startX + Math.sin(ratio * Math.PI * 2 + i) * 0.2,
                        -(ratio * h),
                        startZ + Math.cos(ratio * Math.PI * 2 + i) * 0.2
                    ));
                }

                const curve = new THREE.CatmullRomCurve3(points);
                const stemGeo = new THREE.TubeGeometry(curve, 20, 0.02, 8, false);
                const stem = new THREE.Mesh(stemGeo, stemMat);
                stem.userData.isTree = true;
                stem.userData.treeType = 'standard';
                group.add(stem);

                const leafDensity = 15;
                for (let k = 0; k < leafDensity; k++) {
                    const t = k / (leafDensity - 1);
                    const pos = curve.getPoint(t);
                    const tangent = curve.getTangent(t);

                    const leaf = new THREE.Mesh(leafGeo, leafMat);
                    const leafSize = 0.15 + Math.random() * 0.1;
                    leaf.scale.set(leafSize / 0.15, 1, leafSize / 0.15);

                    leaf.position.copy(pos);
                    leaf.lookAt(pos.clone().add(tangent));
                    leaf.rotateX(Math.PI / 2);
                    leaf.rotateZ(Math.random() * Math.PI);

                    group.add(leaf);
                }
            }

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createWoodGril(parent, config) {
            const { w = 4, h = 1.1, spacing = 0.15, thickness = 0.04, slatW = 0.04, color = 0x5d4037, startPost = true, midPost = false, endPost = false } = config;
            const group = new THREE.Group();
            const mat = getSharedMaterial(`mat_grill_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.6, metalness: 0.3 }));

            const railH = 0.05;
            const postW = 0.18;
            const railGeo = getSharedGeometry(`grillRail_${w}_${thickness}`, () => new THREE.BoxGeometry(w, railH, thickness * 1.5));

            const topRail = new THREE.Mesh(railGeo, mat);
            topRail.position.y = h - railH / 2;
            group.add(topRail);

            const bottomRail = new THREE.Mesh(railGeo, mat);
            bottomRail.position.y = railH / 2 + 0.05;
            group.add(bottomRail);

            const picketH = h - railH * 2 - 0.05;
            const picketGeo = getSharedGeometry(`grillPicket_${slatW}_${picketH}_${thickness}`, () => new THREE.BoxGeometry(slatW, picketH, thickness));

            const count = Math.floor(w / (slatW + spacing));
            const startX = -w / 2 + (w - (count * (slatW + spacing))) / 2 + slatW / 2;
            for (let i = 0; i < count; i++) {
                const px = startX + i * (slatW + spacing);
                if (midPost && Math.abs(px) < postW / 2) continue;
                const picket = new THREE.Mesh(picketGeo, mat);
                picket.position.set(px, h / 2 + 0.025, 0);
                group.add(picket);
            }

            const postGeo = getSharedGeometry(`grillPost_${postW}_${h + 0.1}`, () => new THREE.BoxGeometry(postW, h + 0.1, postW));
            const capGeo = getSharedGeometry(`grillCap_${postW}`, () => new THREE.BoxGeometry(postW * 1.3, 0.05, postW * 1.3));
            const baseGeo = getSharedGeometry(`grillBase_${postW}`, () => new THREE.BoxGeometry(postW * 1.3, 0.08, postW * 1.3));

            const addPost = (px) => {
                const postH = h + 0.1;
                const postRect = new THREE.Mesh(postGeo, mat);
                postRect.position.set(px, postH / 2, 0);
                group.add(postRect);
                const cap = new THREE.Mesh(capGeo, mat);
                cap.position.set(px, postH + 0.02, 0);
                group.add(cap);
                const base = new THREE.Mesh(baseGeo, mat);
                base.position.set(px, 0.04, 0);
                group.add(base);
            };
            if (startPost) addPost(-w / 2 - postW / 2);
            if (midPost) addPost(0);
            if (endPost) addPost(w / 2 + postW / 2);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createBed(parent, config) {
            const { w = 2, d = 2.5, h = 0.6 } = config;
            const group = new THREE.Group();
            const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
            frame.position.y = 0.2;
            group.add(frame);
            const mattress = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.3, d - 0.1), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
            mattress.position.y = 0.45;
            group.add(mattress);
            const pillowGeo = new THREE.BoxGeometry(w / 2.5, 0.1, 0.6);
            const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const p1 = new THREE.Mesh(pillowGeo, pillowMat);
            p1.position.set(-w / 4, 0.6, -d / 2 + 0.5);
            group.add(p1);
            const p2 = p1.clone();
            p2.position.x = w / 4;
            group.add(p2);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createTable(parent, config) {
            const { w = 1.2, d = 0.8, h = 0.75 } = config;
            const group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: 0x4d2a1a });
            const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat);
            top.position.y = h;
            group.add(top);
            const legGeo = new THREE.BoxGeometry(0.08, h, 0.08);
            const createLeg = (lx, lz) => {
                const leg = new THREE.Mesh(legGeo, mat);
                leg.position.set(lx, h / 2, lz);
                group.add(leg);
            };
            createLeg(-w / 2 + 0.1, -d / 2 + 0.1);
            createLeg(w / 2 - 0.1, -d / 2 + 0.1);
            createLeg(-w / 2 + 0.1, d / 2 - 0.1);
            createLeg(w / 2 - 0.1, d / 2 - 0.1);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createChair(parent, config) {
            const group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: 0x4d2a1a });
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), mat);
            seat.position.y = 0.45;
            group.add(seat);
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), mat);
            back.position.set(0, 0.75, -0.22);
            group.add(back);
            const legGeo = new THREE.BoxGeometry(0.05, 0.45, 0.05);
            for (let x = -1; x <= 1; x += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    const leg = new THREE.Mesh(legGeo, mat);
                    leg.position.set(x * 0.2, 0.225, z * 0.2);
                    group.add(leg);
                }
            }
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createTV(parent, config) {
            const { w = 1.2, h = 0.7 } = config;
            const group = new THREE.Group();
            const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            group.add(frame);
            const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, h * 0.9, 0.01), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x112233, roughness: 0 }));
            screen.position.z = 0.03;
            group.add(screen);
            const stand = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            stand.position.y = -h / 2 - 0.05;
            group.add(stand);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createLight(parent, config) {
            const group = new THREE.Group();
            const bulbGeo = new THREE.SphereGeometry(0.1, 16, 16);
            const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa });
            const bulb = new THREE.Mesh(bulbGeo, bulbMat);
            group.add(bulb);
            const pLight = new THREE.PointLight(0xffffaa, 1.2, 10);
            pLight.position.set(0, -0.2, 0);
            pLight.castShadow = true;
            group.add(pLight);
            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createPergola(parent, config) {
            const { w = 4, d = 4, spacing = 0.25, slatW = 0.08, thickness = 0.04, color = 0x5d4037 } = config;
            const group = new THREE.Group();
            const mat = new THREE.MeshStandardMaterial({ color: color });

            // Main Slats (Top)
            const count = Math.floor(d / (slatW + spacing));
            for (let i = 0; i <= count; i++) {
                const slat = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, slatW), mat);
                slat.position.z = -d / 2 + i * (slatW + spacing);
                group.add(slat);
            }

            // Supporting Cross Beams (Bottom)
            const beamCount = 3;
            for (let i = 0; i < beamCount; i++) {
                const beam = new THREE.Mesh(new THREE.BoxGeometry(slatW * 1.5, thickness * 2, d), mat);
                beam.position.x = -w / 2 + (i * w / (beamCount - 1));
                beam.position.y = -thickness;
                group.add(beam);
            }

            return srv2_finalizeMesh(group, parent, config);
        }

        function createFancyBuilding(parent, hScale = 1) {
            // Check cache for identical hScale
            const cacheKey = `fancy_${hScale}`;
            if (houseMeshCache.has(cacheKey)) {
                const cachedBGrp = houseMeshCache.get(cacheKey).clone();
                parent.add(cachedBGrp);
                return cachedBGrp;
            }

            const bGrp = new THREE.Group();
            const finalScale = 13 * hScale;
            bGrp.scale.set(finalScale, finalScale, finalScale);
            bGrp.position.y = 0.1;
            parent.add(bGrp);

            const mergeRegistry = new Map();
            const collect = (mesh) => {
                if (!mesh.isMesh) return;
                const mat = mesh.material;
                const mKey = mat.uuid;
                if (!mergeRegistry.has(mKey)) mergeRegistry.set(mKey, { mat: mat, geos: [] });

                let g = mesh.geometry.clone();
                g.applyMatrix4(mesh.matrixWorld);

                // Ensure compatibility for mergeBufferGeometries
                if (g.index) g = g.toNonIndexed();

                // Ensure UV and Normal attributes exist
                if (!g.attributes.uv) {
                    const uvs = new Float32Array(g.attributes.position.count * 2);
                    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                }
                if (!g.attributes.normal) g.computeVertexNormals();

                // Remove incompatible attributes that often cause merge failures
                const skip = ['position', 'normal', 'uv'];
                Object.keys(g.attributes).forEach(name => {
                    if (!skip.includes(name)) g.deleteAttribute(name);
                });

                mergeRegistry.get(mKey).geos.push(g);
            };

            // Use a temporary group to build the structure, then merge parts
            const tempParent = new THREE.Group();

            srv2_createBeamSet(tempParent, { dist: 6, h: 8, w: 0.4 });
            srv2_createBeamSet(tempParent, { x: -1.5, y: 0, z: -7.2, dist: 3, h: 8, w: 0.4, count: 2 });
            srv2_createBeamSet(tempParent, { x: 0, y: 0, z: -7.2, dist: 6, h: 4, w: 0.4, count: 1, isCircle: false });

            srv2_createFloor(tempParent, { x: 0, z: -2, y: 0, w: 11, d: 6.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createWall(tempParent, { x: 3, z: 0, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -3, z: 0, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: 3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createDoor(tempParent, { x: 3.2, y: .5, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Sawni placed directly in front of the door
            srv2_createSawni(tempParent, { x: 10, y: 0, z: -7, scale: 0.5 });

            srv2_createWall(tempParent, { x: 3, z: 0, y: 4, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -3, z: -2, y: 4, w: 10, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: 3, y: 4, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -1.5, z: -7.2, y: 4, w: 3, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: -5.2, y: 4, w: 4.5, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createFloor(tempParent, { x: 0, y: 4, z: -2, w: 11, d: 6.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createDoor(tempParent, { x: 3.2, y: 4.3, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: true });
            srv2_createDoor(tempParent, { x: 0.2, y: 4.3, z: -5.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Furniture
            srv2_createBed(tempParent, { x: -1.5, y: 4, z: -1.5, w: 2, d: 2.5 });
            srv2_createTable(tempParent, { x: 1.5, y: 4, z: -6.5, w: 1, d: 0.8 });
            srv2_createChair(tempParent, { x: 1.5, y: 4, z: -6.0, ry: Math.PI });
            srv2_createTV(tempParent, { x: -1.5, y: 4.8, z: 2, ry: Math.PI });
            srv2_createLight(tempParent, { x: 0, y: 7.8, z: 0 });

            srv2_createFloor(tempParent, { x: 0, y: 8, z: 0, w: 6, d: 6.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: -1.5, y: 8, z: -5.2, w: 4.5, d: 3.5, color: 0xfcf286, ry: Math.PI / 2 });

            srv2_createStairs(tempParent, { x: 4.2, z: 0, y: 0, ry: -Math.PI / 2, w: 1.8, steps: 3 });
            srv2_createWindow(tempParent, { x: 1.0, y: 6, z: 3.3, w: 2, h: 1.5 });
            srv2_createWindow(tempParent, { x: 1.0, y: 2, z: 3.3, w: 2, h: 1.5 });
            srv2_createBalcony(tempParent, { x: 3.4, y: 4.2, z: 0, w: 3.5, ry: Math.PI / 2 });
            srv2_createRoof(tempParent, { x: -0, z: 0, y: 9, w: 6.4, d: 7.2, ry: Math.PI / 2, style: 'pitched' });
            srv2_createGable(tempParent, { x: 3.3, y: 8.1, z: 0, w: 6, h: 1.7, ry: Math.PI / 2 });
            srv2_createGable(tempParent, { x: -3.3, y: 8.1, z: 0, w: 6, h: 1.7, ry: Math.PI / 2 });

            srv2_createRoof(tempParent, { x: -1.5, z: -4.3, y: 8.7, w: 3.6, d: 6.2, ry: Math.PI / 1, style: 'pitched' });
            srv2_createGable(tempParent, { x: -1.5, y: 8.15, z: -1.5, w: 3.1, h: 0.9 });
            srv2_createGable(tempParent, { x: -1.5, y: 8.15, z: -7.2, w: 3.1, h: 0.9 });

            srv2_createWallVine(tempParent, { x: 3.5, y: 8.5, z: 2.4, h: 7, w: 1.0, ry: Math.PI / 2 });
            srv2_createWoodGril(tempParent, { x: 3.1, y: 4.15, z: -5.4, w: 3.7, h: 1.2, ry: -Math.PI / 2, startPost: true, midPost: true, endPost: true });
            srv2_createWoodGril(tempParent, { x: 1.9, y: 4.15, z: -7.35, w: 2.6, h: 1.2, startPost: true, midPost: true, endPost: false });
            srv2_createPergola(tempParent, { x: 1.5, y: 7.5, z: -5.2, w: 2.6, d: 4, color: 0x5d4037 });

            // Final optimization: Traverse and merge geometries by material
            tempParent.updateMatrixWorld(true);
            tempParent.traverse(collect);

            mergeRegistry.forEach(group => {
                if (group.geos.length > 0) {
                    const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(group.geos);
                    const mesh = new THREE.Mesh(mergedGeo, group.mat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.matrixAutoUpdate = false;
                    bGrp.add(mesh);
                }
            });

            // Cache the result
            houseMeshCache.set(cacheKey, bGrp.clone());

            return bGrp;
        }

        function createFancyBuildingV2(parent, hScale = 1) {
            // Check cache for identical hScale
            const cacheKey = `fancyV2_${hScale}`;
            if (houseMeshCache.has(cacheKey)) {
                const cachedBGrp = houseMeshCache.get(cacheKey).clone();
                parent.add(cachedBGrp);
                return cachedBGrp;
            }

            const bGrp = new THREE.Group();
            const finalScale = 13 * hScale;
            bGrp.scale.set(finalScale, finalScale, finalScale);
            bGrp.position.y = 0.1;
            parent.add(bGrp);

            const mergeRegistry = new Map();
            const collect = (mesh) => {
                if (!mesh.isMesh) return;
                const mat = mesh.material;
                const mKey = mat.uuid;
                if (!mergeRegistry.has(mKey)) mergeRegistry.set(mKey, { mat: mat, geos: [] });

                let g = mesh.geometry.clone();
                g.applyMatrix4(mesh.matrixWorld);

                // Ensure compatibility for mergeBufferGeometries
                if (g.index) g = g.toNonIndexed();

                // Ensure UV and Normal attributes exist
                if (!g.attributes.uv) {
                    const uvs = new Float32Array(g.attributes.position.count * 2);
                    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                }
                if (!g.attributes.normal) g.computeVertexNormals();

                // Remove incompatible attributes that often cause merge failures
                const skip = ['position', 'normal', 'uv'];
                Object.keys(g.attributes).forEach(name => {
                    if (!skip.includes(name)) g.deleteAttribute(name);
                });

                mergeRegistry.get(mKey).geos.push(g);
            };

            const tempParent = new THREE.Group();

            // Ground floor
            srv2_createBeamSet(tempParent, { dist: 6, h: 8, w: 0.4 });
            srv2_createBeamSet(tempParent, { x: 0, y: 0, z: -10.2, dist: 6, h: 8, w: 0.4, count: 4 });
            srv2_createFloor(tempParent, { x: 0, z: -5.1, y: 0, w: 16.8, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createWall(tempParent, { x: 3, z: 0, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 3, z: -10.2, w: 5.8, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -7, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -13.2, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -3, z: -5.1, w: 16.4, h: 8, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: 3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createDoor(tempParent, { x: 3.2, y: .5, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });
            srv2_createDoor(tempParent, { x: 3.2, y: .5, z: -10.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Floor two
            srv2_createWall(tempParent, { x: 3, y: 4, z: -10.2, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -7.2, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -13.2, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 3, z: 0, y: 4, w: 6, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -3, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -3, z: -2, y: 4, w: 10, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: 3, y: 4, w: 6, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: -1.5, z: -7.2, y: 4, w: 3, h: 4, color: 0xeee8aa });
            srv2_createWall(tempParent, { x: 0, z: -5.2, y: 4, w: 4.5, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createFloor(tempParent, { x: 0, y: 4, z: -5.1, w: 16.8, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: 0, y: 8, z: -10.2, w: 6.5, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createDoor(tempParent, { x: 3.2, y: 4.3, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: true });
            srv2_createDoor(tempParent, { x: 3.2, y: 4.3, z: -10.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: true });
            srv2_createDoor(tempParent, { x: 0.2, y: 4.3, z: -5.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Furniture
            srv2_createBed(tempParent, { x: -1.5, y: 4, z: -1.5, w: 2, d: 2.5 });
            srv2_createTable(tempParent, { x: 1.5, y: 4, z: -6.5, w: 1, d: 0.8 });
            srv2_createChair(tempParent, { x: 1.5, y: 4, z: -6.0, ry: Math.PI });
            srv2_createTV(tempParent, { x: -1.5, y: 4.8, z: 2, ry: Math.PI });
            srv2_createLight(tempParent, { x: 0, y: 7.8, z: 0 });

            // Main Gate Area
            srv2_createFloor(tempParent, { x: 5.2, y: 4, z: -5.1, w: 4.6, d: 4.2, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: 5.2, y: 0, z: -5.1, w: 4.6, d: 4.2, ry: Math.PI / 2 });
            srv2_createBeamSet(tempParent, { x: 7, y: 0, z: -5.1, dist: 4, h: 8.2, w: 0.4, count: 2, style: 'Y' });
            srv2_createRoof(tempParent, { x: 5.2, z: -5.1, y: 8.2, w: 4.8, d: 4.8, h: 2, ry: Math.PI / 2, faces: 4, style: 'pitched' });
            srv2_createWall(tempParent, { x: 3, z: -5.2, w: 5.8, h: 4, ry: Math.PI / 2, color: 0xeee8aa });
            srv2_createMainDoor(tempParent, { x: 3.2, y: 0, z: -5.2, w: 2.6, h: 2.6, ry: Math.PI / 2, isOpen: false });

            // Sawni placed directly in front of the door
            srv2_createSawni(tempParent, { x: 8.5, y: 0, z: -20, scale: 0.5 });

            // Fences
            srv2_createWoodGril(tempParent, { x: 7.0, y: 4.15, z: -5.2, w: 4, h: 1.2, ry: -Math.PI / 2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: 5.0, y: 4.15, z: -7.1, w: 4, h: 1.2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: 5.0, y: 4.15, z: -3.1, w: 4, h: 1.2, startPost: false, midPost: true, endPost: false });

            // Third Floor
            srv2_createFloor(tempParent, { x: 0, y: 8, z: 0, w: 6, d: 6.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: -1.5, y: 8, z: -5.2, w: 4.5, d: 3.5, color: 0xfcf286, ry: Math.PI / 2 });

            srv2_createStairs(tempParent, { x: 4.2, z: 0, y: 0, ry: -Math.PI / 2, w: 1.8, steps: 3 });
            srv2_createStairs(tempParent, { x: 4.2, z: -10.2, y: 0, ry: -Math.PI / 2, w: 1.8, steps: 3 });

            // Fancy Windows
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 6.4, z: 3.25, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 2.4, z: 3.25, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 6.4, z: -13.4, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 2.4, z: -13.4, w: 1.2, h: 1.8, hasTree: false });

            srv2_createBalcony(tempParent, { x: 3.4, y: 4.2, z: 0, w: 3.5, ry: Math.PI / 2 });
            srv2_createBalcony(tempParent, { x: 3.4, y: 4.2, z: -10.2, w: 3.5, ry: Math.PI / 2 });

            // Roofs
            srv2_createRoof(tempParent, { x: -0, z: 0, y: 9, w: 6.4, d: 7.2, ry: Math.PI / 2, style: 'pitched' });
            srv2_createRoof(tempParent, { x: -0, z: -10.2, y: 9.0, w: 6.8, d: 7.2, ry: Math.PI / 2, style: 'pitched' });
            srv2_createGable(tempParent, { x: 3.3, y: 8.1, z: 0, w: 6, h: 1.7, ry: Math.PI / 2 });
            srv2_createGable(tempParent, { x: 3.3, y: 8.1, z: -10.2, w: 6, h: 1.7, ry: Math.PI / 2 });
            srv2_createGable(tempParent, { x: -3.3, y: 8.1, z: 0, w: 6, h: 1.7, ry: Math.PI / 2 });
            srv2_createGable(tempParent, { x: -3.3, y: 8.1, z: -10.2, w: 6, h: 1.7, ry: Math.PI / 2 });

            srv2_createRoof(tempParent, { x: -1.5, z: -4.3, y: 8.7, w: 3.6, d: 9, ry: Math.PI / 1, style: 'pitched' });
            srv2_createGable(tempParent, { x: -1.5, y: 8.15, z: -1.5, w: 3.1, h: 0.9 });
            srv2_createGable(tempParent, { x: -1.5, y: 8.15, z: -7.2, w: 3.1, h: 0.9 });

            srv2_createWallVine(tempParent, { x: 3.5, y: 8.5, z: 2.4, h: 7, w: 1.0, ry: Math.PI / 2 });
            srv2_createPergola(tempParent, { x: 1.5, y: 7.5, z: -5.2, w: 2.6, d: 4, color: 0x5d4037 });

            tempParent.updateMatrixWorld(true);
            tempParent.traverse(collect);

            mergeRegistry.forEach(group => {
                if (group.geos.length > 0) {
                    const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(group.geos);
                    const mesh = new THREE.Mesh(mergedGeo, group.mat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.matrixAutoUpdate = false;
                    bGrp.add(mesh);
                }
            });

            houseMeshCache.set(cacheKey, bGrp.clone());
            return bGrp;
        }

        function createFancyBuildingV3(parent, hScale = 1) {
            // Check cache for identical hScale
            const cacheKey = `fancyV3_${hScale}`;
            if (houseMeshCache.has(cacheKey)) {
                const cachedBGrp = houseMeshCache.get(cacheKey).clone();
                parent.add(cachedBGrp);
                return cachedBGrp;
            }

            const bGrp = new THREE.Group();
            const finalScale = 13 * hScale;
            bGrp.scale.set(finalScale, finalScale, finalScale);
            bGrp.position.y = 0.1;
            parent.add(bGrp);

            const mergeRegistry = new Map();
            const collect = (mesh) => {
                if (!mesh.isMesh) return;
                const mat = mesh.material;
                const mKey = mat.uuid;
                if (!mergeRegistry.has(mKey)) mergeRegistry.set(mKey, { mat: mat, geos: [] });

                let g = mesh.geometry.clone();
                g.applyMatrix4(mesh.matrixWorld);
                if (g.index) g = g.toNonIndexed();
                if (!g.attributes.uv) {
                    const uvs = new Float32Array(g.attributes.position.count * 2);
                    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                }
                if (!g.attributes.normal) g.computeVertexNormals();
                const skip = ['position', 'normal', 'uv'];
                Object.keys(g.attributes).forEach(name => {
                    if (!skip.includes(name)) g.deleteAttribute(name);
                });
                mergeRegistry.get(mKey).geos.push(g);
            };

            const tempParent = new THREE.Group();

            // Logic from customeHouseBuilding.html
            srv2_createBeamSet(tempParent, { dist: 6, h: 8, w: 0.4 });
            srv2_createBeamSet(tempParent, { x: 0, y: 0, z: -10.2, dist: 6, h: 8, w: 0.4, count: 4 });

            // Ground floor
            srv2_createFloor(tempParent, { x: 0, z: -5.1, y: 0, w: 16.8, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createWall(tempParent, { x: 3, z: 0, w: 6, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 3, z: -10.2, w: 5.8, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -3, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -7, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 0, z: -13.2, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: -3, z: -5.1, w: 16.4, h: 8, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, z: 3, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createDoor(tempParent, { x: 3.2, y: .5, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });
            srv2_createDoor(tempParent, { x: 3.2, y: .5, z: -10.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Floor two
            srv2_createWall(tempParent, { x: 3, y: 4, z: -10.2, w: 6, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -7.2, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -13.2, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 3, z: 0, y: 4, w: 6, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, y: 4, z: -3, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: -3, z: -2, y: 4, w: 10, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, z: 3, y: 4, w: 6, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: -1.5, z: -7.2, y: 4, w: 3, h: 4, color: 0xb8aaa6 });
            srv2_createWall(tempParent, { x: 0, z: -5.2, y: 4, w: 4.5, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createFloor(tempParent, { x: 0, y: 4, z: -5.1, w: 16.8, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: 0, y: 8, z: -10.2, w: 6.5, d: 6.6, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createDoor(tempParent, { x: 3.2, y: 4.3, z: 0, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: true });
            srv2_createDoor(tempParent, { x: 3.2, y: 4.3, z: -10.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: true });
            srv2_createDoor(tempParent, { x: 0.2, y: 4.3, z: -5.2, w: 1.2, h: 2.2, ry: Math.PI / 2, isOpen: false });

            // Furniture
            srv2_createBed(tempParent, { x: -1.5, y: 4, z: -1.5, w: 2, d: 2.5 });
            srv2_createTable(tempParent, { x: 1.5, y: 4, z: -6.5, w: 1, d: 0.8 });
            srv2_createChair(tempParent, { x: 1.5, y: 4, z: -6.0, ry: Math.PI });
            srv2_createTV(tempParent, { x: -1.5, y: 4.8, z: 2, ry: Math.PI });
            srv2_createLight(tempParent, { x: 0, y: 7.8, z: 0 });

            // Main Gate Area
            srv2_createFloor(tempParent, { x: 5.2, y: 4, z: -5.1, w: 4.6, d: 4.2, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: 5.2, y: 0, z: -5.1, w: 4.6, d: 4.2, ry: Math.PI / 2 });
            srv2_createBeamSet(tempParent, { x: 7, y: 0, z: -5.1, dist: 4, h: 8.2, w: 0.4, count: 2, style: 'Y' });
            srv2_createRoof(tempParent, { x: 5.2, z: -5.1, y: 8.2, w: 4.8, d: 4.8, h: 2, ry: Math.PI / 2, faces: 40, style: 'flat', color: '0xACAD99' });
            srv2_createWall(tempParent, { x: 3, z: -5.2, w: 5.8, h: 4, ry: Math.PI / 2, color: 0xb8aaa6 });
            srv2_createMainDoor(tempParent, { x: 3.12, y: 0, z: -5.2, w: 2.6, h: 2.6, ry: Math.PI / 2, isOpen: false });

            // Sawni placed directly in front of the door
            srv2_createSawni(tempParent, { x: 8.5, y: 0, z: -20.2, scale: 0.5 });

            // Stylish Fences
            srv2_createWoodGril(tempParent, { x: 5.0, y: 4.15, z: -3.1, w: 4, h: 1.2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: 7.0, y: 4.15, z: -5.2, w: 4, h: 1.2, ry: -Math.PI / 2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: 7.4, y: 8.15, z: -5.1, w: 4.4, h: 1.2, ry: -Math.PI / 2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: 5.3, y: 8.15, z: -7.3, w: 4, h: 1.2, startPost: true, midPost: true, endPost: true });
            srv2_createWoodGril(tempParent, { x: 5.3, y: 8.15, z: -3.0, w: 4, h: 1.2, startPost: true, midPost: true, endPost: true });
            srv2_createWoodGril(tempParent, { x: -3.3, y: 8.15, z: -5.2, w: 15.8, h: 1.2, ry: -Math.PI / 2, startPost: true, midPost: true, endPost: true });
            srv2_createWoodGril(tempParent, { x: 3.2, y: 8.15, z: -0.2, w: 5.8, h: 1.2, ry: -Math.PI / 2, startPost: false, midPost: true, endPost: true });
            srv2_createWoodGril(tempParent, { x: 3.2, y: 8.15, z: -10.2, w: 5.8, h: 1.2, ry: -Math.PI / 2, startPost: true, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: -.1, y: 8.15, z: 2.8, w: 6.5, h: 1.2, startPost: false, midPost: true, endPost: false });
            srv2_createWoodGril(tempParent, { x: -.1, y: 8.15, z: -13.2, w: 6.5, h: 1.2, startPost: false, midPost: true, endPost: false });

            // Third Floor
            srv2_createFloor(tempParent, { x: 0, y: 8, z: 0, w: 6, d: 6.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createFloor(tempParent, { x: -1.5, y: 8, z: -5.2, w: 4.5, d: 3.5, color: 0xfcf286, ry: Math.PI / 2 });
            srv2_createStairs(tempParent, { x: 4.2, z: 0, y: 0, ry: -Math.PI / 2, w: 1.8, steps: 3 });
            srv2_createStairs(tempParent, { x: 4.2, z: -10.2, y: 0, ry: -Math.PI / 2, w: 1.8, steps: 3 });

            // Arched Windows
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 6.4, z: 3.25, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 2.4, z: 3.25, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 6.4, z: -13.4, w: 1.2, h: 1.8, hasTree: false });
            srv2_createFancyWindow(tempParent, { x: 1.0, y: 2.4, z: -13.4, w: 1.2, h: 1.8, hasTree: false });

            srv2_createBalcony(tempParent, { x: 3.4, y: 4.2, z: 0, w: 3.5, ry: Math.PI / 2 });
            srv2_createBalcony(tempParent, { x: 3.4, y: 4.2, z: -10.2, w: 3.5, ry: Math.PI / 2 });

            // Roofs
            srv2_createRoof(tempParent, { x: -0, z: -10.2, y: 8.2, w: 6.8, d: 7.2, ry: Math.PI / 2, style: 'flat', color: '0xACAD99' });
            srv2_createRoof(tempParent, { x: -0, z: 0, y: 8.2, w: 6.4, d: 7.2, ry: Math.PI / 2, style: 'flat', color: '0xACAD99' });
            srv2_createRoof(tempParent, { x: -0, z: -4.3, y: 8.2, w: 7.2, d: 9, ry: Math.PI / 1, style: 'flat', color: '0xACAD99' });

            // Pergola
            srv2_createPergola(tempParent, { x: 1.5, y: 7.5, z: -5.2, w: 2.6, d: 4, color: 0x5d4037 });

            tempParent.updateMatrixWorld(true);
            tempParent.traverse(collect);

            mergeRegistry.forEach(group => {
                if (group.geos.length > 0) {
                    const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries(group.geos);
                    const mesh = new THREE.Mesh(mergedGeo, group.mat);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    mesh.matrixAutoUpdate = false;
                    bGrp.add(mesh);
                }
            });

            houseMeshCache.set(cacheKey, bGrp.clone());
            return bGrp;
        }


        // --- PARK EQUIPMENT SYSTEM (srv2) FROM park.html ---

        function srv2_createParkBench(parent, config) {
            const { w = 2, h = 0.5, d = 0.6, color = 0x5d4037 } = config;
            const group = new THREE.Group();
            const mat = getSharedMaterial(`mat_bench_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 }));
            const ironMat = getSharedMaterial('mat_iron_bench', () => new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 }));

            const slatGeo = getSharedGeometry(`benchSlat_${w}`, () => new THREE.BoxGeometry(w, 0.04, 0.12));
            const backSlatGeo = getSharedGeometry(`benchBackSlat_${w}`, () => new THREE.BoxGeometry(w, 0.12, 0.04));

            // Seat (slats)
            for (let i = 0; i < 4; i++) {
                const slat = new THREE.Mesh(slatGeo, mat);
                slat.position.set(0, h, -d / 2 + 0.1 + i * 0.14);
                group.add(slat);
            }

            // Backrest (slats)
            for (let i = 0; i < 3; i++) {
                const slat = new THREE.Mesh(backSlatGeo, mat);
                slat.position.set(0, h + 0.2 + i * 0.14, -d / 2);
                slat.rotation.x = -0.2;
                group.add(slat);
            }

            // Legs (Iron frames)
            const legGeo = getSharedGeometry(`benchLeg_${h}_${d}`, () => new THREE.BoxGeometry(0.1, h, d));
            const backSupportGeo = getSharedGeometry('benchBackSupport', () => new THREE.BoxGeometry(0.08, 0.6, 0.08));

            const createLegFrame = (lx) => {
                const frame = new THREE.Mesh(legGeo, ironMat);
                frame.position.set(lx, h / 2, 0.05);
                group.add(frame);

                const backSupport = new THREE.Mesh(backSupportGeo, ironMat);
                backSupport.position.set(lx, h + 0.25, -d / 2 + 0.05);
                group.add(backSupport);
            };
            createLegFrame(-w / 2 + 0.2);
            createLegFrame(w / 2 - 0.2);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkSwing(parent, config) {
            const { w = 3, h = 3.5, color = 0x334155, seatColor = 0xef4444 } = config;
            const group = new THREE.Group();
            const frameMat = getSharedMaterial(`mat_swingFrame_${color}`, () => new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.2 }));
            const ropeMat = getSharedMaterial('mat_swingRope', () => new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9 }));
            const seatMat = getSharedMaterial(`mat_swingSeat_${seatColor}`, () => new THREE.MeshStandardMaterial({ color: seatColor }));

            const postGeo = getSharedGeometry(`swingPost_${h}`, () => new THREE.CylinderGeometry(0.08, 0.12, h + 0.5, 12));
            const createAFrame = (px) => {
                const left = new THREE.Mesh(postGeo, frameMat);
                left.position.set(px, h / 2, 0.6);
                left.rotation.x = 0.2;
                group.add(left);

                const right = new THREE.Mesh(postGeo, frameMat);
                right.position.set(px, h / 2, -0.6);
                right.rotation.x = -0.2;
                group.add(right);
            };
            createAFrame(-w / 2);
            createAFrame(w / 2);

            const topBarGeo = getSharedGeometry(`swingTopBar_${w}`, () => new THREE.CylinderGeometry(0.1, 0.1, w + 0.4, 12));
            const topBar = new THREE.Mesh(topBarGeo, frameMat);
            topBar.rotation.z = Math.PI / 2;
            topBar.position.y = h;
            group.add(topBar);

            const seatGroup = new THREE.Group();
            const seatGeo = getSharedGeometry('swingSeat', () => new THREE.BoxGeometry(0.8, 0.05, 0.4));
            const seat = new THREE.Mesh(seatGeo, seatMat);
            seatGroup.add(seat);

            const chainGeo = getSharedGeometry(`swingChain_${h}`, () => new THREE.CylinderGeometry(0.015, 0.015, h - 0.6, 8));
            const c1 = new THREE.Mesh(chainGeo, ropeMat);
            c1.position.set(-0.3, h / 2 - 0.3, 0);
            seatGroup.add(c1);
            const c2 = new THREE.Mesh(chainGeo, ropeMat);
            c2.position.set(0.3, h / 2 - 0.3, 0);
            seatGroup.add(c2);

            seatGroup.position.set(0, 0.6, 0);
            group.add(seatGroup);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkSlide(parent, config) {
            const { h = 2.2, color = 0x3b82f6, frameColor = 0xe2e8f0 } = config;
            const group = new THREE.Group();
            const slideMat = getSharedMaterial(`mat_slideSurface_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.4 }));
            const frameMat = getSharedMaterial(`mat_slideFrame_${frameColor}`, () => new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.8 }));

            const platformGeo = getSharedGeometry('slidePlatform', () => new THREE.BoxGeometry(1.2, 0.1, 1.2));
            const platform = new THREE.Mesh(platformGeo, frameMat);
            platform.position.y = h;
            group.add(platform);

            const stepGeo = getSharedGeometry('slideStep', () => new THREE.BoxGeometry(1.0, 0.06, 0.15));
            const steps = 8;
            for (let i = 0; i < steps; i++) {
                const step = new THREE.Mesh(stepGeo, frameMat);
                step.position.set(0, (i / steps) * h, -0.7);
                group.add(step);
            }
            const postGeo = getSharedGeometry(`slidePost_${h}`, () => new THREE.CylinderGeometry(0.06, 0.06, h + 1, 8));
            const p1 = new THREE.Mesh(postGeo, frameMat); p1.position.set(-0.5, h / 2, -0.8); group.add(p1);
            const p2 = new THREE.Mesh(postGeo, frameMat); p2.position.set(0.5, h / 2, -0.8); group.add(p2);

            const curveKey = `slideCurve_${h}`;
            const slideGeo = getSharedGeometry(curveKey, () => {
                const curve = new THREE.QuadraticBezierCurve3(
                    new THREE.Vector3(0, h, 0.6),
                    new THREE.Vector3(0, h * 0.8, 2.5),
                    new THREE.Vector3(0, 0.1, 4.5)
                );
                return new THREE.TubeGeometry(curve, 32, 0.5, 12, false);
            });
            const slideMesh = new THREE.Mesh(slideGeo, slideMat);
            slideMesh.scale.set(1.5, 0.4, 1);
            group.add(slideMesh);

            const p3 = new THREE.Mesh(postGeo, frameMat); p3.position.set(-0.5, h / 2, 0.5); group.add(p3);
            const p4 = new THREE.Mesh(postGeo, frameMat); p4.position.set(0.5, h / 2, 0.5); group.add(p4);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkSeesaw(parent, config) {
            const { w = 5, color = 0xf59e0b } = config;
            const group = new THREE.Group();
            const boardMat = getSharedMaterial(`mat_seesawBoard_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 }));
            const pivotMat = getSharedMaterial('mat_seesawPivot', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 }));

            const pivotBaseGeo = getSharedGeometry('seesawPivotBase', () => new THREE.CylinderGeometry(0.1, 0.15, 0.8, 12));
            const pivotBase = new THREE.Mesh(pivotBaseGeo, pivotMat);
            pivotBase.position.y = 0.4;
            group.add(pivotBase);

            const pivotBarGeo = getSharedGeometry('seesawPivotBar', () => new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12));
            const pivotBar = new THREE.Mesh(pivotBarGeo, pivotMat);
            pivotBar.rotation.z = Math.PI / 2;
            pivotBar.position.y = 0.8;
            group.add(pivotBar);

            const boardGeo = getSharedGeometry(`seesawBoard_${w}`, () => new THREE.BoxGeometry(w, 0.08, 0.4));
            const board = new THREE.Mesh(boardGeo, boardMat);
            board.position.y = 0.85;
            board.rotation.z = Math.PI / 10;
            group.add(board);

            const seatGeo = getSharedGeometry('seesawSeat', () => new THREE.BoxGeometry(0.5, 0.05, 0.5));
            const handleGeo = getSharedGeometry('seesawHandle', () => new THREE.TorusGeometry(0.15, 0.02, 8, 16, Math.PI));

            const createEnd = (endX, rot) => {
                const handle = new THREE.Mesh(handleGeo, pivotMat);
                handle.position.set(endX - (endX > 0 ? 0.4 : -0.4), 1.05 + (endX * Math.tan(rot)), 0);
                handle.rotation.z = Math.PI / 2;
                group.add(handle);
            };
            createEnd(-w / 2 + 0.3, Math.PI / 10);
            createEnd(w / 2 - 0.3, Math.PI / 10);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkLamp(parent, config) {
            const { h = 4.5, color = 0x1e293b, emissive = 0xfff0c0 } = config;
            const group = new THREE.Group();
            const postMat = getSharedMaterial(`mat_lampPost_${color}`, () => new THREE.MeshStandardMaterial({ color: color, metalness: 0.9, roughness: 0.1 }));
            const glassMat = getSharedMaterial(`mat_lampGlass_${emissive}`, () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, emissive: emissive, emissiveIntensity: 1 }));

            const poleGeo = getSharedGeometry(`lampPole_${h}`, () => new THREE.CylinderGeometry(0.06, 0.12, h, 12));
            const pole = new THREE.Mesh(poleGeo, postMat);
            pole.position.y = h / 2;
            group.add(pole);

            const baseGeo = getSharedGeometry('lampBase', () => new THREE.CylinderGeometry(0.25, 0.35, 0.4, 8));
            const base = new THREE.Mesh(baseGeo, postMat);
            base.position.y = 0.2;
            group.add(base);

            const headGeo = getSharedGeometry('lampHead', () => new THREE.BoxGeometry(0.5, 0.7, 0.5));
            const head = new THREE.Mesh(headGeo, glassMat);
            head.name = 'lampBulb';
            head.position.y = h + 0.35;
            group.add(head);

            const capGeo = getSharedGeometry('lampCap', () => new THREE.CylinderGeometry(0.01, 0.4, 0.2, 4));
            const cap = new THREE.Mesh(capGeo, postMat);
            cap.position.y = h + 0.7;
            cap.rotation.y = Math.PI / 4;
            group.add(cap);

            const coneGeo = getSharedGeometry('lampConeGeo', () => new THREE.CylinderGeometry(0, 2.5, 5, 16));
            const coneMat = getSharedMaterial('lampConeMat', () => new THREE.MeshBasicMaterial({ color: emissive, transparent: true, opacity: 0, depthWrite: false }));
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.name = 'lampCone';
            cone.position.set(0, h - 2.15, 0);
            group.add(cone);

            const pLight = new THREE.PointLight(emissive, 2, 12);
            pLight.name = 'parkLampLight';
            pLight.position.y = h + 0.35;
            pLight.castShadow = true;
            group.add(pLight);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkRoundabout(parent, config) {
            const { r = 1.8, color = 0x10b981 } = config;
            const group = new THREE.Group();
            const mat = getSharedMaterial(`mat_roundabout_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 }));
            const railMat = getSharedMaterial('mat_roundaboutRail', () => new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 }));

            const baseGeo = getSharedGeometry(`roundaboutBase_${r}`, () => new THREE.CylinderGeometry(r, r, 0.1, 32));
            const base = new THREE.Mesh(baseGeo, mat);
            base.position.y = 0.15;
            group.add(base);

            const railGeo = getSharedGeometry('roundaboutRail', () => new THREE.TorusGeometry(0.6, 0.04, 8, 16, Math.PI));
            for (let i = 0; i < 4; i++) {
                const angle = (i / 4) * Math.PI * 2;
                const rail = new THREE.Mesh(railGeo, railMat);
                rail.position.set(Math.cos(angle) * (r * 0.6), 0.75, Math.sin(angle) * (r * 0.6));
                rail.rotation.y = angle;
                rail.rotation.z = Math.PI / 2;
                group.add(rail);
            }

            const poleGeo = getSharedGeometry('roundaboutPole', () => new THREE.CylinderGeometry(0.1, 0.1, 1.2, 12));
            const pole = new THREE.Mesh(poleGeo, railMat);
            pole.position.y = 0.6;
            group.add(pole);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkFountain(parent, config) {
            const { r = 2.5, levels = 3, color = 0xe2e8f0 } = config;
            const group = new THREE.Group();
            const stoneMat = getSharedMaterial(`mat_fountainStone_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 }));
            const waterMat = getSharedMaterial('mat_fountainWater', () => new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.7, metalness: 0.5 }));

            for (let i = 0; i < levels; i++) {
                const levelR = r * (1 - i * 0.3);
                const levelH = 0.4;
                const bowlGeo = getSharedGeometry(`fountainBowl_${levelR}`, () => new THREE.CylinderGeometry(levelR, levelR * 0.8, 0.4, 16));
                const bowl = new THREE.Mesh(bowlGeo, stoneMat);
                bowl.position.y = i * 0.8 + levelH / 2;
                group.add(bowl);

                const waterGeo = getSharedGeometry(`fountainWater_${levelR}`, () => new THREE.CylinderGeometry(levelR - 0.1, levelR - 0.1, 0.05, 16));
                const water = new THREE.Mesh(waterGeo, waterMat);
                water.name = 'fountainWater';
                water.position.y = i * 0.8 + levelH - 0.02;
                group.add(water);

                if (i < levels - 1) {
                    const columnGeo = getSharedGeometry('fountainColumn', () => new THREE.CylinderGeometry(0.2, 0.25, 0.8, 8));
                    const column = new THREE.Mesh(columnGeo, stoneMat);
                    column.position.y = i * 0.8 + 0.4 + 0.4;
                    group.add(column);
                }
            }

            const spoutGeo = getSharedGeometry('fountainSpout', () => new THREE.SphereGeometry(0.15, 8, 8));
            const spout = new THREE.Mesh(spoutGeo, waterMat);
            spout.position.y = levels * 0.8;
            group.add(spout);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkTrashBin(parent, config) {
            const { color = 0x475569 } = config;
            const group = new THREE.Group();
            const mat = getSharedMaterial(`mat_trashBin_${color}`, () => new THREE.MeshStandardMaterial({ color: color }));

            const bodyGeo = getSharedGeometry('trashBinBody', () => new THREE.CylinderGeometry(0.3, 0.25, 0.8, 12));
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.4;
            group.add(body);

            const lidGeo = getSharedGeometry('trashBinLid', () => new THREE.CylinderGeometry(0.32, 0.32, 0.1, 12));
            const lid = new THREE.Mesh(lidGeo, getSharedMaterial('mat_trashBinLid', () => new THREE.MeshStandardMaterial({ color: 0x1e293b })));
            lid.position.y = 0.85;
            group.add(lid);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createBoxTree(parent, config) {
            const { trunkH = 1.6, boxSize = 1.6, color = 0x88cc22 } = config;
            const group = new THREE.Group();

            const trunkMat = getSharedMaterial('mat_boxTreeTrunk', () => new THREE.MeshStandardMaterial({ color: 0x4d3220 }));
            const trunkGeo = getSharedGeometry(`boxTreeTrunk_${trunkH}`, () => new THREE.CylinderGeometry(0.06, 0.12, trunkH, 8));
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.userData.isTree = true;
            trunk.userData.treeType = 'boxTree';
            trunk.position.y = trunkH / 2;
            group.add(trunk);

            const foliageR = boxSize * 0.7;
            const leafMat = getSharedMaterial(`mat_boxTreeLeaf_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 }));
            const leafGeo = getSharedGeometry(`boxTreeLeaf_${foliageR}`, () => new THREE.SphereGeometry(foliageR, 32, 32));
            const core = new THREE.Mesh(leafGeo, leafMat);
            core.userData.isTree = true;
            core.userData.treeType = 'boxTree';
            core.position.y = trunkH + foliageR * 0.8;
            group.add(core);

            const potMat = getSharedMaterial('mat_boxTreePot', () => new THREE.MeshStandardMaterial({ color: 0x222222 }));
            const potGeo = getSharedGeometry('boxTreePot', () => new THREE.CylinderGeometry(0.3, 0.2, 0.3, 8));
            const pot = new THREE.Mesh(potGeo, potMat);
            pot.position.y = 0.15;
            group.add(pot);

            return srv2_finalizeMesh(group, parent, config);
        }

        /**
         * srv2_createBoxTreeRow — Places a serial row/array of Box Trees.
         *
         * Usage (array of positions):
         *   { type: 'boxtreerow', positions: [{x:0,z:0},{x:3,z:0},{x:6,z:0}], trunkH:1.6, boxSize:1.6 }
         *
         * Usage (auto-generate from count + spacing):
         *   { type: 'boxtreerow', count: 5, spacing: 3, direction: 'x', x: 0, z: 0, trunkH:1.6, boxSize:1.6 }
         *
         * @param {THREE.Object3D} parent
         * @param {Object} config
         */
        function srv2_createBoxTreeRow(parent, config) {
            const {
                positions = null,    // Array of {x, y, z} — explicit placement
                count = 10,           // Auto: how many trees
                spacing = 3,         // Auto: gap between trees
                direction = 'x',     // Auto: 'x' or 'z'
                trunkH = 1.6,
                boxSize = 1.6,
                color = 0x88cc22,
                x = -80, y = 0, z = -80, // Base offset for auto mode
                ry = 0
            } = config;

            const group = new THREE.Group();

            // Resolve the list of positions
            const treePositions = positions
                ? positions
                : Array.from({ length: count }, (_, i) => ({
                    x: direction === 'x' ? i * spacing : 0,
                    y: 0,
                    z: direction === 'z' ? i * spacing : 0,
                }));

            treePositions.forEach(pos => {
                srv2_createBoxTree(group, {
                    x: pos.x || 0,
                    y: pos.y || 0,
                    z: pos.z || 0,
                    trunkH,
                    boxSize,
                    color
                });
            });

            group.position.set(x, y, z);
            group.rotation.y = ry;
            parent.add(group);
            return group;
        }

        function srv2_createHedge(parent, config) {
            const { points = null, length = 10, width = 3.5, height = 1.0, color = 0x3EA65A } = config;
            const group = new THREE.Group();

            const curve = points ? new THREE.CatmullRomCurve3(points) : new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length));
            const actualLength = curve.getLength();

            const leafMat = getSharedMaterial(`mat_hedgeLeaf_${color}`, () => {
                const mat = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.8,
                    side: THREE.DoubleSide
                });
                mat.map = createLeafTexture();
                mat.map.repeat.set(actualLength / 5, 1);
                return mat;
            });
            const segments = Math.max(40, Math.floor(actualLength * 3));
            const pathPoints = curve.getPoints(segments);

            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const indices = [];
            const uvs = [];

            for (let i = 0; i < pathPoints.length; i++) {
                const t = i / (pathPoints.length - 1);
                const p = pathPoints[i];
                const tan = curve.getTangent(t).normalize();
                const sid = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

                const bL = p.clone().add(sid.clone().multiplyScalar(-width / 2));
                const bR = p.clone().add(sid.clone().multiplyScalar(width / 2));
                const tR = bR.clone().add(new THREE.Vector3(0, height, 0));
                const tL = bL.clone().add(new THREE.Vector3(0, height, 0));

                vertices.push(bL.x, bL.y, bL.z, bR.x, bR.y, bR.z, tR.x, tR.y, tR.z, tL.x, tL.y, tL.z);
                uvs.push(0, t * actualLength / 2, 1, t * actualLength / 2, 1, t * actualLength / 2, 0, t * actualLength / 2);

                if (i < pathPoints.length - 1) {
                    const b = i * 4;
                    // Left face
                    indices.push(b, b + 4, b + 7, b, b + 7, b + 3);
                    // Right face
                    indices.push(b + 1, b + 2, b + 6, b + 1, b + 6, b + 5);
                    // Top face
                    indices.push(b + 3, b + 7, b + 6, b + 3, b + 6, b + 2);
                    // Bottom face (keep for completeness)
                    indices.push(b, b + 1, b + 5, b, b + 5, b + 4);
                }
            }
            const last = (segments) * 4;
            indices.push(0, 3, 2, 0, 2, 1);
            indices.push(last, last + 1, last + 2, last, last + 2, last + 3);

            geometry.setIndex(indices);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.computeVertexNormals();

            const hedgeMesh = new THREE.Mesh(geometry, leafMat);
            hedgeMesh.userData.isTree = true;
            hedgeMesh.userData.treeType = 'standard';
            hedgeMesh.receiveShadow = true;
            hedgeMesh.castShadow = true;
            group.add(hedgeMesh);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkPath(parent, config) {
            const { points = null, length = 10, width = 3, color = 0x475569 } = config;
            const group = new THREE.Group();

            const curve = points ? new THREE.CatmullRomCurve3(points) : new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length));
            const actualLength = curve.getLength();
            const segments = Math.max(50, Math.floor(actualLength * 3));
            const pathPoints = curve.getPoints(segments);

            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const indices = [];
            const uvs = [];

            for (let i = 0; i < pathPoints.length; i++) {
                const t = i / (pathPoints.length - 1);
                const p = pathPoints[i];
                const tan = curve.getTangent(t).normalize();
                const sid = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

                const L = p.clone().add(sid.clone().multiplyScalar(-width / 2));
                const R = p.clone().add(sid.clone().multiplyScalar(width / 2));

                vertices.push(L.x, 0.05, L.z, R.x, 0.05, R.z);
                uvs.push(0, t * actualLength / 5, 1, t * actualLength / 5);

                if (i < pathPoints.length - 1) {
                    const b = i * 2;
                    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
                }
            }
            geometry.setIndex(indices);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.computeVertexNormals();

            const mat = getSharedMaterial(`mat_parkPath_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.9 }));
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.receiveShadow = true;
            group.add(mesh);

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkArea(parent, config) {
            const { w = 40, d = 40, items = [], landColor = 0xB5E550 } = config;
            const group = new THREE.Group();

            // Only use the land base for the park area as requested
            const landMat = getSharedMaterial(`mat_parkLandBase_${landColor}`, () => new THREE.MeshStandardMaterial({ color: landColor, roughness: 0.9 }));
            const landGeo = getSharedGeometry(`parkLandBase_${w + 2}_${d + 2}`, () => new THREE.PlaneGeometry(w + 2, d + 2));
            const land = new THREE.Mesh(landGeo, landMat);
            land.rotation.x = -Math.PI / 2;
            land.position.y = -0.05; // Slightly below equipment
            land.receiveShadow = true;
            group.add(land);

            // Add automated items if none provided
            const finalItems = items.length > 0 ? items : [
                // { type: 'fountain', x: 0, z: 0, r: 3 },
                { type: 'bench', x: -8, z: -8, ry: Math.PI / 4 },
                { type: 'bench', x: 8, z: -8, ry: -Math.PI / 4 },
                { type: 'bench', x: -8, z: 8, ry: 3 * Math.PI / 4 },
                { type: 'bench', x: 8, z: 8, ry: -3 * Math.PI / 4 },
                { type: 'bench', x: -70, z: -70, ry: Math.PI / 4 },
                { type: 'bench', x: 70, z: -70, ry: -Math.PI / 4 },
                { type: 'bench', x: -70, z: 70, ry: 3 * Math.PI / 4 },
                { type: 'bench', x: 70, z: 70, ry: -3 * Math.PI / 4 },
                { type: 'swing', x: -12, z: 0, ry: Math.PI / 2 },
                { type: 'swing', x: -32, z: -20, ry: Math.PI / 2 },
                { type: 'swing', x: -52, z: 40, ry: Math.PI / 2 },
                { type: 'slide', x: 12, z: 2, ry: -Math.PI / 2 },
                { type: 'slide', x: 12, z: -52, ry: -Math.PI / 2 },
                { type: 'slide', x: -22, z: 2, ry: -Math.PI / 2 },
                // { type: 'seesaw', x: 0, z: 12 },
                // { type: 'roundabout', x: 12, z: -12 },
                { type: 'lamp', x: -80, z: -90 },
                { type: 'lamp', x: -80, z: 90 },
                { type: 'lamp', x: 80, z: 90 },
                { type: 'lamp', x: 80, z: -90 },
                { type: 'trashbin', x: -10, z: -11 },
                // { type: 'boxtree', x: -18, z: 0 },
                // { type: 'boxtree', x: 18, z: 0 },
                // { type: 'boxtree', x: 0, z: -18 },
                // { type: 'boxtree', x: 0, z: 18 },
                { type: 'boxtreerow', count: 15, spacing: 10, direction: 'z', x: 80, z: -70 },
                { type: 'boxtreerow', count: 15, spacing: 10, direction: 'z', x: -80, z: -70 },
                { type: 'boxtreerow', count: 15, spacing: 10, direction: 'x', x: -70, z: 90 },
                { type: 'boxtreerow', count: 15, spacing: 10, direction: 'x', x: -70, z: -90 },
                // Roadside box tree rows removed as requested
                /*
                { type: 'boxtreerow', count: 22, spacing: 20, direction: 'x', x: -320, z: -620, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 22, spacing: 20, direction: 'x', x: -320, z: -640, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 22, spacing: 20, direction: 'x', x: -320, z: -660, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -680, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -700, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -720, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -740, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -760, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -780, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -800, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 32, spacing: 20, direction: 'x', x: -520, z: -820, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -520, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -500, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -480, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -460, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -440, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -420, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                { type: 'boxtreerow', count: 35, spacing: 20, direction: 'z', x: -400, z: -610, color: 0x267337, boxSize: 3.0, trunkH: 2.5 },
                */
            ];

            finalItems.forEach(item => {
                srv2_createParkEquipment(group, item);
            });

            // Decorative hedge around border
            // srv2_createHedge(group, { points: [
            //     new THREE.Vector3(-w/2+1, 0, -d/2+1),
            //     new THREE.Vector3(w/2-1, 0, -d/2+1),
            //     new THREE.Vector3(w/2-1, 0, d/2-1),
            //     new THREE.Vector3(-w/2+1, 0, d/2-1),
            //     new THREE.Vector3(-w/2+1, 0, -d/2+1)
            // ], width: 1.5, height: 1.0 });

            return srv2_finalizeMesh(group, parent, config);
        }

        function srv2_createParkEquipment(parent, config) {
            const { type = 'bench' } = config;
            switch (type.toLowerCase()) {
                case 'bench': return srv2_createParkBench(parent, config);
                case 'swing': return srv2_createParkSwing(parent, config);
                case 'slide': return srv2_createParkSlide(parent, config);
                case 'seesaw': return srv2_createParkSeesaw(parent, config);
                case 'lamp': return srv2_createParkLamp(parent, config);
                case 'roundabout': return srv2_createParkRoundabout(parent, config);
                case 'fountain': return srv2_createParkFountain(parent, config);
                case 'trashbin': return srv2_createParkTrashBin(parent, config);
                case 'boxtree': return srv2_createBoxTree(parent, config);
                case 'boxtreerow': return srv2_createBoxTreeRow(parent, config); // NEW: Serial array of box trees
                case 'hedge': return srv2_createHedge(parent, config);
                default: return srv2_createParkBench(parent, config);
            }
        }

        function srv2_createSawni(parent, config) {
            const { x = 0, y = 0, z = 0, scale = 1 } = config;
            const group = new THREE.Group();
            group.position.set(x, y, z);
            group.scale.set(scale, scale, scale);

            const roofMat = getSharedMaterial('sawni_roof_mat', () => new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5, metalness: 0.3 }));
            const beamMat = getSharedMaterial('sawni_beam_mat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd }));
            const floorMat = getSharedMaterial('sawni_floor_mat', () => new THREE.MeshStandardMaterial({ color: 0xfcf286, roughness: 0.8, metalness: 0.1 }));
            const furMat = getSharedMaterial('sawni_fur_mat', () => new THREE.MeshStandardMaterial({ color: 0x4d2a1a }));

            // 1. ROOF (Slab, Cone, Seams)
            const roofGeo = getSharedGeometry('sawni_roof_geo_merged', () => {
                const geos = [];
                const roofRadius = 5.8 / 2 * 1.15;
                const roofH = 2.0;

                const slab = new THREE.CylinderGeometry(roofRadius, roofRadius, 0.1, 18);
                slab.translate(0, 4.2, 0);
                geos.push(slab);

                const cone = new THREE.ConeGeometry(roofRadius, roofH, 18);
                cone.translate(0, 4.2 + roofH / 2 + 0.05, 0);
                geos.push(cone);

                const apex = new THREE.Vector3(0, roofH + 0.05, 0);
                for (let i = 0; i < 18; i++) {
                    const theta1 = i * 2 * Math.PI / 18;
                    const theta2 = (i + 1) * 2 * Math.PI / 18;
                    const v1 = new THREE.Vector3(roofRadius * Math.sin(theta1), 0.05, roofRadius * Math.cos(theta1));
                    const v2 = new THREE.Vector3(roofRadius * Math.sin(theta2), 0.05, roofRadius * Math.cos(theta2));
                    const apexOut = apex.clone(); apexOut.y += 0.03;

                    for (let j = 0; j <= 2; j++) {
                        if (j === 2 && i !== 17) continue;
                        const bp = v1.clone().lerp(v2, j / 2);
                        bp.x *= 1.02; bp.z *= 1.02;
                        const dist = bp.distanceTo(apexOut);
                        const seamGeo = new THREE.CylinderGeometry(0.015, 0.015, dist, 4);

                        const m = new THREE.Matrix4();
                        const pos = bp.clone().lerp(apexOut, 0.5);
                        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), apexOut.clone().sub(bp).normalize());
                        m.compose(pos, quat, new THREE.Vector3(1, 1, 1));
                        seamGeo.applyMatrix4(m);
                        seamGeo.translate(0, 4.2, 0);
                        geos.push(seamGeo);
                    }
                }
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            const roofMesh = new THREE.Mesh(roofGeo, roofMat);
            roofMesh.castShadow = true;
            group.add(roofMesh);

            // 2. BEAMS
            const beamsGeo = getSharedGeometry('sawni_beams_geo_merged', () => {
                const geos = [];
                const beamGeo = new THREE.CylinderGeometry(0.2, 0.2, 4.2, 16);
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2;
                    const b = beamGeo.clone();
                    b.translate(Math.cos(angle) * 2.5, 2.1, Math.sin(angle) * 2.5);
                    geos.push(b);
                }
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            const beamsMesh = new THREE.Mesh(beamsGeo, beamMat);
            beamsMesh.castShadow = true;
            group.add(beamsMesh);

            // 3. FLOOR
            const floorGeo = getSharedGeometry('sawni_floor_geo_merged', () => {
                const f = new THREE.CylinderGeometry(3.3, 3.3, 0.15, 32);
                f.translate(0, 0.075, 0);
                return f;
            });
            group.add(new THREE.Mesh(floorGeo, floorMat));

            // 4. FURNITURE (Table + Chairs)
            const furGeo = getSharedGeometry('sawni_fur_geo_merged', () => {
                const geos = [];
                const m = new THREE.Matrix4();

                // Table
                const t1 = new THREE.CylinderGeometry(1.0, 1.0, 0.05, 32); m.makeTranslation(0, 0.75, 0); geos.push(t1.applyMatrix4(m));
                const t2 = new THREE.CylinderGeometry(0.1, 0.15, 0.75, 16); m.makeTranslation(0, 0.375, 0); geos.push(t2.applyMatrix4(m));
                const t3 = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16); m.makeTranslation(0, 0.025, 0); geos.push(t3.applyMatrix4(m));

                // Chairs
                const cPositions = [
                    { z: 1.2, ry: Math.PI },
                    { z: -1.2, ry: 0 },
                    { x: -1.2, ry: -Math.PI / 2 },
                    { x: 1.2, ry: Math.PI / 2 }
                ];
                cPositions.forEach(cp => {
                    const cGeo = [];
                    const cm = new THREE.Matrix4();
                    const seat = new THREE.BoxGeometry(0.5, 0.05, 0.5); cm.makeTranslation(0, 0.45, 0); cGeo.push(seat.applyMatrix4(cm));
                    const back = new THREE.BoxGeometry(0.5, 0.6, 0.05); cm.makeTranslation(0, 0.75, -0.22); cGeo.push(back.applyMatrix4(cm));
                    const legG = new THREE.BoxGeometry(0.05, 0.45, 0.05);
                    for (let lx = -1; lx <= 1; lx += 2) {
                        for (let lz = -1; lz <= 1; lz += 2) {
                            const l = legG.clone(); cm.makeTranslation(lx * 0.2, 0.225, lz * 0.2); cGeo.push(l.applyMatrix4(cm));
                        }
                    }
                    const chairGeoCombined = THREE.BufferGeometryUtils.mergeBufferGeometries(cGeo);

                    const rotM = new THREE.Matrix4().makeRotationY(cp.ry);
                    chairGeoCombined.applyMatrix4(rotM);
                    const posM = new THREE.Matrix4().makeTranslation(cp.x || 0, 0, cp.z || 0);
                    chairGeoCombined.applyMatrix4(posM);

                    geos.push(chairGeoCombined);
                });
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            const furMesh = new THREE.Mesh(furGeo, furMat);
            furMesh.position.set(0, 0.1, 0);
            furMesh.castShadow = true;
            group.add(furMesh);

            parent.add(group);
        }

