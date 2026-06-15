        function createHouse(id, plotW = 500, plotD = 600, skipWall = null, hasPool = false, carCount = 0, hasPlayground = false, hDepth = 280, hWidth = 220, hasWing = true, hFloorH = 100, houseOX = 0, houseOZ = 0, poolOX = 0, poolOZ = 0, carOX = 0, carOZ = 0, playOX = 0, playOZ = 0, carW = 80, carL = 160, innerGapScale = 1, isTerrace = false, hasCarParking = true, houseDesign = 'standard', hScale = 1, hRotate = 0) {

            const addPool = hasPool === true;

            // Create a cache key for identical houses
            const cacheKey = JSON.stringify({
                plotW, plotD, skipWall, hasPool: addPool, carCount, hasPlayground,
                hDepth, hWidth, hasWing, hFloorH, houseOX, houseOZ,
                poolOX, poolOZ, carOX, carOZ, playOX, playOZ,
                carW, carL, innerGapScale, isTerrace, hasCarParking,
                houseDesign, hScale, hRotate
            });

            if (houseMeshCache.has(cacheKey)) {
                const cachedGroup = houseMeshCache.get(cacheKey).clone();
                // We still need to set the name and handle the ID potentially if used
                cachedGroup.userData.id = id;
                return cachedGroup;
            }

            const house = new THREE.Group();
            house.name = 'house';
            house.userData.id = id;

            const igScaleRaw = innerGapScale;
            const igx = (typeof igScaleRaw === 'object') ? (igScaleRaw.x !== undefined ? igScaleRaw.x : 1) : igScaleRaw;
            const igy = (typeof igScaleRaw === 'object') ? (igScaleRaw.y !== undefined ? igScaleRaw.y : 1) : igScaleRaw;

            const CONFIG = { houseWidth: hWidth, houseDepth: hDepth, wingLen: Math.max(260, hWidth * 0.8), floorH: hFloorH, wingW: Math.max(100, hWidth * 0.45), roofH: 80 };
            const { houseWidth, houseDepth, wingLen, floorH, wingW, roofH } = CONFIG;
            const wallH = 95; const wallT = 10; const gateW = 160;

            const bodyMat = getSharedMaterial('houseBody', () => new THREE.MeshStandardMaterial({ color: 0xe8e4d9, roughness: 0.8 }));
            const hRoofMat = getSharedMaterial('houseRoof', () => new THREE.MeshStandardMaterial({ color: 0xC47460, roughness: 0.7 }));
            const winMat = getSharedMaterial('houseWin', () => new THREE.MeshStandardMaterial({ color: 0xadd8e6, emissive: 0x111111 }));
            const wallMat = getSharedMaterial('houseWall', () => new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
            const gateMat = getSharedMaterial('houseGate', () => new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.3 }));
            const glassMat = getSharedMaterial('houseGlass', () => new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 }));
            const beamMat = getSharedMaterial('houseBeam', () => new THREE.MeshStandardMaterial({ color: 0xFAF9F6, roughness: 0.5 }));

            // --- Merged Geometries ---
            // --- Merged Geometries Cache ---
            const wallKey = `mergedWall_${plotW}_${plotD}_${skipWall}`;
            const gateKey = `mergedGate_${gateW}_${plotD}_${wallH}`;
            const concreteKey = `mergedConcrete_${gateW}_${plotD}_${wallH}`;

            // Walls
            const wallMeshGeo = getSharedGeometry(wallKey, () => {
                const wallGeos = [];
                const bwG = new THREE.BoxGeometry(plotW, wallH, wallT); bwG.translate(0, wallH / 2, plotD / 2 - wallT / 2); wallGeos.push(bwG);
                const sideWallG = new THREE.BoxGeometry(wallT, wallH, plotD);
                if (skipWall !== 'left') { const lw = sideWallG.clone(); lw.translate(-plotW / 2 + wallT / 2, wallH / 2, 0); wallGeos.push(lw); }
                if (skipWall !== 'right') { const rw = sideWallG.clone(); rw.translate(plotW / 2 - wallT / 2, wallH / 2, 0); wallGeos.push(rw); }
                const frontSegW = (plotW - gateW) / 2;
                const frontWallG = new THREE.BoxGeometry(frontSegW, wallH, wallT);
                const fwL = frontWallG.clone(); fwL.translate(-plotW / 2 + frontSegW / 2, wallH / 2, -plotD / 2 + wallT / 2); wallGeos.push(fwL);
                const fwR = frontWallG.clone(); fwR.translate(plotW / 2 - frontSegW / 2, wallH / 2, -plotD / 2 + wallT / 2); wallGeos.push(fwR);
                return THREE.BufferGeometryUtils.mergeBufferGeometries(wallGeos);
            });
            const wallMesh = new THREE.Mesh(wallMeshGeo, wallMat);
            house.add(wallMesh);

            // Gate Iron
            const gateMeshGeo = getSharedGeometry(gateKey, () => {
                const gateGeos = [];
                const barGeoSource = new THREE.CylinderGeometry(2, 2, 1, 6);
                const spearGeoSource = new THREE.ConeGeometry(4, 15, 4);
                for (let ax = -gateW / 2 + 12; ax <= gateW / 2 - 12; ax += 12) {
                    const xNorm = ax / (gateW / 2 - 12);
                    const archH = 20 * (1 - xNorm * xNorm);
                    const barH = wallH + 5 + archH;
                    const bar = barGeoSource.clone(); bar.scale(1, barH, 1); bar.translate(ax, barH / 2, -plotD / 2 + wallT / 2); gateGeos.push(bar);
                    const spear = spearGeoSource.clone(); spear.translate(ax, barH + 7, -plotD / 2 + wallT / 2); gateGeos.push(spear);
                }
                const hBarG = new THREE.BoxGeometry(gateW, 5, 5);
                const hTop = hBarG.clone(); hTop.translate(0, wallH + 10, -plotD / 2 + wallT / 2); gateGeos.push(hTop);
                const hBot = hBarG.clone(); hBot.translate(0, 15, -plotD / 2 + wallT / 2); gateGeos.push(hBot);
                return THREE.BufferGeometryUtils.mergeBufferGeometries(gateGeos);
            });
            const gateMesh = new THREE.Mesh(gateMeshGeo, gateMat);
            house.add(gateMesh);

            // Gate Concrete
            const concreteMeshGeo = getSharedGeometry(concreteKey, () => {
                const concreteGeos = [];
                const pillarG = new THREE.BoxGeometry(28, wallH + 30, 28);
                const pL = pillarG.clone(); pL.translate(-gateW / 2, (wallH + 30) / 2, -plotD / 2 + wallT / 2); concreteGeos.push(pL);
                const pR = pillarG.clone(); pR.translate(gateW / 2, (wallH + 30) / 2, -plotD / 2 + wallT / 2); concreteGeos.push(pR);
                const gBeamG = new THREE.BoxGeometry(gateW + 40, 12, 32);
                const gBeam = gBeamG.clone(); gBeam.translate(0, wallH + 30 + 6, -plotD / 2 + wallT / 2); concreteGeos.push(gBeam);
                const capG = new THREE.SphereGeometry(16, 12, 12);
                const cL = capG.clone(); cL.translate(-gateW / 2, wallH + 30 + 12 + 10, -plotD / 2 + wallT / 2); concreteGeos.push(cL);
                const cR = capG.clone(); cR.translate(gateW / 2, wallH + 30 + 12 + 10, -plotD / 2 + wallT / 2); concreteGeos.push(cR);
                return THREE.BufferGeometryUtils.mergeBufferGeometries(concreteGeos);
            });
            const gateConcreteMesh = new THREE.Mesh(concreteMeshGeo, beamMat);
            house.add(gateConcreteMesh);

            const wallGeos = []; // Placeholder to satisfy subsequent code if any

            // Caching removed the need for manual merge loops here

            const building = new THREE.Group();
            building.position.set(houseOX, 0, houseOZ);
            // Apply internal house rotation (only the building rotates, not the plot/walls)
            building.rotation.y = (hRotate || 0) * (Math.PI / 180);
            house.add(building);

            if (houseDesign === 'custom') {
                createFancyBuilding(building, hScale);
                // Also add pool if requested as modular components might not have it
                if (addPool) {
                    // Pool logic remains exactly same as standard
                    const poolGroup = new THREE.Group();
                    const poolW_c = Math.max(200, plotW * 0.3), poolD_c = Math.max(350, plotD * 0.3), poolH_c = 10;
                    const poolKey_c = `poolWater_${poolW_c}_${poolD_c}`;
                    const poolGeo_c = getSharedGeometry(poolKey_c, () => new THREE.BoxGeometry(poolW_c, poolH_c, poolD_c, 12, 1, 12));
                    poolWaterGeometries.add(poolGeo_c);
                    const poolMat_c = getSharedMaterial('poolWaterMat', () => {
                        const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 });
                        mat.onBeforeCompile = (shader) => {
                            shader.uniforms.uTime = globalUniforms.uTime;
                            shader.vertexShader = `
                                uniform float uTime;
                                ${shader.vertexShader}
                            `.replace(
                                '#include <begin_vertex>',
                                `
                                #include <begin_vertex>
                                // Only move top vertices (facing up)
                                if (normal.y > 0.5) {
                                    float wave = sin(position.x * 0.05 + uTime * 2.5) * 0.4 + cos(position.z * 0.05 + uTime * 2.0) * 0.4;
                                    transformed.y += wave;
                                }
                                `
                            );
                        };
                        return mat;
                    });
                    const poolWater_c = new THREE.Mesh(poolGeo_c, poolMat_c);
                    poolWater_c.userData.noOptimize = true;
                    poolWater_c.position.set(poolOX, 0.5, poolOZ);
                    poolGroup.add(poolWater_c);
                    const borderGeo_c = getSharedGeometry(`poolBorder_${poolW_c}_${poolD_c}`, () => new THREE.BoxGeometry(poolW_c + 20, 5, poolD_c + 20));
                    const border_c = new THREE.Mesh(borderGeo_c, getSharedMaterial('poolBorderMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd })));
                    border_c.position.set(poolOX, 0.1, poolOZ);
                    poolGroup.add(border_c);
                    house.add(poolGroup);
                }
            } else if (houseDesign === 'customV2') {
                createFancyBuildingV2(building, hScale);
                // Also add pool if requested
                if (addPool) {
                    const poolGroup = new THREE.Group();
                    const poolW_c = Math.max(200, plotW * 0.3), poolD_c = Math.max(350, plotD * 0.3), poolH_c = 10;
                    const poolKey_c = `poolWater_${poolW_c}_${poolD_c}`;
                    const poolGeo_c = getSharedGeometry(poolKey_c, () => new THREE.BoxGeometry(poolW_c, poolH_c, poolD_c, 12, 1, 12));
                    poolWaterGeometries.add(poolGeo_c);
                    const poolMat_c = getSharedMaterial('poolWaterMat', () => new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 }));
                    const poolWater_c = new THREE.Mesh(poolGeo_c, poolMat_c);
                    poolWater_c.userData.noOptimize = true;
                    poolWater_c.position.set(poolOX, 0.5, poolOZ);
                    poolGroup.add(poolWater_c);
                    const borderGeo_c = getSharedGeometry(`poolBorder_${poolW_c}_${poolD_c}`, () => new THREE.BoxGeometry(poolW_c + 20, 5, poolD_c + 20));
                    const border_c = new THREE.Mesh(borderGeo_c, getSharedMaterial('poolBorderMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd })));
                    border_c.position.set(poolOX, 0.1, poolOZ);
                    poolGroup.add(border_c);
                    house.add(poolGroup);
                }
            } else if (houseDesign === 'customV3') {
                createFancyBuildingV3(building, hScale);
                if (addPool) {
                    const poolGroup = new THREE.Group();
                    const poolW_c = Math.max(200, plotW * 0.3), poolD_c = Math.max(350, plotD * 0.3), poolH_c = 10;
                    const poolKey_c = `poolWater_${poolW_c}_${poolD_c}`;
                    const poolGeo_c = getSharedGeometry(poolKey_c, () => new THREE.BoxGeometry(poolW_c, poolH_c, poolD_c, 12, 1, 12));
                    poolWaterGeometries.add(poolGeo_c);
                    const poolMat_c = getSharedMaterial('poolWaterMat', () => new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 }));
                    const poolWater_c = new THREE.Mesh(poolGeo_c, poolMat_c);
                    poolWater_c.userData.noOptimize = true;
                    poolWater_c.position.set(poolOX, 0.5, poolOZ);
                    poolGroup.add(poolWater_c);
                    const borderGeo_c = getSharedGeometry(`poolBorder_${poolW_c}_${poolD_c}`, () => new THREE.BoxGeometry(poolW_c + 20, 5, poolD_c + 20));
                    const border_c = new THREE.Mesh(borderGeo_c, getSharedMaterial('poolBorderMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd })));
                    border_c.position.set(poolOX, 0.1, poolOZ);
                    poolGroup.add(border_c);
                    house.add(poolGroup);
                }
            } else {
                // Use shared objects for identical buildings
                const baseCacheKey = `houseBase_${houseWidth}_${houseDepth}_${floorH}_${hasWing}_${id}`;
                const internalBldg = getSharedGeometry(baseCacheKey, () => {
                    const bodyGeos = [];
                    const mbG = new THREE.BoxGeometry(houseWidth, floorH * 2, houseDepth); mbG.translate(0, floorH, 0); bodyGeos.push(mbG);
                    if (hasWing) {
                        const wbG = new THREE.BoxGeometry(wingLen, floorH * 2, wingW);
                        wbG.translate(-(houseWidth / 2 + wingLen / 2), floorH, houseDepth / 2 - wingW / 2);
                        bodyGeos.push(wbG);
                    }
                    return THREE.BufferGeometryUtils.mergeBufferGeometries(bodyGeos);
                });

                const bodyMesh = new THREE.Mesh(internalBldg, bodyMat);
                bodyMesh.castShadow = true;
                building.add(bodyMesh);

                // --- HOUSE PERIMETER STONES ---
                const stoneWidth = houseWidth + stoneBaseW;
                const stoneDepth = houseDepth + stoneBaseD;
                const stoneGeo = getSharedGeometry(`houseStone_${stoneWidth}_${stoneDepth}_${stoneBaseHT}`, () => new THREE.BoxGeometry(stoneWidth, stoneBaseHT, stoneDepth));
                const stoneMat = getSharedMaterial('houseStoneMatTex', () => {
                    const mat = new THREE.MeshStandardMaterial({ roughness: 1.0, bumpScale: 0.2 });
                    mat.map = createStoneTexture();
                    return mat;
                });
                const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
                stoneMesh.position.set(0, stoneBaseY, 0);
                building.add(stoneMesh);

                // Doors and unique parts
                const doorGeo = getSharedGeometry('houseDoor', () => new THREE.BoxGeometry(45, 75, 5));
                // Shared material without unique text allows all 500+ doors to be instanced into 1 draw call!
                const doorMat = getSharedMaterial('doorMat_shared', () => {
                    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
                    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#8b4513'; ctx.fillRect(0, 0, 16, 16);
                    return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas) });
                });
                const doorGeos = [];
                const d1G = doorGeo.clone(); d1G.translate(0, 37.5, -(houseDepth / 2 + 2)); doorGeos.push(d1G);
                const d2G = doorGeo.clone(); d2G.translate(0, floorH + 37.5, -(houseDepth / 2 + 2)); doorGeos.push(d2G);
                if (hasWing) {
                    const wdG = doorGeo.clone(); wdG.rotateY(Math.PI); wdG.translate(-(houseWidth / 2 + 80), floorH + 37.5, houseDepth / 2 - wingW - 2);
                    doorGeos.push(wdG);
                }
                const doorMesh = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(doorGeos), doorMat);
                building.add(doorMesh);

                // Sawni for Standard House
                const sawniGrp = new THREE.Group();
                srv2_createSawni(sawniGrp, { x: 10, y: 0, z: -10, scale: 0.5 });
                sawniGrp.rotation.y = -Math.PI / 2;
                sawniGrp.position.set(0, 0, -(houseDepth / 2 + 180));
                sawniGrp.scale.set(15, 15, 15);
                building.add(sawniGrp);

                // Porch (Merged)
                const porchMergedGeo = getSharedGeometry(`porchMerged_${houseWidth}_${houseDepth}_${floorH}`, () => {
                    const b1 = new THREE.BoxGeometry(houseWidth - 20, 10, 80); b1.translate(0, 5, -(houseDepth / 2 + 40));
                    const b2 = new THREE.BoxGeometry(houseWidth - 20, 10, 80); b2.translate(0, floorH + 5, -(houseDepth / 2 + 40));
                    return THREE.BufferGeometryUtils.mergeBufferGeometries([b1, b2]);
                });
                building.add(new THREE.Mesh(porchMergedGeo, porchMat));

                // Windows (Merged)
                const windowGeos = [];
                if (hasWing) {
                    [-(houseWidth / 2 + 80), -(houseWidth / 2 + 220)].forEach(x => {
                        const w1 = new THREE.PlaneGeometry(40, 50); w1.rotateY(Math.PI); w1.translate(x, 45, houseDepth / 2 - wingW - 1.5); windowGeos.push(w1);
                        const w2 = new THREE.PlaneGeometry(40, 50); w2.rotateY(Math.PI); w2.translate(x, floorH + 45, houseDepth / 2 - wingW - 1.5); windowGeos.push(w2);
                    });
                }
                if (windowGeos.length > 0) {
                    const winMesh = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(windowGeos), winMat);
                    building.add(winMesh);
                }

                // House Porch Light Bulb
                const houseBulbGeo = getSharedGeometry('houseBulb', () => new THREE.SphereGeometry(15, 8, 8));
                const houseBulbMat = getSharedMaterial('houseBulbMat', () => new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0x000000, emissiveIntensity: 0 }));
                const hb = new THREE.Mesh(houseBulbGeo, houseBulbMat);
                hb.position.set(0, floorH - 15, -(houseDepth / 2 + 15));
                hb.name = 'houseBulb';
                building.add(hb);

                // Beams (Merged)
                const beamGeos = [];
                const bGeo = new THREE.CylinderGeometry(5, 5, floorH);
                const b1G = bGeo.clone(); b1G.translate(-(houseWidth / 2 - 30), floorH / 2 + 5, -(houseDepth / 2 + 60)); beamGeos.push(b1G);
                const b2G = bGeo.clone(); b2G.translate(houseWidth / 2 - 30, floorH / 2 + 5, -(houseDepth / 2 + 60)); beamGeos.push(b2G);
                const beamMesh = new THREE.Mesh(THREE.BufferGeometryUtils.mergeBufferGeometries(beamGeos), beamMat); building.add(beamMesh);

                // Swimming Pool

                // --- ADDED SWIMMING POOL ---
                if (addPool) {
                    const poolGroup = new THREE.Group();
                    const poolW = Math.max(200, plotW * 0.3), poolD = Math.max(350, plotD * 0.3), poolH = 10;
                    const poolKey = `poolWater_${poolW}_${poolD}`;

                    const poolGeo = getSharedGeometry(poolKey, () => new THREE.BoxGeometry(poolW, poolH, poolD, 12, 1, 12));
                    poolWaterGeometries.add(poolGeo);

                    const poolMat = getSharedMaterial('poolWaterMat', () => {
                        const mat = new THREE.MeshStandardMaterial({ color: 0x00aaff, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.8 });
                        mat.onBeforeCompile = (shader) => {
                            shader.uniforms.uTime = globalUniforms.uTime;
                            shader.vertexShader = `
                            uniform float uTime;
                            ${shader.vertexShader}
                        `.replace(
                                '#include <begin_vertex>',
                                `
                            #include <begin_vertex>
                            if (normal.y > 0.5) {
                                float wave = sin(position.x * 0.05 + uTime * 2.5) * 0.4 + cos(position.z * 0.05 + uTime * 2.0) * 0.4;
                                transformed.y += wave;
                            }
                            `
                            );
                        };
                        return mat;
                    });
                    const poolWater = new THREE.Mesh(poolGeo, poolMat);
                    poolWater.userData.noOptimize = true;
                    poolWater.position.set(poolOX, 0.5, poolOZ);
                    poolGroup.add(poolWater);

                    const borderKey = `poolBorder_${poolW}_${poolD}`;
                    const borderGeo = getSharedGeometry(borderKey, () => new THREE.BoxGeometry(poolW + 20, 5, poolD + 20));
                    const borderMat = getSharedMaterial('poolBorderMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd }));
                    const border = new THREE.Mesh(borderGeo, borderMat);
                    border.position.set(poolOX, 0.1, poolOZ);
                    poolGroup.add(border);

                    // --- Pool Stairs ---
                    const stairW = 35; // Narrow stairs so handles are very close to each other
                    const stairMat = getSharedMaterial('poolStairMat', () => new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.9 }));
                    for (let s = 0; s < 5; s++) {
                        const stepD = 18;
                        const stepH = 2.0;
                        const stepGeo = getSharedGeometry(`poolStep_${stairW}_${s}`, () => new THREE.BoxGeometry(stairW, stepH, stepD));
                        const step = new THREE.Mesh(stepGeo, stairMat);
                        // Elevate the steps slightly so they naturally peek out of the water
                        step.position.set(poolOX, 2.5 - poolH / 2 + (s + 0.5) * stepH, poolOZ - poolD / 2 + (s + 0.5) * stepD + 5);
                        poolGroup.add(step);
                    }

                    // --- Pool Handles (2 Side Rails) ---
                    const handleMat = getSharedMaterial('poolHandleMat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 }));
                    const handleGeo = getSharedGeometry('poolHandle', () => {
                        const curveOptions = [
                            new THREE.Vector3(0, 0, 0),
                            new THREE.Vector3(0, 15, 0),
                            new THREE.Vector3(5, 20, 0),
                            new THREE.Vector3(20, 20, 0),
                            new THREE.Vector3(20, 0, 0)
                        ];
                        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curveOptions), 20, 1.2, 8, false);
                    });

                    const handleL = new THREE.Mesh(handleGeo, handleMat);
                    handleL.position.set(poolOX - stairW / 2 + 1.5, 3.5, poolOZ - poolD / 2 + 10);
                    handleL.rotation.y = Math.PI / 2;
                    poolGroup.add(handleL);

                    const handleR = new THREE.Mesh(handleGeo, handleMat);
                    handleR.position.set(poolOX + stairW / 2 - 1.5, 3.5, poolOZ - poolD / 2 + 10);
                    handleR.rotation.y = Math.PI / 2;
                    poolGroup.add(handleR);

                    house.add(poolGroup);
                }

                // --- CAR PARKING PAD & CARPORT (Conditional) ---
                if (hasCarParking) {
                    const parkingColors = [0x707070, 0x5a5a5a, 0x6e6259, 0x505a5f, 0x8a7b6b];
                    const pColor = parkingColors[Math.floor(Math.random() * parkingColors.length)];
                    const padW = 220; const padD = 350;
                    const padGeo = getSharedGeometry(`parkingPadGeo`, () => new THREE.BoxGeometry(padW, 2, padD));
                    const padMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.9 });
                    const padMesh = new THREE.Mesh(padGeo, padMat);
                    const rGap = 80 * igx;
                    const fGap = 160 * igy;
                    const padX = plotW / 2 - (padW / 2 + rGap) + carOX;
                    const padZ = -plotD / 2 + padD / 2 + fGap + carOZ;
                    padMesh.position.set(padX, 1, padZ);
                    house.add(padMesh);

                    // Carport / Shade Structure (Optimized)
                    const cpKey = 'cpGroup_merged';
                    const cpMergedGeo = getSharedGeometry(cpKey, () => {
                        const geos = [];
                        const cpPoleGeo = new THREE.CylinderGeometry(3, 3, 110, 6);
                        const pPositions = [[-padW / 2 + 15, 55 + 2, -padD / 2 + 25], [padW / 2 - 15, 55 + 2, -padD / 2 + 25], [-padW / 2 + 15, 55 + 2, padD / 2 - 25], [padW / 2 - 15, 55 + 2, padD / 2 - 25]];
                        pPositions.forEach(pos => { const p = cpPoleGeo.clone(); p.translate(pos[0], pos[1], pos[2]); geos.push(p); });
                        const cpRoofGeo = new THREE.BoxGeometry(padW + 20, 6, padD + 30);
                        cpRoofGeo.translate(0, 110 + 2 + 3, 0); geos.push(cpRoofGeo);
                        return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
                    });
                    const cpPoleMat = getSharedMaterial('cpPoleMat', () => new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.3 }));
                    const cpMesh = new THREE.Mesh(cpMergedGeo, cpPoleMat);
                    cpMesh.position.set(padX, 0, padZ);
                    house.add(cpMesh);

                    // --- REALISTIC 3D CARS ---
                    // Simplified Car Generation
                    const wheelGeo = getSharedGeometry(`carWheel_${carW}`, () => {
                        const t = new THREE.CylinderGeometry(carW * 0.18, carW * 0.18, carW * 0.12, 12); t.rotateZ(Math.PI / 2);
                        const r = new THREE.CylinderGeometry(carW * 0.12, carW * 0.12, carW * 0.13, 8); r.rotateZ(Math.PI / 2);
                        return THREE.BufferGeometryUtils.mergeBufferGeometries([t, r]);
                    });
                    const carColors = [0xffffff, 0x333333, 0x1a73e8, 0xd93025, 0xfbbc04, 0x34a853];
                    const carBodyGeo = getSharedGeometry(`carBodyGeo_${carW}_${carL}`, () => {
                        const bodyShape = new THREE.Shape();
                        bodyShape.moveTo(-carL * 0.5, 0); bodyShape.lineTo(carL * 0.5, 0); bodyShape.lineTo(carL * 0.5, carW * 0.25);
                        bodyShape.lineTo(carL * 0.45, carW * 0.35); bodyShape.lineTo(carL * 0.15, carW * 0.35); bodyShape.lineTo(carL * 0.05, carW * 0.65);
                        bodyShape.lineTo(-carL * 0.3, carW * 0.65); bodyShape.lineTo(-carL * 0.45, carW * 0.35); bodyShape.lineTo(-carL * 0.5, carW * 0.35); bodyShape.lineTo(-carL * 0.5, 0);
                        return new THREE.ExtrudeGeometry(bodyShape, { depth: carW, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 2 });
                    });
                    const chromeMat = getSharedMaterial('carChrome', () => new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1.0, roughness: 0.1 }));
                    const blackMat = getSharedMaterial('carBlack', () => new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 }));

                    for (let i = 0; i < carCount; i++) {
                        const car = new THREE.Group();
                        const carColor = carColors[i % carColors.length];
                        const mainMat = getSharedMaterial(`carMain_${carColor}`, () => new THREE.MeshStandardMaterial({ color: carColor, metalness: 0.7, roughness: 0.2 }));
                        const bodyMesh = new THREE.Mesh(carBodyGeo, mainMat);
                        bodyMesh.rotation.y = Math.PI / 2; bodyMesh.position.set(carW / 2, carW * 0.1, 0); car.add(bodyMesh);

                        const wOffsets = [[-carW * 0.52, carW * 0.18, carL * 0.3], [carW * 0.52, carW * 0.18, carL * 0.3], [-carW * 0.52, carW * 0.18, -carL * 0.32], [carW * 0.52, carW * 0.18, -carL * 0.32]];
                        wOffsets.forEach(pos => {
                            const w = new THREE.Mesh(wheelGeo, blackMat); w.position.set(pos[0], pos[1], pos[2]); car.add(w);
                        });
                        const spacing = (carL + 100) * igy;
                        car.position.set(plotW / 2 - (carL / 2 + 70 * igx) - (i * spacing) + carOX, 0, -plotD / 2 + 180 * igy + carOZ);
                        car.rotation.y = Math.PI / 2; house.add(car);
                    }
                } // end hasCarParking

                // --- ENHANCED PLAYGROUND ---
                if (hasPlayground) {
                    const playgroundGroup = new THREE.Group();
                    const pgW = Math.max(120, plotW * 0.2);
                    const pBaseX = playOX;
                    const pBaseZ = playOZ;

                    // Sandbox (Colorful Border)
                    const sandGeo = getSharedGeometry('sandGeo_' + pgW, () => new THREE.BoxGeometry(pgW, 5, pgW));
                    const sand = new THREE.Mesh(sandGeo, getSharedMaterial('sandColor', () => new THREE.MeshStandardMaterial({ color: 0xedc9af })));
                    sand.position.set(pBaseX, 2.5, pBaseZ); playgroundGroup.add(sand);

                    // Colorful Slide
                    const slideGroup = new THREE.Group();
                    const blueMat = getSharedMaterial('pbBlue', () => new THREE.MeshStandardMaterial({ color: 0x4444ff }));
                    const redMat = getSharedMaterial('pbRed', () => new THREE.MeshStandardMaterial({ color: 0xff4444 }));
                    const ladder = new THREE.Mesh(getSharedGeometry('ladder', () => new THREE.CylinderGeometry(2, 2, 40)), blueMat);
                    ladder.position.set(0, 20, 0); slideGroup.add(ladder);
                    const ramp = new THREE.Mesh(getSharedGeometry('ramp', () => new THREE.BoxGeometry(10, 2, 60)), redMat);
                    ramp.rotation.x = -Math.PI / 4; ramp.position.set(0, 15, 20); slideGroup.add(ramp);
                    slideGroup.position.set(pBaseX + 60, 0, pBaseZ); playgroundGroup.add(slideGroup);

                    // Swings (Yellow Frame)
                    const swingGroup = new THREE.Group();
                    const yellowMat = getSharedMaterial('pbYellow', () => new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
                    const fTop = new THREE.Mesh(getSharedGeometry('swingFrame', () => new THREE.CylinderGeometry(2, 2, 60)), yellowMat);
                    fTop.rotation.z = Math.PI / 2; fTop.position.set(0, 50, 0); swingGroup.add(fTop);
                    [28, -28].forEach(x => {
                        const leg = new THREE.Mesh(getSharedGeometry('swingFrame', () => new THREE.CylinderGeometry(2, 2, 60)), yellowMat);
                        leg.position.set(x, 25, 0); leg.rotation.z = x > 0 ? -0.2 : 0.2; swingGroup.add(leg);
                    });
                    swingGroup.position.set(pBaseX - 60, 0, pBaseZ + 40); playgroundGroup.add(swingGroup);

                    // See-Saw (Green/Wood)
                    const sawGroup = new THREE.Group();
                    const greenMat = getSharedMaterial('pbGreen', () => new THREE.MeshStandardMaterial({ color: 0x44ff44 }));
                    const sawBase = new THREE.Mesh(getSharedGeometry('sawBase', () => new THREE.ConeGeometry(5, 15, 8)), greenMat);
                    sawBase.position.y = 7.5; sawGroup.add(sawBase);
                    const sawBoard = new THREE.Mesh(getSharedGeometry('sawBoard', () => new THREE.BoxGeometry(80, 2, 8)), redMat);
                    sawBoard.position.y = 15; sawBoard.rotation.z = 0.2; sawGroup.add(sawBoard);
                    sawGroup.position.set(pBaseX, 0, pBaseZ - 60); playgroundGroup.add(sawGroup);

                    // Spring Duck Rider
                    const duckGroup = new THREE.Group();
                    const spring = new THREE.Mesh(getSharedGeometry('spring', () => new THREE.CylinderGeometry(2, 2, 15)), blueMat);
                    spring.position.y = 7.5; duckGroup.add(spring);
                    const duck = new THREE.Mesh(getSharedGeometry('duckBody', () => new THREE.BoxGeometry(20, 15, 10)), yellowMat);
                    duck.position.y = 20; duckGroup.add(duck);
                    duckGroup.position.set(pBaseX - 40, 0, pBaseZ - 40); playgroundGroup.add(duckGroup);

                    house.add(playgroundGroup);
                }


                // Roofs (Optimized)
                if (isTerrace) {
                    // Terrace Style: Flat roof with railing
                    const roofThickness = 8;
                    const roofGeo = getSharedGeometry(`terraceRoof_${houseWidth}_${houseDepth}`, () => new THREE.BoxGeometry(houseWidth + 40, roofThickness, houseDepth + 40));
                    const terraceRoof = new THREE.Mesh(roofGeo, hRoofMat);
                    terraceRoof.position.set(0, floorH * 2 + roofThickness / 2, 0);
                    building.add(terraceRoof);

                    // Add railing
                    const railH = 20;
                    const glassMatRailing = getSharedMaterial('terraceGlass', () => new THREE.MeshPhongMaterial({ color: 0xaaddff, opacity: 0.4, transparent: true }));

                    const railGeoF = getSharedGeometry(`terraceRailF_${houseWidth}_${houseDepth}`, () => new THREE.BoxGeometry(houseWidth + 40, railH, 2));
                    const rF = new THREE.Mesh(railGeoF, glassMatRailing);
                    rF.position.set(0, floorH * 2 + roofThickness + railH / 2, -houseDepth / 2 - 20);
                    building.add(rF);

                    const rB = rF.clone();
                    rB.position.z = houseDepth / 2 + 20;
                    building.add(rB);

                    const railSideGeo = getSharedGeometry(`terraceSideRail_${houseWidth}_${houseDepth}`, () => new THREE.BoxGeometry(2, railH, houseDepth + 40));
                    const rL = new THREE.Mesh(railSideGeo, glassMatRailing);
                    rL.position.set(-houseWidth / 2 - 20, floorH * 2 + roofThickness + railH / 2, 0);
                    building.add(rL);

                    const rR = rL.clone();
                    rR.position.x = houseWidth / 2 + 20;
                    building.add(rR);
                } else {
                    // Classic Peaked Roof
                    const mainRoofKey = `mainRoof_${houseWidth}_${houseDepth}`;
                    if (!geometryCache[mainRoofKey]) {
                        const s = new THREE.Shape(); s.moveTo(-houseWidth / 2 - 20, 0); s.lineTo(0, roofH); s.lineTo(houseWidth / 2 + 20, 0);
                        geometryCache[mainRoofKey] = new THREE.ExtrudeGeometry(s, { depth: houseDepth + 40, bevelEnabled: false });
                    }
                    const mR = new THREE.Mesh(geometryCache[mainRoofKey], hRoofMat);
                    mR.position.set(0, floorH * 2, -houseDepth / 2 - 20);
                    building.add(mR);
                    if (hasWing) {
                        const wingRoofKey = `wingRoof_${wingW}_${wingLen}`;
                        if (!geometryCache[wingRoofKey]) {
                            const s = new THREE.Shape(); s.moveTo(-wingW / 2 - 20, 0); s.lineTo(0, roofH); s.lineTo(wingW / 2 + 20, 0);
                            geometryCache[wingRoofKey] = new THREE.ExtrudeGeometry(s, { depth: wingLen + 130, bevelEnabled: false });
                        }
                        const wR = new THREE.Mesh(geometryCache[wingRoofKey], hRoofMat);
                        wR.rotation.y = -Math.PI / 2;
                        wR.position.set(-(houseWidth / 2 - 112), floorH * 2, houseDepth / 2 - wingW / 2);
                        building.add(wR);
                    }
                }
            }

            // --- Realistic Boundary Trees ---
            const tScale = 20; // Exact uniform height
            const treeSpacing = 220;
            const treeInland = 45;
            let treeIdx = 0; // For alternating pattern

            const addBoundaryTree = (x, z) => {
                // Alternating pattern: GTree, Standard, GTree...
                const isG = (treeIdx % 2 === 0);
                const t = isG ? createGTree(1.0) : createHighQualityTree();
                t.position.set(x, 0, z);

                const currentHeight = isG ? wallGTreeHeight : wallStdTreeHeight;
                t.scale.set(currentHeight, currentHeight, currentHeight);
                t.name = isG ? "wallGTree" : "wallStdTree";

                house.add(t);
                treeIdx++;
            };

            // Boundary trees restored with safer offset
            const treeInlandOffset = 60;
            // Back boundary
            for (let x = -plotW / 2 + treeInlandOffset; x <= plotW / 2 - treeInlandOffset; x += treeSpacing) {
                addBoundaryTree(x, plotD / 2 - treeInlandOffset);
            }
            // Side boundaries
            if (skipWall !== 'left') {
                for (let z = -plotD / 2 + treeInlandOffset; z <= plotD / 2 - treeInlandOffset; z += treeSpacing) {
                    addBoundaryTree(-plotW / 2 + treeInlandOffset, z);
                }
            }
            if (skipWall !== 'right') {
                for (let z = -plotD / 2 + treeInlandOffset; z <= plotD / 2 - treeInlandOffset; z += treeSpacing) {
                    addBoundaryTree(plotW / 2 - treeInlandOffset, z);
                }
            }
            // Front boundary trees removed — they were ending up in the center of roads
            // when houses are placed along road curves via createCurveHouseBunch/createHouseCluster.
            // The front (gate) side faces the road, so these trees overlap the road surface.

            house.scale.set(0.015, 0.015, 0.015); house.rotation.y = Math.PI;

            // Cache before return
            houseMeshCache.set(cacheKey, house.clone());
            return house;
        }

        class RiverSystem {
            constructor(scene, points, options = {}) {
                this.scene = scene;
                this.points = points;
                this.color = new THREE.Color(options.color || 0x0077ff);
                this.width = options.width || 4.5;
                this.thickness = options.thickness || 0.1;
                this.pos = options.position || { x: 0, y: 0, z: 0 };
                this.rot = options.rotation || { x: 0, y: 0, z: 0 };

                this.shaderMaterial = null;
                this.mesh = null;
                this.edgeMesh = null;

                this._init();
            }

            _init() {
                // High-quality centripetal curve for smooth turns
                const curve = new THREE.CatmullRomCurve3(this.points, false, 'centripetal');
                const tubeGeometry = new THREE.TubeGeometry(curve, 512, this.width, 16, false);

                const vertexShader = `
                    varying vec2 vUv;
                    uniform float uTime;
                    void main() {
                        vUv = uv;
                        vec3 pos = position;
                        // Animated water vertical movement
                        float wave = sin(pos.x * 0.15 + uTime * 2.5) * 0.4;
                        pos.y += wave;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `;

                const fragmentShader = `
                    uniform vec3 uColor;
                    uniform float uTime;
                    varying vec2 vUv;
                    void main() {
                        // High-quality scrolling ripples from the image
                        float ripple = sin((vUv.x * 20.0) - (uTime * 2.5)) * 0.5 + 0.5;
                        
                        // Center-to-edge glow like the reference image
                        float centerDist = abs(vUv.y - 0.5) * 2.0; 
                        float highlight = pow(1.0 - centerDist, 4.0);
                        
                        vec3 baseColor = mix(uColor * 0.6, uColor + vec3(0.2, 0.4, 0.6), highlight);
                        baseColor += ripple * 0.15 * highlight; 
                        
                        gl_FragColor = vec4(baseColor, 1.0); // Full opacity for city visibility
                    }
                `;

                this.shaderMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uColor: { value: this.color }
                    },
                    vertexShader: vertexShader,
                    fragmentShader: fragmentShader,
                    transparent: false // Make it solid for better visibility
                });

                this.mesh = new THREE.Mesh(tubeGeometry, this.shaderMaterial);
                this.mesh.scale.set(1, this.thickness, 1);
                this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
                this.mesh.rotation.set(this.rot.x, this.rot.y, this.rot.z);

                this.scene.add(this.mesh);
            }

            update(time) {
                if (this.shaderMaterial && this.shaderMaterial.uniforms) {
                    this.shaderMaterial.uniforms.uTime.value = time;
                }
            }

            dispose() {
                this.scene.remove(this.mesh);
                if (this.edgeMesh) this.scene.remove(this.edgeMesh);
                this.mesh.geometry.dispose();
                this.shaderMaterial.dispose();
            }
        }


        /** Horizontal connector roads between stacked block groups (south → north). */
        function addInterBlockRoads(blockGroups) {
            if (!blockGroups || blockGroups.length < 2 || !scene) return;
            const asphaltMat = getSharedMaterial('asphaltBase', () => new THREE.MeshStandardMaterial({
                color: 0x222222,
                roughness: 0.9,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            }));
            for (let i = 0; i < blockGroups.length - 1; i++) {
                const southBlock = blockGroups[i];
                const northBlock = blockGroups[i + 1];
                southBlock.updateMatrixWorld(true);
                northBlock.updateMatrixWorld(true);
                const southBox = new THREE.Box3().setFromObject(southBlock);
                const northBox = new THREE.Box3().setFromObject(northBlock);
                const midZ = (southBox.min.z + northBox.max.z) * 0.5;
                const width = Math.max(southBox.max.x - southBox.min.x, northBox.max.x - northBox.min.x);
                const midX = (southBox.min.x + southBox.max.x + northBox.min.x + northBox.max.x) * 0.25;
                const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, 4.5), asphaltMat);
                road.position.set(midX, 0.16, midZ);
                road.receiveShadow = true;
                road.userData.noOptimize = true;
                scene.add(road);
            }
        }

        /**
         * Creates a bunch of houses organized in two serial blocks (Odd & Even).
         * Each serial comes in a pair (A & B).
         */
        function createHouseBunch(parent, options) {
            const houseScale = 0.015;
            const hScale = options.hScale || 1;

            // 1. Inner Gap: House to Walls (Scales the 'plotWidth' minus 'hWidth')
            const igScaleRaw = options.innerGapScale !== undefined ? options.innerGapScale : 1;
            const igx = (typeof igScaleRaw === 'object') ? (igScaleRaw.x !== undefined ? igScaleRaw.x : 1) : igScaleRaw;
            const igy = (typeof igScaleRaw === 'object') ? (igScaleRaw.y !== undefined ? igScaleRaw.y : 1) : igScaleRaw;

            // 2. Outer Gap: Walls to Land Plot Edge (Scales the paddingLeft/Right/Top/Bottom)
            const ogScaleRaw = options.outerGapScale !== undefined ? options.outerGapScale : 1;
            const ogx = (typeof ogScaleRaw === 'object') ? (ogScaleRaw.x !== undefined ? ogScaleRaw.x : 1) : ogScaleRaw;
            const ogy = (typeof ogScaleRaw === 'object') ? (ogScaleRaw.y !== undefined ? ogScaleRaw.y : 1) : ogScaleRaw;

            const {
                serialCount = 10,
                startX = 0,
                startZ = 0,
                hWidthNominal = options.hWidth || 220,
                hDepthNominal = options.hDepth || 280,
                basePlotW = options.basePlotW || 900,
                basePlotD = options.basePlotD || 1200,
                startId = 1,
                clusterName = "CLUSTER-6",
                hasCarParking = false
            } = options;

            // Decouple building scale from area scale for custom designs
            const areaHScale = (options.houseDesign === 'custom' || options.houseDesign === 'customV2') ? 1 : hScale;

            // Calculate the actual Wall Boundary (Plot Width/Depth)
            // Use Math.max to prevent negative plot sizes if building is larger than base plot
            const plotWidth = (hWidthNominal * areaHScale) + Math.max(0, (basePlotW * areaHScale - (hWidthNominal * areaHScale))) * igx;
            const plotDepth = (hDepthNominal * areaHScale) + Math.max(0, (basePlotD * areaHScale - (hDepthNominal * areaHScale))) * igy;

            const unitSpacing = options.unitSpacing ? (options.unitSpacing * areaHScale) : (plotWidth * houseScale);
            const rowSpacing = options.rowSpacing ? (options.rowSpacing * areaHScale) : (plotDepth * houseScale);

            const paddingLeft = (options.paddingLeft || 2) * areaHScale * ogx;
            const paddingRight = (options.paddingRight || 2) * areaHScale * ogx;
            const paddingTop = (options.paddingTop || 2) * areaHScale * ogy;
            const paddingBottom = (options.paddingBottom || 2) * areaHScale * ogy;
            const landThickness = 3.5;

            const bunchGroup = new THREE.Group();
            bunchGroup.position.set(startX, 0, startZ);
            parent.add(bunchGroup);

            // Calculate Bunch Land Size including padding
            const totalUnits = Math.ceil(serialCount / 2);
            const landWidth = totalUnits * unitSpacing + paddingLeft + paddingRight;
            const landDepth = (2 * rowSpacing) + paddingTop + paddingBottom;

            // Create Bunch Land Area as a 3D Box
            const landGeo = new THREE.BoxGeometry(landWidth, landThickness, landDepth);
            const landMat = new THREE.MeshBasicMaterial({
                color: 0xA9DA3F,
                // color: 0xc1d86c,
                polygonOffset: true,
                polygonOffsetFactor: 3,
                polygonOffsetUnits: 3
            });
            const landMesh = new THREE.Mesh(landGeo, landMat);

            // Positioning the land box
            const centerX = ((totalUnits - 1) * unitSpacing) / 2 + (paddingRight - paddingLeft) / 2;
            const centerZ = (rowSpacing / 2) + (paddingBottom - paddingTop) / 2;
            landMesh.position.set(centerX, -landThickness / 2 + 0.01, centerZ);
            bunchGroup.add(landMesh);

            // --- Boundary Trees Removed ---



            const oddRow = new THREE.Group();
            const evenRow = new THREE.Group();
            evenRow.position.z = rowSpacing;

            const housesGroup = new THREE.Group();
            housesGroup.position.set(options.x || 0, options.y || 0, options.z || 0);
            // houseAreaRotation: rotates entire block of houses together (land excluded)
            if (options.houseAreaRotation !== undefined) {
                housesGroup.rotation.y = options.houseAreaRotation * (Math.PI / 180);
            }

            housesGroup.add(oddRow);
            housesGroup.add(evenRow);
            bunchGroup.add(housesGroup);

            // Add Cluster Label in the middle
            if (clusterName) {
                const labelCanvas = document.createElement('canvas');
                labelCanvas.width = 512; labelCanvas.height = 128;
                const lctx = labelCanvas.getContext('2d');
                lctx.fillStyle = 'rgba(255, 255, 0, 0.8)'; // Yellow background
                lctx.fillRect(0, 0, 512, 128);
                lctx.fillStyle = '#000000';
                lctx.font = 'bold 80px Arial';
                lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
                lctx.fillText(clusterName, 256, 64);

                const labelTex = new THREE.CanvasTexture(labelCanvas);
                const labelGeo = new THREE.PlaneGeometry(6, 1.5);
                const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
                const label = new THREE.Mesh(labelGeo, labelMat);
                label.rotation.x = -Math.PI / 2;
                label.position.set(((totalUnits - 1) * unitSpacing) / 2, 0.05, rowSpacing / 2);
                bunchGroup.add(label);
            }

            for (let i = 0; i < serialCount; i++) {
                const serialNum = startId + i;
                const formattedId = "H-" + serialNum.toString().padStart(2, '0');
                const unitGroup = new THREE.Group();

                // Position the unit in two rows (Odd/Even)
                const localIdx = Math.floor(i / 2);
                unitGroup.position.x = localIdx * unitSpacing;

                // hRotate: rotates only the building mesh (passed into createHouse)
                const hRotateVal = options.hRotate !== undefined ? options.hRotate : 0;
                // houseRotation: rotates each individual plot/unit (walls + building)
                const unitRotation = options.houseRotation !== undefined ? options.houseRotation * (Math.PI / 180) : 0;
                const house = createHouse(formattedId, plotWidth, plotDepth, null, false, options.carCount || 1, false, hDepthNominal * areaHScale, hWidthNominal * areaHScale, true, (options.hFloorH || 100) * hScale, (options.houseOX || 0), (options.houseOZ || 0), (options.poolOX || 0), (options.poolOZ || 0), (options.carOX || 0), (options.carOZ || 0), (options.playOX || 0), (options.playOZ || 0), (options.carW !== undefined ? options.carW : 80) * hScale, (options.carL !== undefined ? options.carL : 160) * hScale, igScaleRaw, false, options.hasCarParking !== undefined ? options.hasCarParking : true, options.houseDesign || 'standard', hScale, hRotateVal);
                unitGroup.add(house);

                if (serialNum % 2 !== 0) {
                    unitGroup.rotation.y = Math.PI + unitRotation; // Face opposite + per-unit rotation
                    oddRow.add(unitGroup);
                } else {
                    unitGroup.rotation.y = unitRotation;
                    evenRow.add(unitGroup);
                }

                // Removed extra tree at the front side of the house area
            }

            return bunchGroup;
        }
        function createHouseCluster(parent, options) {
            const houseScale = 0.015;
            const hScale = options.hScale || 1;

            // 1. Inner Gap: House to Walls (Scales the 'plotWidth' minus 'hWidth')
            const igScaleRaw = options.innerGapScale !== undefined ? options.innerGapScale : 1;
            const igx = (typeof igScaleRaw === 'object') ? (igScaleRaw.x !== undefined ? igScaleRaw.x : 1) : igScaleRaw;
            const igy = (typeof igScaleRaw === 'object') ? (igScaleRaw.y !== undefined ? igScaleRaw.y : 1) : igScaleRaw;

            // 2. Outer Gap: Walls to Land Plot Edge (Scales the paddingLeft/Right/Top/Bottom)
            const ogScaleRaw = options.outerGapScale !== undefined ? options.outerGapScale : 1;
            const ogx = (typeof ogScaleRaw === 'object') ? (ogScaleRaw.x !== undefined ? ogScaleRaw.x : 1) : ogScaleRaw;
            const ogy = (typeof ogScaleRaw === 'object') ? (ogScaleRaw.y !== undefined ? ogScaleRaw.y : 1) : ogScaleRaw;

            const {
                serialCount = 20,
                startX = 0,
                startZ = 0,
                hWidthNominal = options.hWidth || 220,
                hDepthNominal = options.hDepth || 280,
                basePlotW = options.basePlotW || 900,
                basePlotD = options.basePlotD || 1000,
                startId = 1,
                clusterName = "CLUSTER-6",
                carCount = 1,
                hasCarParking = false,
                hasPlayground = false,
                singleRow = false,
                hFloorH = (options.hFloorH || 100) * hScale,
                rotation = 0
            } = options;

            const wantsPool = options.hasPool === true;
            const poolPassX = wantsPool ? (options.poolOX || 0) : 0;
            const poolPassZ = wantsPool ? (options.poolOZ || 0) : 0;

            // Decouple building scale from area scale for custom designs
            const areaHScale = (options.houseDesign === 'custom' || options.houseDesign === 'customV2') ? 1 : hScale;

            // Calculate Wall Boundary (Plot Width/Depth)
            // Use Math.max to prevent negative plot sizes if building is larger than base plot
            const plotWidth = (hWidthNominal * areaHScale) + Math.max(0, (basePlotW * areaHScale - (hWidthNominal * areaHScale))) * igx;
            const plotDepth = (hDepthNominal * areaHScale) + Math.max(0, (basePlotD * areaHScale - (hDepthNominal * areaHScale))) * igy;

            const unitSpacing = options.unitSpacing ? (options.unitSpacing * areaHScale) : (plotWidth * houseScale);
            const rowSpacing = options.rowSpacing ? (options.rowSpacing * areaHScale) : (plotDepth * houseScale);

            const paddingLeft = (options.paddingLeft || 2) * areaHScale * ogx;
            const paddingRight = (options.paddingRight || 2) * areaHScale * ogx;
            const paddingTop = (options.paddingTop || 3.5) * areaHScale * ogy;
            const paddingBottom = (options.paddingBottom || 3.5) * areaHScale * ogy;
            const landThickness = 3.5;

            const clusterGroup = new THREE.Group();
            clusterGroup.position.set(startX, 0, startZ);
            // Apply AreaRotation to rotate the entire cluster block
            if (options.AreaRotation) {
                clusterGroup.rotation.y = options.AreaRotation * (Math.PI / 180);
            }
            parent.add(clusterGroup);

            // Calculate Bunch Land Size including padding based on scaled house plot depth
            const hPlotScaledDepth = plotDepth * houseScale;
            const totalUnits = singleRow ? serialCount : Math.ceil(serialCount / 2);
            const landWidth = totalUnits * unitSpacing + paddingLeft + paddingRight;
            // landDepth covers from -(hPlotScaledDepth/2) to (rowSpacing + hPlotScaledDepth/2)
            const landDepth = (singleRow ? hPlotScaledDepth : (rowSpacing + hPlotScaledDepth)) + paddingTop + paddingBottom;

            // Create Bunch Land Area as a 3D Box
            const landGeo = new THREE.BoxGeometry(landWidth, landThickness, landDepth);
            const landMat = new THREE.MeshBasicMaterial({
                color: 0xA9DA3F,
                // color: 0xc1d86c,
                polygonOffset: true,
                polygonOffsetFactor: 3,
                polygonOffsetUnits: 3
            });
            const landMesh = new THREE.Mesh(landGeo, landMat);

            // Positioning the land box - Restored to center between rows
            const centerX = ((totalUnits - 1) * unitSpacing) / 2 + (paddingRight - paddingLeft) / 2;
            const centerZ = (singleRow ? 0 : rowSpacing / 2) + (paddingBottom - paddingTop) / 2;
            landMesh.position.set(centerX, -landThickness / 2 + 0.01, centerZ);
            clusterGroup.add(landMesh);

            // --- Add Trees to Block Perimeter (Wall Boundary) ---
            // Removed extra trees outside plot boundaries

            const oddRow = new THREE.Group();
            const evenRow = new THREE.Group();

            // Restore original Z positions to prevent moving existing clusters
            oddRow.position.z = 0;
            evenRow.position.z = singleRow ? 0 : rowSpacing;

            const housesGroup = new THREE.Group();
            housesGroup.position.set(options.x || 0, options.y || 0, options.z || 0);
            // houseAreaRotation: rotates entire houses block together (land excluded)
            if (options.houseAreaRotation !== undefined) {
                housesGroup.rotation.y = options.houseAreaRotation * (Math.PI / 180);
            }

            if (!singleRow) housesGroup.add(oddRow);
            housesGroup.add(evenRow);
            clusterGroup.add(housesGroup);

            // Add Cluster Label in the middle
            if (clusterName) {
                const labelCanvas = document.createElement('canvas');
                labelCanvas.width = 512; labelCanvas.height = 128;
                const lctx = labelCanvas.getContext('2d');
                lctx.fillStyle = 'rgba(255, 255, 0, 0.8)'; // Yellow background
                lctx.fillRect(0, 0, 512, 128);
                lctx.fillStyle = '#000000';
                lctx.font = 'bold 80px Arial';
                lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
                lctx.fillText(clusterName, 256, 64);

                const labelTex = new THREE.CanvasTexture(labelCanvas);
                const labelGeo = new THREE.PlaneGeometry(6, 1.5);
                const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
                const label = new THREE.Mesh(labelGeo, labelMat);
                label.rotation.x = -Math.PI / 2;
                // Center the label between house rows (Restored to previous correct position)
                label.position.set(((totalUnits - 1) * unitSpacing) / 2, 0.05, rowSpacing / 2);
                clusterGroup.add(label);
            }

            for (let i = 0; i < serialCount; i++) {
                const serialNum = startId + i;
                const formattedId = "H-" + serialNum.toString().padStart(2, '0');
                const unitGroup = new THREE.Group();

                // Position the unit
                const localIdx = singleRow ? i : Math.floor(i / 2);
                unitGroup.position.x = localIdx * unitSpacing;

                // hRotate: rotates only the building mesh (passed into createHouse)
                const hRotateVal = options.hRotate !== undefined ? options.hRotate : 0;
                // houseRotation: rotates each individual plot/unit (walls + building)
                // 'rotation' is legacy alias for houseRotation in createHouseCluster
                const unitRot = options.houseRotation !== undefined ? options.houseRotation : (rotation || 0);
                const unitRotRad = unitRot * (Math.PI / 180);
                const house = createHouse(formattedId, plotWidth, plotDepth, null, wantsPool, carCount, hasPlayground, hDepthNominal * areaHScale, hWidthNominal * areaHScale, options.hasWing !== undefined ? options.hasWing : true, hFloorH, (options.houseOX || 0), (options.houseOZ || 0), poolPassX, poolPassZ, (options.carOX || 0), (options.carOZ || 0), (options.playOX || 0), (options.playOZ || 0), (options.carW !== undefined ? options.carW : 80) * hScale, (options.carL !== undefined ? options.carL : 160) * hScale, options.innerGapScale || options.paddingScale || 1, false, hasCarParking, options.houseDesign || 'standard', hScale, hRotateVal);

                unitGroup.add(house);

                if (singleRow) {
                    unitGroup.rotation.y = unitRotRad;
                    evenRow.add(unitGroup);
                } else {
                    if (serialNum % 2 !== 0) {
                        unitGroup.rotation.y = Math.PI + unitRotRad; // Face opposite + per-unit rotation
                        oddRow.add(unitGroup);
                    } else {
                        unitGroup.rotation.y = unitRotRad;
                        evenRow.add(unitGroup);
                    }
                }

                // Removed extra tree at the front side of the house area (near road)
            }

            return clusterGroup;
        }

        // --- METRO MATERIALS ---
        const infraMat = new THREE.MeshPhongMaterial({ color: 0xb9b9b9 });
        const mRoofMat = new THREE.MeshPhongMaterial({ color: 0xDAD3C9 });
        const greenMat = new THREE.MeshPhongMaterial({ color: 0x22c55e });
        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x14532d });
        const redGlassMat = new THREE.MeshPhongMaterial({
            color: 0xef4444,
            emissive: 0x440000,
            shininess: 100
        });
        const skyGlassMat = new THREE.MeshPhongMaterial({
            color: 0xaaddff,
            shininess: 120,
            opacity: 0.6,
            transparent: true,
            emissive: 0x224466,
            emissiveIntensity: 0.2
        });

        // --- METRO INFRASTRUCTURE ---
        function buildInfra() {
            const group = new THREE.Group();
            const L = 1500; // Increased length for longer metro road

            const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 1.8, 12), infraMat);
            deck.position.y = -0.6;
            group.add(deck);

            for (let i = -L / 2; i <= L / 2; i += 60) {
                const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 60, 6), infraMat);
                pier.position.set(i, -30, 0);
                group.add(pier);
            }

            const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(L, 2, 0.5), infraMat);
            wallLeft.position.set(0, 0.9, -5.8);
            const wallRight = wallLeft.clone(); wallRight.position.z = 5.8;
            group.add(wallLeft, wallRight);

            const railMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
            [-3.2, -1.2, 1.2, 3.2].forEach(z => {
                const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, 0.2), railMat);
                r.position.set(0, 0.45, z);
                group.add(r);
            });

            group.position.set(-100, 20, 1000);
            group.rotation.set(0, 0, 0); // No rotation - straight track
            scene.add(group);
        }

        // --- SHOP MARKET SYSTEM (Optimized) ---
        function sm_applyTexture(material, url, repeatX = 1, repeatY = 1) {
            if (url) {
                const loader = new THREE.TextureLoader();
                loader.setCrossOrigin('anonymous');
                loader.load(url, (tex) => {
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(repeatX, repeatY);
                    material.map = tex;
                    material.needsUpdate = true;
                });
            }
        }

        function sm_finalizeMesh(mesh, group, config) {
            const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = config;
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            return mesh;
        }

        function sm_createWall(config, group) {
            const { w = 5, h = 3, t = 0.2, color = 0xB8AAA6, useTexture = false, textureUrl = '' } = config;
            const geoKey = `sm_wall_${w}_${h}_${t}`;
            const geometry = getSharedGeometry(geoKey, () => {
                const g = new THREE.BoxGeometry(w, h, t);
                g.translate(0, h / 2, 0);
                return g;
            });
            const matKey = `sm_wall_mat_${color}_${textureUrl}`;
            const material = getSharedMaterial(matKey, () => {
                const m = new THREE.MeshStandardMaterial({ color: color });
                if (useTexture && textureUrl) sm_applyTexture(m, textureUrl, w / 2, h / 2);
                return m;
            });
            const wall = new THREE.Mesh(geometry, material);
            return sm_finalizeMesh(wall, group, config);
        }

        function sm_createFloor(config, group) {
            const { w = 5, d = 5, t = 0.15, color = 0xBBA990 } = config;
            const geoKey = `sm_floor_${w}_${d}_${t}`;
            const geometry = getSharedGeometry(geoKey, () => {
                const g = new THREE.BoxGeometry(w, t, d);
                g.translate(0, t / 2, 0);
                return g;
            });
            const matKey = `sm_floor_mat_${color}`;
            const material = getSharedMaterial(matKey, () => new THREE.MeshStandardMaterial({ color: color }));
            const floor = new THREE.Mesh(geometry, material);
            return sm_finalizeMesh(floor, group, config);
        }

        function sm_createStoreFront(config, group) {
            const { w = 4, h = 3.5, frameT = 0.12, color = 0x222222 } = config;
            const subGroup = new THREE.Group();
            const frameMat = getSharedMaterial(`sm_frame_mat_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.8 }));
            const glassMat = getSharedMaterial('sm_glass_mat', () => new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, metalness: 0.95, roughness: 0.05 }));

            const geoKey = `sm_sf_frame_${w}_${h}_${frameT}`;
            const frameGeo = getSharedGeometry(geoKey, () => {
                const geos = [];
                const addPart = (fw, fh, fd, px, py, pz) => {
                    const g = new THREE.BoxGeometry(fw, fh, fd);
                    g.translate(px, py, pz);
                    geos.push(g);
                };
                addPart(w, frameT, 0.3, 0, h - frameT / 2, 0);
                addPart(w, frameT, 0.3, 0, frameT / 2, 0);
                addPart(frameT, h, 0.3, -w / 2 + frameT / 2, h / 2, 0);
                addPart(frameT, h, 0.3, w / 2 - frameT / 2, h / 2, 0);
                addPart(frameT * 0.8, h - frameT * 2, 0.2, 0, h / 2, 0);
                addPart(w - frameT * 2, frameT * 0.5, 0.2, 0, h * 0.7, 0);
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });

            const glassGeoKey = `sm_sf_glass_${w}_${h}_${frameT}`;
            const glassGeo = getSharedGeometry(glassGeoKey, () => {
                const g = new THREE.BoxGeometry(w - frameT * 2, h - frameT * 2, 0.05);
                g.translate(0, h / 2, 0);
                return g;
            });

            subGroup.add(new THREE.Mesh(frameGeo, frameMat));
            subGroup.add(new THREE.Mesh(glassGeo, glassMat));
            return sm_finalizeMesh(subGroup, group, config);
        }

        function sm_createSignboard(config, group) {
            const { w = 4, h = 1, d = 0.4, text = 'MARKET', color = 0xef4444, fontSize = 60, intensity = 1.2 } = config;
            const subGroup = new THREE.Group();
            const boardMat = getSharedMaterial(`sm_board_mat_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.6 }));
            const boardGeo = getSharedGeometry(`sm_board_geo_${w}_${h}_${d}`, () => {
                const g = new THREE.BoxGeometry(w, h, d);
                g.translate(0, h / 2, 0);
                return g;
            });
            subGroup.add(new THREE.Mesh(boardGeo, boardMat));

            const textMatKey = `sm_text_mat_${text}_${color}_${fontSize}_${intensity}`;
            const textMat = getSharedMaterial(textMatKey, () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 512; canvas.height = 128;
                ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.strokeStyle = 'white'; ctx.lineWidth = 10;
                ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
                ctx.fillStyle = 'white'; ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(text, canvas.width / 2, canvas.height / 2);
                const texture = new THREE.CanvasTexture(canvas);
                return new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: intensity, transparent: true });
            });

            const planeGeo = getSharedGeometry(`sm_sign_plane_${w}_${h}`, () => new THREE.PlaneGeometry(w * 0.95, h * 0.85));
            const frontPlane = new THREE.Mesh(planeGeo, textMat);
            frontPlane.position.set(0, h / 2, d / 2 + 0.02);
            subGroup.add(frontPlane);
            const backPlane = frontPlane.clone();
            backPlane.rotation.y = Math.PI;
            backPlane.position.z = -d / 2 - 0.02;
            subGroup.add(backPlane);
            return sm_finalizeMesh(subGroup, group, config);
        }

        function sm_createAwning(config, group) {
            const { w = 4, d = 2.2, color1 = 0xef4444, color2 = 0xffffff } = config;
            const subGroup = new THREE.Group();
            const angle = Math.PI / 8;
            const stripCount = 14;
            const stripW = w / stripCount;

            const createMergedStrips = (isColor1) => {
                const geos = [];
                for (let i = 0; i < stripCount; i++) {
                    if ((i % 2 === 0) === isColor1) {
                        const strip = new THREE.BoxGeometry(stripW, 0.1, d);
                        strip.translate(0, 0, d / 2);
                        strip.rotateX(angle);
                        strip.translate(-w / 2 + i * stripW + stripW / 2, 0, 0);
                        geos.push(strip);
                    }
                }
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            };

            const mat1 = getSharedMaterial(`sm_awning_mat_${color1}`, () => new THREE.MeshStandardMaterial({ color: color1, roughness: 0.9 }));
            const mat2 = getSharedMaterial(`sm_awning_mat_${color2}`, () => new THREE.MeshStandardMaterial({ color: color2, roughness: 0.9 }));
            const mesh1 = new THREE.Mesh(getSharedGeometry(`sm_awn_1_${w}_${d}_${color1}`, () => createMergedStrips(true)), mat1);
            const mesh2 = new THREE.Mesh(getSharedGeometry(`sm_awn_2_${w}_${d}_${color2}`, () => createMergedStrips(false)), mat2);
            subGroup.add(mesh1, mesh2);
            return sm_finalizeMesh(subGroup, group, config);
        }

        function sm_createShelf(config, group) {
            const { w = 2.5, h = 3, d = 0.8, levels = 5, color = 0xdddddd } = config;
            const subGroup = new THREE.Group();
            const mat = getSharedMaterial(`sm_shelf_mat_${color}`, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 }));
            const geoKey = `sm_shelf_geo_${w}_${h}_${d}_${levels}`;
            const geometry = getSharedGeometry(geoKey, () => {
                const geos = [];
                const back = new THREE.BoxGeometry(w, h, 0.1);
                back.translate(0, h / 2, -d / 2);
                geos.push(back);
                for (let i = 0; i <= levels; i++) {
                    const shelf = new THREE.BoxGeometry(w, 0.08, d);
                    shelf.translate(0, (i / levels) * (h - 0.2) + 0.1, 0);
                    geos.push(shelf);
                }
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            subGroup.add(new THREE.Mesh(geometry, mat));
            return sm_finalizeMesh(subGroup, group, config);
        }

        function sm_createLight(config, group) {
            const bulbGeo = getSharedGeometry('sm_bulb', () => new THREE.SphereGeometry(0.1, 16, 16));
            const bulbMat = getSharedMaterial('sm_bulb_mat', () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa, emissiveIntensity: 2 }));
            const bulb = new THREE.Mesh(bulbGeo, bulbMat);
            return sm_finalizeMesh(bulb, group, config);
        }

        function sm_createBeamSet(config, group) {
            const { w = 0.3, h = 4, dist = 5, isCircle = false, count = 4, style = 'default' } = config;
            const subGroup = new THREE.Group();
            const mat = getSharedMaterial('sm_beam_mat', () => new THREE.MeshStandardMaterial({ color: 0xdddddd }));
            const geoKey = `sm_beam_geo_${w}_${h}_${dist}_${isCircle}_${count}_${style}`;
            const geometry = getSharedGeometry(geoKey, () => {
                const geos = [];
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
                    const g = isCircle ? new THREE.CylinderGeometry(w / 2, w / 2, h, 16) : new THREE.BoxGeometry(w, h, w);
                    g.translate(pos.px, h / 2, pos.pz);
                    geos.push(g);
                });
                return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
            });
            subGroup.add(new THREE.Mesh(geometry, mat));
            return sm_finalizeMesh(subGroup, group, config);
        }

        function sm_createRoof(config, group) {
            const { w = 6, d = 8, h = 2, style = 'pitched', color = 0xACAD99 } = config;
            const subGroup = new THREE.Group();
            const matKey = `sm_roof_mat_${color}`;
            const roofMat = getSharedMaterial(matKey, () => new THREE.MeshStandardMaterial({ color: color, roughness: 0.5, metalness: 0.3 }));
            const geoKey = `sm_roof_geo_${w}_${d}_${h}_${style}`;
            const geometry = getSharedGeometry(geoKey, () => {
                if (style === 'pitched') {
                    const geos = [];
                    const createS = (rz, ox, w_val, d_val) => {
                        const b = new THREE.BoxGeometry(w_val / 2 + 0.5, 0.1, d_val);
                        b.rotateZ(rz);
                        b.translate(ox, 0, 0);
                        return b;
                    };
                    geos.push(createS(Math.PI / 6, -w / 4, w, d));
                    geos.push(createS(-Math.PI / 6, w / 4, w, d));
                    return THREE.BufferGeometryUtils.mergeBufferGeometries(geos);
                } else {
                    const b = new THREE.BoxGeometry(w, 0.2, d);
                    return b;
                }
            });
            subGroup.add(new THREE.Mesh(geometry, roofMat));
            return sm_finalizeMesh(subGroup, group, config);
        }
        function sm_createStaticPerson(config, group) {
            const { type = 'A' } = config;
            const subGroup = new THREE.Group();

            const skinColor = type === 'A' ? 0xffdbac : 0xe0ac69;
            const shirtColor = type === 'A' ? 0xef4444 : 0x3b82f6;
            const pantsColor = type === 'A' ? 0x222222 : 0x111111;

            const skinMat = getSharedMaterial(`sm_person_skin_${type}`, () => new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 }));
            const shirtMat = getSharedMaterial(`sm_person_shirt_${type}`, () => new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 }));
            const pantsMat = getSharedMaterial(`sm_person_pants_${type}`, () => new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 }));

            const headGeo = getSharedGeometry('sm_person_head', () => {
                const g = new THREE.BoxGeometry(0.3, 0.35, 0.3);
                g.translate(0, 1.7, 0);
                return g;
            });
            const bodyGeo = getSharedGeometry('sm_person_body', () => {
                const g = new THREE.BoxGeometry(0.45, 0.6, 0.25);
                g.translate(0, 1.2, 0);
                return g;
            });
            const legsGeo = getSharedGeometry('sm_person_legs', () => {
                const g1 = new THREE.BoxGeometry(0.18, 0.9, 0.2);
                g1.translate(-0.12, 0.45, 0);
                const g2 = new THREE.BoxGeometry(0.18, 0.9, 0.2);
                g2.translate(0.12, 0.45, 0);
                return THREE.BufferGeometryUtils.mergeBufferGeometries([g1, g2]);
            });

            subGroup.add(new THREE.Mesh(headGeo, skinMat));
            subGroup.add(new THREE.Mesh(bodyGeo, shirtMat));
            subGroup.add(new THREE.Mesh(legsGeo, pantsMat));

            return sm_finalizeMesh(subGroup, group, config);
        }

        function createShopMarket(options = {}) {
            const {
                posX = 0, posY = 0, posZ = 0,
                rotY = 0, scale = 1,
                shopW = 6,
                shopConfigs = [
                    { text: 'PHARMACY', color: 0x10b981, accent: 0x059669 },
                    { text: 'BAKERY', color: 0xf59e0b, accent: 0xd97706 },
                    { text: 'CAFE', color: 0x6366f1, accent: 0x4f46e5 },
                    { text: 'GROCERY', color: 0xef4444, accent: 0xdc2626 },
                    { text: 'FASHION', color: 0xec4899, accent: 0xdb2777 },
                    { text: 'GADGETS', color: 0x3b82f6, accent: 0x2563eb }
                ]
            } = options;

            const group = new THREE.Group();
            group.position.set(posX, posY, posZ);
            group.rotation.y = rotY * (Math.PI / 180);
            group.scale.set(scale, scale, scale);

            const complexLength = shopConfigs.length * shopW;
            const startZ = -(complexLength / 2) + shopW / 2;

            sm_createFloor({ x: 0, z: 0, y: 0.01, w: complexLength + 4, d: 10, color: 0x444444, ry: Math.PI / 2 }, group);
            sm_createWall({ x: -3, z: 0, w: complexLength + 2, h: 5, ry: Math.PI / 2, color: 0xdddddd }, group);
            sm_createWall({ x: 0, y: 0, z: complexLength / 2 + 1, w: 6, h: 5, color: 0xcccccc }, group);
            sm_createWall({ x: 0, y: 0, z: -complexLength / 2 - 1, w: 6, h: 5, color: 0xcccccc }, group);
            sm_createRoof({ x: 0, z: 0, y: 5, w: complexLength + 4, d: 8, ry: Math.PI / 2, style: 'flat', color: 0x222222 }, group);
            sm_createSignboard({ x: 4.5, y: 5.2, z: 0, w: 18, h: 2.5, text: 'CITY SQUARE MARKET', color: 0x111111, ry: Math.PI / 2, fontSize: 40, intensity: 0.7 }, group);
            sm_createBeamSet({ x: 4.2, y: 5, z: -7, dist: 0, h: 1.2, w: 0.25, count: 1 }, group);
            sm_createBeamSet({ x: 4.2, y: 5, z: 7, dist: 0, h: 1.2, w: 0.25, count: 1 }, group);

            shopConfigs.forEach((sConfig, i) => {
                const sz = startZ + i * shopW;
                sm_createStoreFront({ x: 3, y: 0, z: sz, w: shopW - 0.8, h: 4, ry: Math.PI / 2 }, group);
                sm_createSignboard({ x: 3.3, y: 4, z: sz, w: shopW - 1, h: 0.8, text: sConfig.text, color: sConfig.color, ry: Math.PI / 2 }, group);
                sm_createAwning({ x: 3.5, y: 4, z: sz, w: shopW - 0.5, d: 2, color1: sConfig.accent, color2: 0xffffff, ry: Math.PI / 2 }, group);
                sm_createShelf({ x: -1, y: 0, z: sz, w: shopW - 2, h: 3, ry: Math.PI / 2 }, group);
                sm_createLight({ x: 0, y: 4.5, z: sz }, group);
                if (i < shopConfigs.length) {
                    sm_createBeamSet({ x: 3, y: 0, z: sz + shopW / 2, dist: 0, h: 5, w: 0.3, count: 1 }, group);
                }

                // Add 1-2 people standing in front of the shop
                const peopleCount = (i % 2 === 0) ? 2 : 1;
                for (let p = 0; p < peopleCount; p++) {
                    const px = 5 + (Math.sin(i * 3 + p) * 1.5); // Randomize depth (x: 3.5 to 6.5)
                    const pz = sz + (Math.cos(i * 2 + p) * 2); // Randomize position along shop width
                    const rotY = (Math.PI / 2) + (Math.sin(i + p) * 0.5); // Randomly face the shop
                    const type = (i + p) % 2 === 0 ? 'A' : 'B';
                    sm_createStaticPerson({ x: px, y: 0, z: pz, ry: rotY, type: type }, group);
                }
            });

            scene.add(group);
            return group;
        }

        // --- METRO TRAIN BUILDER ---
        function createTrain(config) {
            const trainGroup = new THREE.Group();

            for (let i = 0; i < config.count; i++) {
                const carriage = new THREE.Group();

                const body = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 3.0), mRoofMat); 
                body.position.y = 0.9;
                carriage.add(body);

                const roofL = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 0.8), mRoofMat);
                roofL.position.set(0, 1.5, -1.0); 
                carriage.add(roofL);

                const roofR = roofL.clone();
                roofR.position.z = 1.0; 
                carriage.add(roofR);

                const front = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.5, 3.0), mRoofMat); 
                front.position.x = 3.2;
                carriage.add(front);

                const back = front.clone();
                back.position.x = -3.2;
                carriage.add(back);

                const greenChassis = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 3.2), greenMat); 
                greenChassis.position.y = -0.2;
                carriage.add(greenChassis);

                const redGlass = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.1), redGlassMat);
                redGlass.position.set(0, 0.9, -1.55); 
                carriage.add(redGlass);

                const skyGlass = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.1), skyGlassMat);
                skyGlass.position.set(0, 1.5, 0); 
                carriage.add(skyGlass);

                const wheel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2), wheelMat);
                wheel1.rotation.z = Math.PI / 2;
                wheel1.position.set(-2.5, -0.4, -1.6); 
                carriage.add(wheel1);

                const wheel2 = wheel1.clone();
                wheel2.position.z = 1.6;
                carriage.add(wheel2);

                const wheel3 = wheel1.clone();
                wheel3.position.x = 2.5;
                carriage.add(wheel3);

                const wheel4 = wheel3.clone();
                wheel4.position.z = 1.6;
                carriage.add(wheel4);

                carriage.traverse(c => {
                    if (c.isMesh) {
                        c.updateMatrix();
                        c.matrixAutoUpdate = false;
                    }
                });

                carriage.position.x = i * 7;
                trainGroup.add(carriage);
            }

            trainGroup.position.set(config.posX, config.posY, config.posZ);
            trainGroup.rotation.y = config.rotY * Math.PI / 180;
            trainGroup.traverse(c => {
                c.updateMatrix();
                c.matrixAutoUpdate = false;
            });
            scene.add(trainGroup);
        }


        // Helper function to dispose of geometries and materials
        function disposeObject(obj) {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(material => material.dispose());
                } else {
                    obj.material.dispose();
                }
            }
            if (obj.children) {
                obj.children.forEach(child => disposeObject(child));
            }
        }

        // --- Small River (Lake) Helper Functions ---
        // Create a procedural sandstone brick texture for the banks
        function createBrickTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // Mortar / Sand gap color
            ctx.fillStyle = '#8d7b56';
            ctx.fillRect(0, 0, 128, 128);

            // Brick colors based on user request #d6ae64
            const brickColors = ['#800b09', '#800b09', '#800b09', '#800b09', '#800b09'];

            const w = 60, h = 2, g = 4;
            for (let y = 0; y < 128; y += h + g) {
                const off = (Math.floor(y / (h + g)) % 2 === 0) ? 0 : w / 2;
                for (let x = -w; x < 128; x += w + g) {
                    ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
                    ctx.fillRect(x + off + g / 2, y + g / 2, w, h);

                    // Subtle sun-bleached highlight
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.strokeRect(x + off + g / 2, y + g / 2, w, h);
                }
            }

            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            return tex;
        }

        // Create a procedural texture for water movement (optimized)
        function sr_createWaterTexture() {
            const canvas = document.createElement('canvas');
            canvas.width = 256;  // Reduced from 512 for better performance
            canvas.height = 256;
            const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for performance

            ctx.fillStyle = '#0077be';
            ctx.fillRect(0, 0, 256, 256);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 30; i++) {
                ctx.beginPath();
                ctx.moveTo(Math.random() * 256, Math.random() * 256);
                ctx.lineTo(Math.random() * 256, Math.random() * 256);
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 6);
            texture.generateMipmaps = true; // Enable mipmaps for better performance at distance
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            return texture;
        }

        // Helper to create a simple tree for the small river (optimized with shared geometries)
        function sr_createTree() {
            const group = new THREE.Group();
            group.name = 'srTree';
            // Normalize: height ~10 -> scale 0.1 to reach height 1.0 internally
            group.scale.set(0.1, 0.1, 0.1);

            const trunkGeo = getSharedGeometry('srTrunk', () => new THREE.CylinderGeometry(0.5, 0.7, 4, 8));
            const barkMat = getSharedMaterial('srTrunkMat', () => new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
            const trunk = new THREE.Mesh(trunkGeo, barkMat);
            trunk.userData.isTree = true;
            trunk.position.y = 2;
            group.add(trunk);

            const leafMat = getSharedMaterial('srLeafMat', () => new THREE.MeshStandardMaterial({ color: 0x2d4c1e }));
            for (let i = 0; i < 3; i++) {
                const cone = new THREE.Mesh(getSharedGeometry('srLeaf_' + i, () => new THREE.ConeGeometry(2.5 - i * 0.5, 4, 8)), leafMat);
                cone.userData.isTree = true;
                cone.position.y = 4 + (i * 2);
                group.add(cone);
            }
            return group;
        }

        function sr_createRiverAndBanks(config) {
            const sr_group = new THREE.Group();
            scene.add(sr_group);

            // Generate curve from the config's points array
            const curve = new THREE.CatmullRomCurve3(config.points);

            // Calculate river length from the curve
            const riverLength = curve.getLength();

            // Create geometries based on curve length
            const riverGeo = new THREE.PlaneBufferGeometry(config.width, riverLength, 40, config.segments);
            const bankGeo = new THREE.PlaneBufferGeometry(config.width + 13, riverLength, 40, config.segments);

            const transformGeo = (geo, yOffset) => {
                const posAttr = geo.attributes.position;
                const tmpVec = new THREE.Vector3();

                for (let i = 0; i < posAttr.count; i++) {
                    const x = posAttr.getX(i);
                    const y = posAttr.getY(i);
                    const t = (y / riverLength) + 0.5;
                    const point = curve.getPointAt(Math.max(0, Math.min(1, t)));
                    const tangent = curve.getTangentAt(Math.max(0, Math.min(1, t)));
                    const up = new THREE.Vector3(0, 1, 0);
                    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

                    tmpVec.copy(point).addScaledVector(side, x);
                    posAttr.setXYZ(i, tmpVec.x, tmpVec.y + yOffset, tmpVec.z);
                }
                posAttr.needsUpdate = true;
                geo.computeVertexNormals();
            };

            // Geometry for vertical side walls
            const wallHeight = 2;
            const wallGeo = new THREE.BufferGeometry();
            const wallVertices = [];
            const wallUvs = [];
            const wallIndices = [];

            const riverHalfW = config.width / 2;
            const bankY = 2; // Height of the bank
            const riverY = 2.8; // Height of the river water

            for (let i = 0; i <= config.segments; i++) {
                const t = i / config.segments;
                const point = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t);
                const up = new THREE.Vector3(0, 1, 0);
                const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

                // Points for the wall at this segment
                // Left Side Wall
                const pLTop = point.clone().addScaledVector(side, -riverHalfW).add(new THREE.Vector3(0, bankY, 0));
                const pLBottom = point.clone().addScaledVector(side, -riverHalfW).add(new THREE.Vector3(0, riverY, 0));
                // Right Side Wall
                const pRTop = point.clone().addScaledVector(side, riverHalfW).add(new THREE.Vector3(0, bankY, 0));
                const pRBottom = point.clone().addScaledVector(side, riverHalfW).add(new THREE.Vector3(0, riverY, 0));

                wallVertices.push(pLTop.x, pLTop.y, pLTop.z);    // 0 + i*4
                wallVertices.push(pLBottom.x, pLBottom.y, pLBottom.z); // 1 + i*4
                wallVertices.push(pRTop.x, pRTop.y, pRTop.z);    // 2 + i*4
                wallVertices.push(pRBottom.x, pRBottom.y, pRBottom.z); // 3 + i*4

                const uvDist = t * (riverLength / 20);
                wallUvs.push(0, uvDist);
                wallUvs.push(1, uvDist);
                wallUvs.push(0, uvDist);
                wallUvs.push(1, uvDist);

                if (i < config.segments) {
                    const base = i * 4;
                    // Left Wall Faces
                    wallIndices.push(base, base + 1, base + 5);
                    wallIndices.push(base, base + 5, base + 4);
                    // Right Wall Faces
                    wallIndices.push(base + 2, base + 7, base + 3);
                    wallIndices.push(base + 2, base + 6, base + 7);
                }
            }

            wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVertices, 3));
            wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
            wallGeo.setIndex(wallIndices);
            wallGeo.computeVertexNormals();

            transformGeo(riverGeo, riverY);
            transformGeo(bankGeo, bankY);

            const WATER_COLOR = 0xc8ffff;
            const brickTex = createBrickTexture();
            brickTex.repeat.set(5, riverLength / 25);

            const riverMat = new THREE.MeshStandardMaterial({
                color: WATER_COLOR,
                map: sr_waterTexture,
                roughness: 0.1,
                metalness: 0.5,
                transparent: true,
                opacity: 0.9,
                side: THREE.DoubleSide,
                depthWrite: true,
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -2,
                emissive: 0x336688,
                emissiveIntensity: 0.3
            });

            const bankMat = new THREE.MeshStandardMaterial({
                map: brickTex,
                roughness: 0.8,
                side: THREE.BackSide, // Changed to back side for bank if it is a ground plane
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });
            // Actually, DoubleSide is safer
            bankMat.side = THREE.DoubleSide;

            const wallMat = new THREE.MeshStandardMaterial({
                map: brickTex,
                roughness: 0.8,
                side: THREE.DoubleSide
            });

            sr_riverMesh = new THREE.Mesh(riverGeo, riverMat);
            sr_riverMesh.name = 'river';
            sr_bankMesh = new THREE.Mesh(bankGeo, bankMat);
            sr_bankMesh.name = 'river';
            const sr_wallMesh = new THREE.Mesh(wallGeo, wallMat);
            sr_wallMesh.name = 'river';
            sr_riverMesh.userData.noOptimize = true;
            sr_bankMesh.userData.noOptimize = true;
            sr_wallMesh.userData.noOptimize = true;

            sr_group.add(sr_riverMesh);
            sr_group.add(sr_bankMesh);
            sr_group.add(sr_wallMesh);

            // Removed tree placement along river banks

            sr_group.position.set(config.position.x || 0, config.position.y || 0, config.position.z || 0);
            sr_group.rotation.set(config.rotation.x || 0, config.rotation.y || 0, config.rotation.z || 0);
        }

        /**
         * Creates a curved cluster of houses along a provided path.
         */
        /**
         * Creates a curved cluster of houses along a provided path.
         */
        function createCurveHouseBunch(parent, config, options = {}) {
            const { points, position, rotation } = config;
            const {
                houseSpacing = 40,
                offsetDistance = 16,
                landWidth = 40,
                startId = 500,
                houseCount: customHouseCount,
                separateRows = false,
                isTerrace = false,
                innerGapScale = 1,
                outerGapScale = 1,
                basePlotW = 1200,
                basePlotD = 1500,
                hWidth = 220,
                hDepth = 280,
                houseRotation = 0,
                flipped = false,
                hasPool = true,
                carCount = 2,
                hasCarParking = false,
                hasPlayground = false,
                hFloorH = 100,
                houseOX = 0, houseOZ = 0,
                poolOX = 0, poolOZ = 0,
                carOX = 0, carOZ = 0,
                playOX = 0, playOZ = 0,
                carW = 80, carL = 160,
                totalHouses = null,
                houseDesign = 'standard',
                hScale = 1
            } = options;

            // Priority: hRotate > rotation (from options) > houseRotation > 0
            // NOTE: must be computed AFTER destructuring, not inside it,
            // because JS destructuring defaults are skipped when the key exists (even if value is 0).
            const finalHouseRotation = options.hRotate !== undefined
                ? options.hRotate
                : (options.rotation !== undefined
                    ? options.rotation
                    : houseRotation);

            const igx = (typeof innerGapScale === 'object') ? (innerGapScale.x !== undefined ? innerGapScale.x : 1) : innerGapScale;
            const igy = (typeof innerGapScale === 'object') ? (innerGapScale.y !== undefined ? innerGapScale.y : 1) : innerGapScale;
            const ogx = (typeof outerGapScale === 'object') ? (outerGapScale.x !== undefined ? outerGapScale.x : 1) : outerGapScale;
            const ogy = (typeof outerGapScale === 'object') ? (outerGapScale.y !== undefined ? outerGapScale.y : 1) : outerGapScale;

            // Decouple building scale from area scale for custom designs
            const areaHScale = (houseDesign === 'custom') ? 1 : hScale;

            // Calculate plot dimensions using innerGapScale (consistent with createHouseCluster)
            const plotWidth = (hWidth * areaHScale) + Math.max(0, (basePlotW * areaHScale - (hWidth * areaHScale))) * igx;
            const plotDepth = (hDepth * areaHScale) + Math.max(0, (basePlotD * areaHScale - (hDepth * areaHScale))) * igy;

            const curve = new THREE.CatmullRomCurve3(points);
            const totalLen = curve.getLength();

            // Calculate margin to avoid land overflow (half of plot width in world units)
            // ogy (from outerGapScale) affects the longitudinal margin
            const houseWorldWidth = plotWidth * 0.015;
            const margin = (houseWorldWidth / 2) * ogy;
            const tMargin = totalLen > (margin * 2) ? margin / totalLen : 0;
            const tStart = tMargin;
            const tEnd = 1 - tMargin;
            const activeLen = totalLen * (tEnd - tStart);

            // Determine loopCount (number of positions along the curve)
            let loopCount = customHouseCount;
            if (loopCount === undefined) {
                loopCount = Math.floor(activeLen / houseSpacing) + 1;
            }
            if (loopCount < 1) loopCount = 1;

            const group = new THREE.Group();
            group.position.set(position.x || 0, position.y || 0, position.z || 0);
            group.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
            parent.add(group);

            const housesGroup = new THREE.Group();
            housesGroup.position.set(options.x || 0, options.y || 0, options.z || 0);
            // houseAreaRotation: rotates entire houses block together (land excluded)
            if (options.houseAreaRotation !== undefined) {
                housesGroup.rotation.y = options.houseAreaRotation * (Math.PI / 180);
            }
            group.add(housesGroup);

            // Create curved land strip
            const landPoints = [];
            const segmentsCount = 100;
            for (let i = 0; i <= segmentsCount; i++) {
                const t = i / segmentsCount;
                const p = curve.getPointAt(t);
                landPoints.push(p.clone());
            }
            const landCurve = new THREE.CatmullRomCurve3(landPoints);
            // ogx affects the land width
            const finalLandWidth = landWidth * ogx;
            const landGeo = createRoadGeometry(landCurve, finalLandWidth * (separateRows ? 2 : 1), segmentsCount);
            const landMat = new THREE.MeshBasicMaterial({
                color: 0xA9DA3F,
                polygonOffset: true,
                polygonOffsetFactor: -3,
                polygonOffsetUnits: -3
            });
            const landMesh = new THREE.Mesh(landGeo, landMat);
            landMesh.position.y = 0.02;
            group.add(landMesh);

            // Removed curved boundary trees outside plot areas

            // Place houses and trees
            let housesPlaced = 0;
            const targetTotal = totalHouses || (separateRows ? loopCount * 2 : loopCount);

            // For paired placement, stepsCount = number of pairs along the curve
            const stepsCount = separateRows ? Math.ceil(targetTotal / 2) : targetTotal;

            const sampleTs = [];

            // Logic: Isolate the new Fixed-Gap system to Western Link ONLY
            // Proportional system for Zones A, B, C, D
            if (totalHouses !== null && stepsCount > 1) {
                let currentDist = 0;
                sampleTs.push(tStart);
                const unitGap = houseSpacing;

                for (let i = 1; i < stepsCount; i++) {
                    const lastT = sampleTs[sampleTs.length - 1];
                    const tangent = curve.getTangentAt(lastT).normalize();
                    const peekT = Math.min(lastT + 0.05, 1);
                    const tangentNext = curve.getTangentAt(peekT).normalize();

                    const curveAngle = tangent.angleTo(tangentNext);
                    const junctionBuffer = (curveAngle > 0.1) ? (curveAngle * offsetDistance * 1.5) : 0;

                    currentDist += unitGap + junctionBuffer;
                    const nextT = tStart + (currentDist / totalLen);

                    if (nextT > tEnd) break;
                    sampleTs.push(nextT);
                }
            } else {
                // Restore proportional spacing (Auto-spacing for A, B, C, D)
                for (let i = 0; i < stepsCount; i++) {
                    const t = stepsCount > 1 ? tStart + (i / (stepsCount - 1)) * (tEnd - tStart) : 0.5;
                    sampleTs.push(t);
                }
            }

            for (let i = 0; i < sampleTs.length; i++) {
                const t = sampleTs[i];
                const p = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).normalize();
                const normal = new THREE.Vector3(0, 1, 0);
                const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
                const angle = Math.atan2(tangent.x, tangent.z);

                // hRotRad = per-unit plot rotation (houseRotation), NOT the building-only hRotate
                const hRotRad = houseRotation * (Math.PI / 180);

                if (separateRows) {
                    // Paired Serial System: 1->2, 3->4, 5->6 matching across the road

                    // House A (Side A)
                    if (housesPlaced < targetTotal) {
                        const sideDirA = flipped ? -1 : 1;
                        const housePosA = p.clone().add(binormal.clone().multiplyScalar(offsetDistance * sideDirA));
                        const houseA = createHouse("CH-" + (startId + housesPlaced), plotWidth, plotDepth, null, hasPool, carCount, hasPlayground, hDepth * areaHScale, hWidth * areaHScale, !isTerrace, hFloorH, houseOX, houseOZ, poolOX, poolOZ, carOX, carOZ, playOX, playOZ, carW, carL, innerGapScale, isTerrace, hasCarParking, houseDesign, hScale, finalHouseRotation);

                        houseA.position.copy(housePosA);
                        houseA.position.y = 0.2;
                        houseA.rotation.y = angle + (flipped ? -Math.PI / 2 : Math.PI / 2) + hRotRad;

                        housesGroup.add(houseA);
                        housesPlaced++;
                    }

                    // House B (Side B - Matching Pair)
                    if (housesPlaced < targetTotal) {
                        const sideDirB = flipped ? 1 : -1;
                        const housePosB = p.clone().add(binormal.clone().multiplyScalar(offsetDistance * sideDirB));
                        const houseB = createHouse("CH-" + (startId + housesPlaced), plotWidth, plotDepth, null, hasPool, carCount, hasPlayground, hDepth * areaHScale, hWidth * areaHScale, !isTerrace, hFloorH, houseOX, houseOZ, poolOX, poolOZ, carOX, carOZ, playOX, playOZ, carW, carL, innerGapScale, isTerrace, hasCarParking, houseDesign, hScale, finalHouseRotation);

                        houseB.position.copy(housePosB);
                        houseB.position.y = 0.2;
                        houseB.rotation.y = angle + (flipped ? Math.PI / 2 : -Math.PI / 2) + hRotRad;

                        housesGroup.add(houseB);
                        housesPlaced++;
                    }
                } else {
                    // Single row placement
                    if (housesPlaced < targetTotal) {
                        const sideDir = flipped ? -1 : 1;
                        const housePos = p.clone().add(binormal.clone().multiplyScalar(offsetDistance * sideDir));
                        const house = createHouse("CH-" + (startId + housesPlaced), plotWidth, plotDepth, null, hasPool, carCount, hasPlayground, hDepth * areaHScale, hWidth * areaHScale, !isTerrace, hFloorH, houseOX, houseOZ, poolOX, poolOZ, carOX, carOZ, playOX, playOZ, carW, carL, innerGapScale, isTerrace, hasCarParking, houseDesign, hScale, finalHouseRotation);

                        house.position.copy(housePos);
                        house.position.y = 0.2;
                        house.rotation.y = angle + (flipped ? -Math.PI / 2 : Math.PI / 2) + hRotRad;

                        housesGroup.add(house);
                        housesPlaced++;
                    }
                }
            }
            return group;
        }

        /**
         * Creates a Zone-A House block where have 18 houses with a small pool and car,
         * which will be odd and even separate and this houses group or block 
         * controllable by Carve value (curvature), Position X Y Z and Rotation X Y.
         */
        function createZoneABlock(parent, options) {
            const {
                carve = 0,         // Curvature factor (Bulge amount)
                posX = 0, posY = 0, posZ = 0,
                rotX = 0, rotY = 0,
                serialCount = 18,
                hScale = 0.8,
                unitSpacing = 22,
                rowSpacing = 35
            } = options;

            const group = new THREE.Group();
            group.position.set(posX, posY, posZ);
            group.rotation.set(rotX * (Math.PI / 180), rotY * (Math.PI / 180), 0);
            parent.add(group);

            const totalPerRow = Math.ceil(serialCount / 2);
            const halfLen = ((totalPerRow - 1) * unitSpacing) / 2;

            // Plot sizes for createHouse
            const plotW = 800 * hScale;
            const plotD = 1000 * hScale;

            for (let i = 0; i < serialCount; i++) {
                const isEven = i % 2 === 0;
                const localIdx = Math.floor(i / 2);

                // Position along X (local to group)
                const x = -halfLen + localIdx * unitSpacing;

                // Curvature (Parabolic Offset)
                const t = totalPerRow > 1 ? localIdx / (totalPerRow - 1) : 0.5;
                const curveZ = carve * (1 - Math.pow(2 * t - 1, 2));

                // Row Z offset (separate odd/even)
                const z = (isEven ? rowSpacing / 2 : -rowSpacing / 2) + curveZ;

                const unitGroup = new THREE.Group();
                unitGroup.position.set(x, 0, z);

                // Calculate local rotation to follow the curve tangent
                const L = (totalPerRow - 1) * unitSpacing;
                const slope = L > 0 ? -8 * carve * (x / (L * L)) : 0;
                const angle = Math.atan(slope);

                unitGroup.rotation.y = -angle + (isEven ? 0 : Math.PI);

                const formattedId = "Z-A-" + (i + 1).toString().padStart(2, '0');
                // createHouse signature: id, plotW, plotD, skipWall, hasPool, carCount
                const house = createHouse(formattedId, plotW, plotD, null, true, 1);
                unitGroup.add(house);
                group.add(unitGroup);
            }

            // Create curved land base following the 'carve' curvature
            const landPoints = [];
            const segments = 20;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const lx = -halfLen - 15 + t * (halfLen * 2 + 30);
                // Re-calculate curve offset for land
                const lCurveZ = carve * (1 - Math.pow(2 * t - 1, 2));
                landPoints.push(new THREE.Vector3(lx, 0, lCurveZ));
            }

            const landCurve = new THREE.CatmullRomCurve3(landPoints);
            const landGeo = createRoadGeometry(landCurve, rowSpacing + 40, 64);
            const landMat = new THREE.MeshBasicMaterial({
                color: 0xA9DA3F,
                polygonOffset: true,
                polygonOffsetFactor: 3,
                polygonOffsetUnits: 3
            });
            const landMesh = new THREE.Mesh(landGeo, landMat);
            landMesh.position.y = -0.05; // Slightly below houses
            group.add(landMesh);

            return group;
        }

        // Optimized window resize handler with throttling
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleViewportResize, 100);
        });

