/* Cartoon Park — from park2.html */
const PARK_COLORS = {
    grass: 0x62c000, path: 0xaa7c5c, red: 0xf04d4d, blue: 0x48a1ed,
    yellow: 0xffd043, white: 0xfbfcfc, wood: 0x8a5a36, darkWood: 0x5c3d24, metal: 0x4a4a4a
};

const parkAnim = {
    windmills: [], swings: [], seesaws: [], carousels: [], spinners: [],
    ferrisWheel: null, ferrisCabins: [], hotAirBalloon: null,
    streetLampBulbs: [], streetLampLights: [], baseY: 0, speed: 1.0
};

function parkAnimReset() {
    parkAnim.windmills.length = 0;
    parkAnim.swings.length = 0;
    parkAnim.seesaws.length = 0;
    parkAnim.carousels.length = 0;
    parkAnim.spinners.length = 0;
    parkAnim.ferrisWheel = null;
    parkAnim.ferrisCabins.length = 0;
    parkAnim.hotAirBalloon = null;
    parkAnim.streetLampBulbs.length = 0;
    parkAnim.streetLampLights.length = 0;
}

function getParkMat(color, roughness = 0.8) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1, flatShading: true });
}

function buildCartoonParkGroup() {
    parkAnimReset();
    const group = new THREE.Group();
    parkCreateGround(group);
    parkPopulate(group);
    return group;
}

function updateCartoonParkAnimations(dt, time) {
    const speed = parkAnim.speed;
    parkAnim.windmills.forEach(hub => { hub.rotation.y += 1.8 * dt * speed; });
    parkAnim.swings.forEach(swing => {
        swing.mesh.rotation.x = Math.sin((time * 2.8 * speed) + swing.phase) * swing.maxAngle;
    });
    parkAnim.seesaws.forEach(seesaw => {
        seesaw.mesh.rotation.z = Math.sin((time * 2.2 * speed) + seesaw.phase) * seesaw.maxAngle;
    });
    parkAnim.carousels.forEach(car => { car.mesh.rotation.y += car.speed * dt * speed; });
    parkAnim.spinners.forEach(spinner => { spinner.rotation.y += 2.0 * dt * speed; });
    if (parkAnim.ferrisWheel) {
        parkAnim.ferrisWheel.rotation.z += 0.22 * speed * dt;
        const a = parkAnim.ferrisWheel.rotation.z;
        parkAnim.ferrisCabins.forEach(c => { c.pivot.rotation.z = -a; });
    }
    if (parkAnim.hotAirBalloon) {
        parkAnim.hotAirBalloon.position.y = parkAnim.baseY + Math.sin(time * 0.8 * speed) * 1.5;
        parkAnim.hotAirBalloon.rotation.y += 0.05 * dt * speed;
    }
}

function parkCreateGround(parent) {
            // We use a high resolution canvas to draw custom winding pathways exactly like the cartoon reference map.
            // This prevents standard Z-fighting and models the dynamic winding layout flawlessly.
            const canvas = document.createElement('canvas');
            canvas.width = 4048;
            canvas.height = 2048;
            const ctx = canvas.getContext('2d');

            // Clean bright grass fill
            ctx.fillStyle = '#62c370';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw some cartoon grass variations/flower patches
            ctx.fillStyle = '#59b666';
            for (let i = 0; i < 600; i++) {
                const rx = Math.random() * canvas.width;
                const ry = Math.random() * canvas.height;
                const size = 6 + Math.random() * 12;
                ctx.beginPath();
                ctx.arc(rx, ry, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Path styling
            ctx.strokeStyle = '#9c6c4c'; // Rich brown dirt
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const drawPathLine = (points, width) => {
                ctx.lineWidth = width;
                ctx.beginPath();
                // Map logical world coordinate [-100, 100] to Canvas [0, 2048]
                const mapPt = p => ({
                    x: ((p.x + 100) / 200) * canvas.width,
                    y: ((p.z + 100) / 200) * canvas.height
                });

                const start = mapPt(points[0]);
                ctx.moveTo(start.x, start.y);

                for (let i = 1; i < points.length; i++) {
                    const next = mapPt(points[i]);
                    ctx.lineTo(next.x, next.y);
                }
                ctx.stroke();
            };

            // Outer border path ring (thick paths)
            const outerPath = [
                {x: 0, z: 45},
                {x: -45, z: 35},
                {x: -70, z: 15},
                {x: -75, z: -15},
                {x: -60, z: -45},
                {x: -25, z: -60},
                {x: 25, z: -60},
                {x: 60, z: -45},
                {x: 75, z: -15},
                {x: 70, z: 15},
                {x: 45, z: 35},
                {x: 0, z: 45}
            ];
            drawPathLine(outerPath, 75);

            // Center cross-section pathways
            const crossPath1 = [
                {x: 0, z: 45},
                {x: 0, z: -60}
            ];
            drawPathLine(crossPath1, 65);

            const horizontalPath = [
                {x: -70, z: 5},
                {x: 70, z: 5}
            ];
            drawPathLine(horizontalPath, 65);

            // Loop enclosing the Ferris Wheel on the left
            const leftLoop = [
                {x: -40, z: 5},
                {x: -50, z: -15},
                {x: -30, z: -35},
                {x: -15, z: -15},
                {x: -40, z: 5}
            ];
            drawPathLine(leftLoop, 55);

            // Right secondary looping pathway
            const rightLoop = [
                {x: 40, z: 5},
                {x: 55, z: -20},
                {x: 35, z: -35},
                {x: 15, z: -15},
                {x: 40, z: 5}
            ];
            drawPathLine(rightLoop, 55);

            // Main southern entrance leading path
            const entrancePath = [
                {x: 0, z: 95},
                {x: 0, z: 45}
            ];
            drawPathLine(entrancePath, 90);

            // Dynamic texture creation
            const groundTex = new THREE.CanvasTexture(canvas);
            groundTex.wrapS = THREE.ClampToEdgeWrapping;
            groundTex.wrapT = THREE.ClampToEdgeWrapping;

            // Generate circular ground geometry
            const groundGeom = new THREE.CylinderGeometry(100, 102, 5, 64);
            const groundMat = new THREE.MeshStandardMaterial({
                map: groundTex,
                roughness:.9,
                metalness: 0.05
            });

            // Create materials array (top gets path map, sides get solid brown wood-like or green)
            const sideMat = new THREE.MeshStandardMaterial({ color: 0x422d1b, roughness: 0.95 });
            const groundMesh = new THREE.Mesh(groundGeom, [sideMat, groundMat, sideMat]);
            groundMesh.position.y = -2.5; // Offset cylinder height to make top surface rest at y = 0
            groundMesh.receiveShadow = true;
            parent.add(groundMesh);
        }

        // 1. Pine Tree
        function parkCreatePineTree() {
            const group = new THREE.Group();

            // Trunk
            const trunkGeom = new THREE.CylinderGeometry(0.3, 0.45, 3, 5);
            const trunkMat = getParkMat(PARK_COLORS.darkWood);
            const trunk = new THREE.Mesh(trunkGeom, trunkMat);
            trunk.position.y = 1.5;
            trunk.castShadow = true;
            group.add(trunk);

            // Conical pine segments
            const leavesMat = getParkMat(0x277240 + (Math.random() - 0.5) * 0x051105);
            
            const bottomCone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 5), leavesMat);
            bottomCone.position.y = 4;
            bottomCone.castShadow = true;
            group.add(bottomCone);

            const midCone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.6, 5), leavesMat);
            midCone.position.y = 5.8;
            midCone.castShadow = true;
            group.add(midCone);

            const topCone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.0, 5), leavesMat);
            topCone.position.y = 7.4;
            topCone.castShadow = true;
            group.add(topCone);

            // Scaling randomness to avoid uniform clones
            const scale = 0.85 + Math.random() * 0.4;
            group.scale.set(scale, scale, scale);

            return group;
        }

        // 2. Windmill
        function parkCreateWindmill() {
            const group = new THREE.Group();

            // Pyramidal Base Tower (Dark Red / Brown)
            const baseGeom = new THREE.CylinderGeometry(0.6, 2.0, 9, 4);
            baseGeom.rotateY(Math.PI/4); // Turn box structure
            const baseMat = getParkMat(0xaf4343); // Cartoon Brick Red
            const base = new THREE.Mesh(baseGeom, baseMat);
            base.position.y = 4.5;
            base.castShadow = true;
            base.receiveShadow = true;
            group.add(base);

            // Top Cap/Head (White)
            const headGeom = new THREE.SphereGeometry(1.0, 6, 6);
            const headMat = getParkMat(PARK_COLORS.white);
            const head = new THREE.Mesh(headGeom, headMat);
            head.position.y = 9.2;
            head.castShadow = true;
            group.add(head);

            // Hub for spinning sails
            const hubGroup = new THREE.Group();
            hubGroup.position.set(0, 9.2, 1.1);

            const centerHubGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.6, 6);
            centerHubGeom.rotateX(Math.PI/2);
            const hubMesh = new THREE.Mesh(centerHubGeom, getParkMat(PARK_COLORS.wood));
            hubMesh.castShadow = true;
            hubGroup.add(hubMesh);

            // 4 Blades
            for (let i = 0; i < 4; i++) {
                const bladePivot = new THREE.Group();
                bladePivot.rotation.z = (Math.PI / 2) * i;

                // Rod
                const rodGeom = new THREE.CylinderGeometry(0.08, 0.08, 4.2, 4);
                rodGeom.translate(0, 2.1, 0);
                const rod = new THREE.Mesh(rodGeom, getParkMat(PARK_COLORS.darkWood));
                rod.castShadow = true;
                bladePivot.add(rod);

                // Blade Sail Fabric (Offset Box)
                const sailGeom = new THREE.BoxGeometry(0.8, 2.8, 0.05);
                sailGeom.translate(0.35, 2.4, 0.05);
                const sail = new THREE.Mesh(sailGeom, getParkMat(PARK_COLORS.white));
                sail.castShadow = true;
                bladePivot.add(sail);

                hubGroup.add(bladePivot);
            }

            group.add(hubGroup);

            // Save for rotation loop
            parkAnim.windmills.push(hubGroup);

            return group;
        }

        // 3. Ferris Wheel (Masterpiece Element)
        function parkCreateFerrisWheel() {
            const group = new THREE.Group();

            // Blue A-frame supports
            const supportMat = getParkMat(PARK_COLORS.blue);

            const supportL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 15, 6), supportMat);
            supportL1.position.set(-1.8, 7.3, 2.8);
            supportL1.rotation.set(0.18, 0, -0.12);
            supportL1.castShadow = true;
            group.add(supportL1);

            const supportL2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 15, 6), supportMat);
            supportL2.position.set(-1.8, 7.3, -2.8);
            supportL2.rotation.set(-0.18, 0, -0.12);
            supportL2.castShadow = true;
            group.add(supportL2);

            const supportR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 15, 6), supportMat);
            supportR1.position.set(1.8, 7.3, 2.8);
            supportR1.rotation.set(0.18, 0, 0.12);
            supportR1.castShadow = true;
            group.add(supportR1);

            const supportR2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 15, 6), supportMat);
            supportR2.position.set(1.8, 7.3, -2.8);
            supportR2.rotation.set(-0.18, 0, 0.12);
            supportR2.castShadow = true;
            group.add(supportR2);

            // Central rotating wheel hub assembly
            parkAnim.ferrisWheel = new THREE.Group();
            parkAnim.ferrisWheel.position.set(0, 14.5, 0);

            // Axis Hub
            const mainAxleGeom = new THREE.CylinderGeometry(0.5, 0.5, 6.2, 8);
            mainAxleGeom.rotateX(Math.PI / 2);
            const axle = new THREE.Mesh(mainAxleGeom, getParkMat(PARK_COLORS.metal));
            axle.castShadow = true;
            parkAnim.ferrisWheel.add(axle);

            // Double Rings (Front and Back)
            const ringGeom = new THREE.TorusGeometry(10.5, 0.22, 6, 32);
            
            const ringF = new THREE.Mesh(ringGeom, getParkMat(PARK_COLORS.blue));
            ringF.position.z = 1.6;
            ringF.castShadow = true;
            parkAnim.ferrisWheel.add(ringF);

            const ringB = new THREE.Mesh(ringGeom, getParkMat(PARK_COLORS.blue));
            ringB.position.z = -1.6;
            ringB.castShadow = true;
            parkAnim.ferrisWheel.add(ringB);

            // Inner connecting structural spokes
            const spokeCount = 8;
            const colorsList = [PARK_COLORS.red, PARK_COLORS.yellow, PARK_COLORS.blue, 0xe072cf];

            for (let i = 0; i < spokeCount; i++) {
                const angle = (Math.PI * 2 / spokeCount) * i;

                // Cross spokes
                const spokeGroup = new THREE.Group();
                spokeGroup.rotation.z = angle;

                const spokeF = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 21, 4), getParkMat(PARK_COLORS.yellow));
                spokeF.position.z = 1.6;
                spokeF.castShadow = true;
                spokeGroup.add(spokeF);

                const spokeB = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 21, 4), getParkMat(PARK_COLORS.yellow));
                spokeB.position.z = -1.6;
                spokeB.castShadow = true;
                spokeGroup.add(spokeB);

                // Inner crossbar connecting rings
                const crossTie = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 4), getParkMat(PARK_COLORS.white));
                crossTie.rotateX(Math.PI / 2);
                crossTie.position.y = 10.5;
                crossTie.castShadow = true;
                spokeGroup.add(crossTie);

                parkAnim.ferrisWheel.add(spokeGroup);

                // Build Self-Leveling Cabin Hangs
                const cabinPivot = new THREE.Group();
                // Calculate actual position of cabin at edge of wheel
                cabinPivot.position.set(Math.cos(angle) * 10.5, Math.sin(angle) * 10.5, 0);

                // The Hanging Pole
                const poleGeom = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 4);
                poleGeom.translate(0, -0.9, 0);
                const pole = new THREE.Mesh(poleGeom, getParkMat(PARK_COLORS.metal));
                pole.castShadow = true;
                cabinPivot.add(pole);

                // Cabin Base
                const cabinColor = colorsList[i % colorsList.length];
                const baseGeom = new THREE.BoxGeometry(1.6, 1.2, 1.8);
                const cabinBase = new THREE.Mesh(baseGeom, getParkMat(cabinColor));
                cabinBase.position.y = -1.8;
                cabinBase.castShadow = true;
                cabinPivot.add(cabinBase);

                // Cabin Roof (Striped/Rounded look using open cylinders)
                const roofGeom = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 8, 1, false, 0, Math.PI);
                roofGeom.rotateZ(Math.PI / 2);
                const roof = new THREE.Mesh(roofGeom, getParkMat(PARK_COLORS.white));
                roof.position.set(0, -1.0, 0);
                roof.castShadow = true;
                cabinPivot.add(roof);

                parkAnim.ferrisWheel.add(cabinPivot);

                // Save references to cabins to level them dynamically during rotation
                parkAnim.ferrisCabins.push({
                    pivot: cabinPivot,
                    angle: angle
                });
            }

            group.add(parkAnim.ferrisWheel);

            // Ground safety/boarding platform structure
            const platGeom = new THREE.BoxGeometry(6, 1.5, 7);
            const plat = new THREE.Mesh(platGeom, getParkMat(PARK_COLORS.wood));
            plat.position.set(0, 0.75, 0);
            plat.receiveShadow = true;
            group.add(plat);

            // Platform handrails
            const fenceL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 7), getParkMat(PARK_COLORS.yellow));
            fenceL.position.set(-2.8, 2.2, 0);
            fenceL.castShadow = true;
            group.add(fenceL);

            const fenceR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 7), getParkMat(PARK_COLORS.yellow));
            fenceR.position.set(2.8, 2.2, 0);
            fenceR.castShadow = true;
            group.add(fenceR);

            return group;
        }

        // 4. Striped Carousel
        function parkCreateCarousel(sizeMultiplier = 1.0) {
            const group = new THREE.Group();

            // Circular Platform
            const radius = 5.5 * sizeMultiplier;
            const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.3, 0.8, 16), getParkMat(PARK_COLORS.yellow));
            base.position.y = 0.4;
            base.receiveShadow = true;
            base.castShadow = true;
            group.add(base);

            // Center Column
            const centerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * sizeMultiplier, 0.6 * sizeMultiplier, 5.5 * sizeMultiplier, 8), getParkMat(PARK_COLORS.red));
            centerCol.position.y = 3.25 * sizeMultiplier;
            centerCol.castShadow = true;
            group.add(centerCol);

            // Rotating Carousel Section
            const rotatingMesh = new THREE.Group();
            rotatingMesh.position.y = 0.8;

            // Carousel Supporting Columns
            const supportCount = 6;
            for (let i = 0; i < supportCount; i++) {
                const angle = (Math.PI * 2 / supportCount) * i;
                const dist = radius - 1.2 * sizeMultiplier;

                // Support thin golden rod
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5 * sizeMultiplier, 6), getParkMat(0xffd700)); // Gold
                rod.position.set(Math.cos(angle) * dist, 2.25 * sizeMultiplier, Math.sin(angle) * dist);
                rod.castShadow = true;
                rotatingMesh.add(rod);

                // Reusable abstract mini carousel animal placeholders (box horses!)
                const horseGeom = new THREE.BoxGeometry(0.8 * sizeMultiplier, 0.6 * sizeMultiplier, 0.3 * sizeMultiplier);
                const horseMat = getParkMat(i % 2 === 0 ? PARK_COLORS.blue : PARK_COLORS.red);
                const horse = new THREE.Mesh(horseGeom, horseMat);
                horse.position.set(Math.cos(angle) * dist, 1.8 * sizeMultiplier, Math.sin(angle) * dist);
                horse.rotation.y = -angle + Math.PI/2;
                horse.castShadow = true;
                rotatingMesh.add(horse);

                // Tiny legs/head
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.3 * sizeMultiplier, 0.4 * sizeMultiplier, 0.3 * sizeMultiplier), horseMat);
                head.position.set(Math.cos(angle) * dist + Math.sin(angle)*0.4, 2.2 * sizeMultiplier, Math.sin(angle) * dist - Math.cos(angle)*0.4);
                head.rotation.y = -angle + Math.PI/2;
                rotatingMesh.add(head);
            }

            // Alternating striped red/white roof dome
            const roofWedges = 12;
            const roofGroup = new THREE.Group();
            roofGroup.position.y = 5.2 * sizeMultiplier;

            for (let i = 0; i < roofWedges; i++) {
                const wedgeAngle = (Math.PI * 2) / roofWedges;
                const startAngle = wedgeAngle * i;

                // Procedural roof slices with alternating red and white
                const coneGeom = new THREE.ConeGeometry(radius + 0.1, 2.4 * sizeMultiplier, 12, 1, false, startAngle, wedgeAngle);
                const matColor = i % 2 === 0 ? PARK_COLORS.red : PARK_COLORS.white;
                const wedge = new THREE.Mesh(coneGeom, getParkMat(matColor));
                wedge.position.y = 1.2 * sizeMultiplier;
                wedge.castShadow = true;
                roofGroup.add(wedge);
            }
            rotatingMesh.add(roofGroup);
            group.add(rotatingMesh);

            // Save animated group
            parkAnim.carousels.push({
                mesh: rotatingMesh,
                speed: 0.8
            });

            return group;
        }

        // 5. Playground Slide
        function parkCreateSlide() {
            const group = new THREE.Group();

            // Colors
            const stepMat = getParkMat(PARK_COLORS.blue);
            const rampMat = getParkMat(PARK_COLORS.yellow);
            const sideRailMat = getParkMat(PARK_COLORS.red);

            // A-frame Ladder
            const ladderL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 4), getParkMat(PARK_COLORS.metal));
            ladderL.position.set(-1.2, 3.8, 0);
            ladderL.rotation.z = -0.15;
            ladderL.castShadow = true;
            group.add(ladderL);

            const ladderR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 4), getParkMat(PARK_COLORS.metal));
            ladderR.position.set(-1.2, 3.8, -1.5);
            ladderR.rotation.z = -0.15;
            ladderR.castShadow = true;
            group.add(ladderR);

            // Steps
            for (let i = 0; i < 7; i++) {
                const step = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 1.45), stepMat);
                step.position.set(-1.2 + (i * 0.16), 1.0 + (i * 0.95), -0.75);
                step.castShadow = true;
                group.add(step);
            }

            // High Platform
            const platform = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), stepMat);
            platform.position.set(-0.1, 7.3, -0.75);
            platform.castShadow = true;
            group.add(platform);

            // Handrails for Platform
            const rail1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.1), getParkMat(PARK_COLORS.yellow));
            rail1.position.set(-0.1, 8.0, 0.05);
            rail1.castShadow = true;
            group.add(rail1);

            const rail2 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.1), getParkMat(PARK_COLORS.yellow));
            rail2.position.set(-0.1, 8.0, -1.55);
            rail2.castShadow = true;
            group.add(rail2);

            // Elevated support poles
            const support1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.2, 4), getParkMat(PARK_COLORS.metal));
            support1.position.set(0.4, 3.6, 0);
            support1.castShadow = true;
            group.add(support1);

            const support2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.2, 4), getParkMat(PARK_COLORS.metal));
            support2.position.set(0.4, 3.6, -1.5);
            support2.castShadow = true;
            group.add(support2);

            // The Slide Ramp
            const rampGroup = new THREE.Group();
            rampGroup.position.set(0.5, 7.1, -0.75);
            rampGroup.rotation.z = -0.65; // Tilt slide down

            // Flat Sliding board
            const slideRamp = new THREE.Mesh(new THREE.BoxGeometry(11, 0.15, 1.3), rampMat);
            slideRamp.position.x = 5.2;
            slideRamp.castShadow = true;
            slideRamp.receiveShadow = true;
            rampGroup.add(slideRamp);

            // Red Protective Side Rails
            const railL = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.15), sideRailMat);
            railL.position.set(5.2, 0.3, 0.65);
            railL.castShadow = true;
            rampGroup.add(railL);

            const railR = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 0.15), sideRailMat);
            railR.position.set(5.2, 0.3, -0.65);
            railR.castShadow = true;
            rampGroup.add(railR);

            group.add(rampGroup);

            // Extra Support under mid-ramp
            const midSupport1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.0, 4), getParkMat(PARK_COLORS.metal));
            midSupport1.position.set(4.5, 2.0, -0.1);
            midSupport1.castShadow = true;
            group.add(midSupport1);

            const midSupport2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.0, 4), getParkMat(PARK_COLORS.metal));
            midSupport2.position.set(4.5, 2.0, -1.4);
            midSupport2.castShadow = true;
            group.add(midSupport2);

            return group;
        }

        // 6. Swing Set
        function parkCreateSwingSet() {
            const group = new THREE.Group();

            // Main support poles (Blue inverted U / A-Frame)
            const poleMat = getParkMat(PARK_COLORS.blue);

            const legL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8.5, 6), poleMat);
            legL1.position.set(-4.5, 4.1, 1.5);
            legL1.rotation.set(0.2, 0, -0.12);
            legL1.castShadow = true;
            group.add(legL1);

            const legL2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8.5, 6), poleMat);
            legL2.position.set(-4.5, 4.1, -1.5);
            legL2.rotation.set(-0.2, 0, -0.12);
            legL2.castShadow = true;
            group.add(legL2);

            const legR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8.5, 6), poleMat);
            legR1.position.set(4.5, 4.1, 1.5);
            legR1.rotation.set(0.2, 0, 0.12);
            legR1.castShadow = true;
            group.add(legR1);

            const legR2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8.5, 6), poleMat);
            legR2.position.set(4.5, 4.1, -1.5);
            legR2.rotation.set(-0.2, 0, 0.12);
            legR2.castShadow = true;
            group.add(legR2);

            // Horizontal top hanging bar
            const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9.8, 6), poleMat);
            topBar.rotateZ(Math.PI / 2);
            topBar.position.y = 8.1;
            topBar.castShadow = true;
            group.add(topBar);

            // Dual Hanging Swings
            const hangOffsets = [-2.0, 2.0];
            const seatMat = getParkMat(PARK_COLORS.red);
            const chainMat = getParkMat(PARK_COLORS.metal);

            hangOffsets.forEach(offsetX => {
                const swingPivot = new THREE.Group();
                swingPivot.position.set(offsetX, 8.0, 0);

                // Two chains
                const chain1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6.2, 4), chainMat);
                chain1.position.set(0, -3.1, 0.65);
                chain1.castShadow = true;
                swingPivot.add(chain1);

                const chain2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6.2, 4), chainMat);
                chain2.position.set(0, -3.1, -0.65);
                chain2.castShadow = true;
                swingPivot.add(chain2);

                // Plank Seat
                const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 1.6), seatMat);
                seat.position.y = -6.25;
                seat.castShadow = true;
                swingPivot.add(seat);

                group.add(swingPivot);

                // Register for swing animation (pendulum oscillation)
                parkAnim.swings.push({
                    mesh: swingPivot,
                    phase: Math.random() * Math.PI, // random offset
                    maxAngle: 0.35 + Math.random() * 0.15
                });
            });

            return group;
        }

        // 7. Seesaw / Teeter-Totter
        function parkCreateSeesaw() {
            const group = new THREE.Group();

            // Central Triangular Pivot Frame
            const baseGeom = new THREE.ConeGeometry(0.8, 1.5, 4);
            baseGeom.rotateY(Math.PI/4);
            const base = new THREE.Mesh(baseGeom, getParkMat(PARK_COLORS.blue));
            base.position.y = 0.75;
            base.castShadow = true;
            group.add(base);

            // Cross Axle pin
            const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), getParkMat(PARK_COLORS.metal));
            pin.rotateX(Math.PI/2);
            pin.position.y = 1.35;
            group.add(pin);

            // Pivot Arm (Long board)
            const armPivot = new THREE.Group();
            armPivot.position.y = 1.35;

            const board = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.15, 0.6), getParkMat(PARK_COLORS.yellow));
            board.castShadow = true;
            armPivot.add(board);

            // Left Seat & Handle
            const seatL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.8), getParkMat(PARK_COLORS.red));
            seatL.position.set(-3.15, 0.12, 0);
            seatL.castShadow = true;
            armPivot.add(seatL);

            const handleL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4), getParkMat(PARK_COLORS.metal));
            handleL.position.set(-2.5, 0.4, 0);
            handleL.castShadow = true;
            armPivot.add(handleL);

            // Right Seat & Handle
            const seatR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.8), getParkMat(PARK_COLORS.red));
            seatR.position.set(3.15, 0.12, 0);
            seatR.castShadow = true;
            armPivot.add(seatR);

            const handleR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 4), getParkMat(PARK_COLORS.metal));
            handleR.position.set(2.5, 0.4, 0);
            handleR.castShadow = true;
            armPivot.add(handleR);

            group.add(armPivot);

            parkAnim.seesaws.push({
                mesh: armPivot,
                phase: Math.random() * Math.PI,
                maxAngle: 0.22
            });

            return group;
        }

        // 8. Merry-Go-Round Hand Spinner
        function parkCreateSpinner() {
            const group = new THREE.Group();

            // Ground base spinning wheel
            const baseRotator = new THREE.Group();
            baseRotator.position.y = 0.25;

            const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.2, 12), getParkMat(PARK_COLORS.yellow));
            disc.castShadow = true;
            disc.receiveShadow = true;
            baseRotator.add(disc);

            // Concentric metal handrail shapes
            const railMat = getParkMat(PARK_COLORS.blue);
            for (let i = 0; i < 3; i++) {
                const angle = (Math.PI * 2 / 3) * i;
                const railX = Math.cos(angle) * 1.5;
                const railZ = Math.sin(angle) * 1.5;

                // Loop frame bar
                const barGeom = new THREE.TorusGeometry(0.8, 0.08, 6, 12, Math.PI);
                const bar = new THREE.Mesh(barGeom, railMat);
                bar.position.set(railX, 0.8, railZ);
                bar.rotation.y = -angle + Math.PI/2;
                bar.castShadow = true;
                baseRotator.add(bar);
            }

            // Central golden axis spindle
            const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), getParkMat(0xffd700));
            spindle.position.y = 0.8;
            spindle.castShadow = true;
            baseRotator.add(spindle);

            group.add(baseRotator);

            parkAnim.spinners.push(baseRotator);

            return group;
        }

        // 9. Street Lamp
        function parkCreateStreetLamp() {
            const group = new THREE.Group();

            // Lamp Post
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 6.5, 6), getParkMat(PARK_COLORS.metal));
            post.position.y = 3.25;
            post.castShadow = true;
            group.add(post);

            // Curved neck arm
            const armGeom = new THREE.TorusGeometry(0.6, 0.1, 6, 8, Math.PI / 2);
            const arm = new THREE.Mesh(armGeom, getParkMat(PARK_COLORS.metal));
            arm.position.set(0.42, 6.35, 0);
            arm.rotation.z = -Math.PI/2;
            arm.castShadow = true;
            group.add(arm);

            // Top Cap Lantern
            const lanternGeom = new THREE.CylinderGeometry(0.4, 0.24, 0.5, 6);
            const lantern = new THREE.Mesh(lanternGeom, getParkMat(PARK_COLORS.metal));
            lantern.position.set(0.92, 5.85, 0);
            lantern.castShadow = true;
            group.add(lantern);

            // Glowing Bulb
            const bulbGeom = new THREE.SphereGeometry(0.25, 6, 6);
            const bulbMat = new THREE.MeshStandardMaterial({
                color: 0xfff3a1,
                emissive: 0x222200, // Dim in day, glow at night
                roughness: 0.1
            });
            const bulb = new THREE.Mesh(bulbGeom, bulbMat);
            bulb.position.set(0.92, 5.5, 0);
            group.add(bulb);
            parkAnim.streetLampBulbs.push(bulbMat);

            // Local Point Light (Fades on at night, cast soft light on ground)
            const pointLight = new THREE.PointLight(0xfff5ab, 0.0, 16, 1.8);
            pointLight.position.set(0.92, 5.2, 0);
            pointLight.castShadow = false; // Point light shadows disabled for rendering efficiency
            group.add(pointLight);
            parkAnim.streetLampLights.push(pointLight);

            return group;
        }

        // 10. Park Bench
        function parkCreateBench() {
            const group = new THREE.Group();

            const woodMat = getParkMat(PARK_COLORS.wood);
            const ironMat = getParkMat(PARK_COLORS.metal);

            // Two iron leg frames
            const legGeom = new THREE.BoxGeometry(0.15, 0.9, 1.6);
            const legL = new THREE.Mesh(legGeom, ironMat);
            legL.position.set(-1.4, 0.45, 0);
            legL.castShadow = true;
            group.add(legL);

            const legR = new THREE.Mesh(legGeom, ironMat);
            legR.position.set(1.4, 0.45, 0);
            legR.castShadow = true;
            group.add(legR);

            // Slat Seat Plates
            const seatSlat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.35), woodMat);
            seatSlat.castShadow = true;

            const slat1 = seatSlat.clone();
            slat1.position.set(0, 0.95, -0.45);
            group.add(slat1);

            const slat2 = seatSlat.clone();
            slat2.position.set(0, 0.95, 0);
            group.add(slat2);

            const slat3 = seatSlat.clone();
            slat3.position.set(0, 0.95, 0.45);
            group.add(slat3);

            // Back support frame irons
            const backL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), ironMat);
            backL.position.set(-1.4, 1.3, -0.55);
            backL.rotation.x = -0.15;
            backL.castShadow = true;
            group.add(backL);

            const backR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), ironMat);
            backR.position.set(1.4, 1.3, -0.55);
            backR.rotation.x = -0.15;
            backR.castShadow = true;
            group.add(backR);

            // Backrest wood slats
            const backSlat1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.08), woodMat);
            backSlat1.position.set(0, 1.6, -0.63);
            backSlat1.rotation.x = -0.15;
            backSlat1.castShadow = true;
            group.add(backSlat1);

            const backSlat2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 0.08), woodMat);
            backSlat2.position.set(0, 1.15, -0.57);
            backSlat2.rotation.x = -0.15;
            backSlat2.castShadow = true;
            group.add(backSlat2);

            return group;
        }

        // 11. Entrance Archway
        function parkCreateEntranceArch() {
            const group = new THREE.Group();

            // Two main wooden pillars
            const pillarGeom = new THREE.CylinderGeometry(0.4, 0.5, 7.5, 6);
            const pillarMat = getParkMat(PARK_COLORS.wood);

            const pillarL = new THREE.Mesh(pillarGeom, pillarMat);
            pillarL.position.set(-4.5, 3.75, 0);
            pillarL.castShadow = true;
            pillarL.receiveShadow = true;
            group.add(pillarL);

            const pillarR = new THREE.Mesh(pillarGeom, pillarMat);
            pillarR.position.set(4.5, 3.75, 0);
            pillarR.castShadow = true;
            pillarR.receiveShadow = true;
            group.add(pillarR);

            // Little yellow caps on top of pillars
            const capGeom = new THREE.ConeGeometry(0.8, 1.2, 6);
            const capMat = getParkMat(PARK_COLORS.yellow);
            
            const capL = new THREE.Mesh(capGeom, capMat);
            capL.position.set(-4.5, 8.1, 0);
            capL.castShadow = true;
            group.add(capL);

            const capR = new THREE.Mesh(capGeom, capMat);
            capR.position.set(4.5, 8.1, 0);
            capR.castShadow = true;
            group.add(capR);

            // Canvas Text Banner for "CHILDREN PARK"
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');

            // Draw cartoon banner texture background
            ctx.fillStyle = '#fdfdfb';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#a56a42';
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

            // Draw colorful child text
            ctx.font = 'bold 50px Comic Sans MS, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Draw colorful rainbow stylized letters
            const text = "CHILDREN PARK";
            ctx.fillStyle = '#f04d4d'; // Red
            ctx.fillText(text, canvas.width / 2, canvas.height / 2);

            const bannerTex = new THREE.CanvasTexture(canvas);
            const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8 });

            // Curved/Horizontal cross Banner mesh
            const bannerBoard = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.8, 0.35), bannerMat);
            bannerBoard.position.set(0, 6.2, 0);
            bannerBoard.castShadow = true;
            group.add(bannerBoard);

            // Tiny swinging gates (two small wooden picket groups)
            const gateGroupL = new THREE.Group();
            gateGroupL.position.set(-4.1, 1.5, 0);
            
            // horizontal crossbars
            const gateBar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), pillarMat);
            gateBar.position.set(1.6, 0.4, 0);
            gateGroupL.add(gateBar);
            const gateBar2 = gateBar.clone();
            gateBar2.position.y = -0.4;
            gateGroupL.add(gateBar2);

            // vertical pickets
            for (let i = 0; i < 4; i++) {
                const picket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.08), getParkMat(PARK_COLORS.white));
                picket.position.set(0.6 + i*0.8, 0, 0.02);
                picket.castShadow = true;
                gateGroupL.add(picket);
            }
            // Swing left gate slightly open
            gateGroupL.rotation.y = 0.4;
            group.add(gateGroupL);

            // Right gate
            const gateGroupR = gateGroupL.clone();
            gateGroupR.position.set(4.1, 1.5, 0);
            gateGroupR.scale.x = -1; // Mirror
            gateGroupR.rotation.y = -0.5; // Swing open
            group.add(gateGroupR);

            return group;
        }

        // 12. Striped Food Booth / Cart
        function parkCreateBooth(stripedBlue = false) {
            const group = new THREE.Group();

            // Cart lower box
            const baseMat = getParkMat(stripedBlue ? PARK_COLORS.blue : PARK_COLORS.red);
            const box = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 2.2), baseMat);
            box.position.y = 1.0;
            box.castShadow = true;
            box.receiveShadow = true;
            group.add(box);

            // Counter top plate
            const counter = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.15, 2.5), getParkMat(PARK_COLORS.wood));
            counter.position.y = 2.0;
            counter.castShadow = true;
            group.add(counter);

            // Thin supporting pillars for canvas canopy
            const poleMat = getParkMat(PARK_COLORS.white);
            const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 4), poleMat);
            p1.position.set(-1.4, 3.1, 0.9);
            group.add(p1);

            const p2 = p1.clone();
            p2.position.set(1.4, 3.1, 0.9);
            group.add(p2);

            const p3 = p1.clone();
            p3.position.set(-1.4, 3.1, -0.9);
            group.add(p3);

            const p4 = p1.clone();
            p4.position.set(1.4, 3.1, -0.9);
            group.add(p4);

            // Awning Striped Canopy
            const awningGroup = new THREE.Group();
            awningGroup.position.set(0, 4.3, 0);

            // Construct alternating colorful stripes
            const stripeCount = 6;
            const stripeWidth = 3.6 / stripeCount;
            for (let i = 0; i < stripeCount; i++) {
                const stripeColor = (i % 2 === 0) ? (stripedBlue ? PARK_COLORS.blue : PARK_COLORS.red) : PARK_COLORS.white;
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(stripeWidth, 0.3, 2.4), getParkMat(stripeColor));
                stripe.position.x = -1.8 + (stripeWidth * i) + (stripeWidth/2);
                stripe.castShadow = true;
                awningGroup.add(stripe);
            }
            group.add(awningGroup);

            // Cart Wheels (Cute low-poly look)
            const wheelGeom = new THREE.CylinderGeometry(0.6, 0.6, 0.25, 8);
            wheelGeom.rotateZ(Math.PI/2);
            const wheelMat = getParkMat(PARK_COLORS.darkWood);

            const w1 = new THREE.Mesh(wheelGeom, wheelMat);
            w1.position.set(-1.1, 0.5, 1.15);
            w1.castShadow = true;
            group.add(w1);

            const w2 = w1.clone();
            w2.position.set(1.1, 0.5, 1.15);
            group.add(w2);

            const w3 = w1.clone();
            w3.position.set(-1.1, 0.5, -1.15);
            group.add(w3);

            const w4 = w1.clone();
            w4.position.set(1.1, 0.5, -1.15);
            group.add(w4);

            return group;
        }

        // 13. Hot Air Balloon
        function parkCreateHotAirBalloon() {
            const group = new THREE.Group();

            // Large colorful striped balloon sphere
            const balloonGroup = new THREE.Group();
            const sliceCount = 12;
            const radius = 5.0;

            for (let i = 0; i < sliceCount; i++) {
                const phiLength = (Math.PI * 2) / sliceCount;
                const phiStart = phiLength * i;

                // Wedge shape
                const sphereWedge = new THREE.SphereGeometry(radius, 12, 12, phiStart, phiLength);
                const matColor = i % 2 === 0 ? PARK_COLORS.red : PARK_COLORS.yellow;
                const slice = new THREE.Mesh(sphereWedge, getParkMat(matColor));
                slice.castShadow = true;
                balloonGroup.add(slice);
            }
            // Squeeze balloon on vertical axis to give classic egg drop shape
            balloonGroup.scale.set(1.0, 1.35, 1.0);
            balloonGroup.position.y = 8;
            group.add(balloonGroup);

            // Connective suspension cords (thin cylinders)
            const cordMat = getParkMat(PARK_COLORS.metal);
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI / 2) * i + Math.PI/4;
                const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.0, 4), cordMat);
                cord.position.set(Math.cos(angle) * 1.5, 2.0, Math.sin(angle) * 1.5);
                cord.rotation.z = Math.cos(angle) * -0.15;
                cord.rotation.x = Math.sin(angle) * 0.15;
                cord.castShadow = true;
                group.add(cord);
            }

            // Passenger Basket (Brown wicker-like box)
            const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), getParkMat(PARK_COLORS.wood));
            basket.position.y = 0;
            basket.castShadow = true;
            group.add(basket);

            // Scale balloon down slightly to make it look great
            group.scale.set(0.7, 0.7, 0.7);

            return group;
        }


        // --- Scene Composition Builder ---
        function parkPopulate(parent) {
            
            // --- 1. Background forest boundaries of Pine Trees ---
            // Rings around the circular platform borders to form natural cartoon background
            for (let i = 0; i < 110; i++) {
                const angle = (Math.PI * 2 / 110) * i;
                const r = 82 + Math.random() * 12;
                // Leave the front entrance area tree-free to show the beautiful sign
                if (angle > 1.25 && angle < 1.9) continue;

                const tree = parkCreatePineTree();
                tree.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
                parent.add(tree);
            }

            // Scattered internal tree clusters
            const treePositions = [
                {x: -45, z: 45}, {x: -35, z: 52}, {x: -55, z: 35},
                {x: 45, z: 45}, {x: 35, z: 52}, {x: 55, z: 35},
                {x: -65, z: -15}, {x: -55, z: -35}, {x: 55, z: -35},
                {x: 65, z: -15}, {x: -15, z: -62}, {x: 15, z: -62}
            ];
            treePositions.forEach(pos => {
                const tree = parkCreatePineTree();
                tree.position.set(pos.x + (Math.random()-0.5)*4, 0, pos.z + (Math.random()-0.5)*4);
                parent.add(tree);
            });

            // --- 2. Windmills ---
            const windmillPositions = [
                {x: -55, z: 50, rot: 0.5},
                {x: 55, z: 50, rot: -0.5},
                {x: -55, z: -55, rot: 2.1},
                {x: 55, z: -55, rot: -2.1}
            ];
            windmillPositions.forEach(pos => {
                const wm = parkCreateWindmill();
                wm.position.set(pos.x, 0, pos.z);
                wm.rotation.y = pos.rot;
                parent.add(wm);
            });

            // --- 3. Ferris Wheel ---
            const fw = parkCreateFerrisWheel();
            fw.position.set(-42, 0, -15);
            fw.rotation.y = Math.PI / 2; // Face inner paths
            parent.add(fw);

            // --- 4. Carousels ---
            // Large center carousel
            const carousel1 = parkCreateCarousel(1.0);
            carousel1.position.set(28, 0, -8);
            parent.add(carousel1);

            // Small carousel closer to back
            const carousel2 = parkCreateCarousel(0.65);
            carousel2.position.set(0, 0, -32);
            parent.add(carousel2);

            // --- 5. Slides ---
            const slide1 = parkCreateSlide();
            slide1.position.set(-25, 0, 20);
            slide1.rotation.y = -0.5;
            parent.add(slide1);

            const slide2 = parkCreateSlide();
            slide2.position.set(22, 0, 22);
            slide2.rotation.y = 0.5;
            parent.add(slide2);

            // --- 6. Swings ---
            const swing1 = parkCreateSwingSet();
            swing1.position.set(-36, 0, -42);
            swing1.rotation.y = 0.3;
            parent.add(swing1);

            const swing2 = parkCreateSwingSet();
            swing2.position.set(36, 0, -42);
            swing2.rotation.y = -0.3;
            parent.add(swing2);

            // --- 7. Seesaws ---
            const seesawPositions = [
                {x: -24, z: -5, rot: 0.8},
                {x: 24, z: -25, rot: -0.8},
                {x: 0, z: -50, rot: 1.5}
            ];
            seesawPositions.forEach(pos => {
                const ss = parkCreateSeesaw();
                ss.position.set(pos.x, 0, pos.z);
                ss.rotation.y = pos.rot;
                parent.add(ss);
            });

            // --- 8. Spinners ---
            const spinner1 = parkCreateSpinner();
            spinner1.position.set(-30, 0, -30);
            parent.add(spinner1);

            const spinner2 = parkCreateSpinner();
            spinner2.position.set(30, 0, -30);
            parent.add(spinner2);

            // --- 9. Street Lamps (Lined along winding paths) ---
            const lampPositions = [
                // Inner center paths
                {x: -12, z: 20, rot: 1.5},
                {x: 12, z: 20, rot: -1.5},
                {x: -12, z: -10, rot: 1.5},
                {x: 12, z: -10, rot: -1.5},
                // Front boundary
                {x: -8, z: 36, rot: 0.5},
                {x: 8, z: 36, rot: -0.5},
                // Lateral path spots
                {x: -45, z: 10, rot: 1.0},
                {x: 45, z: 10, rot: -1.0}
            ];
            lampPositions.forEach(pos => {
                const lamp = parkCreateStreetLamp();
                lamp.position.set(pos.x, 0, pos.z);
                lamp.rotation.y = pos.rot;
                parent.add(lamp);
            });

            // --- 10. Park Benches ---
            const benchPositions = [
                {x: -15, z: 28, rot: 0.2},
                {x: 15, z: 28, rot: -0.2},
                {x: -15, z: 5, rot: 3.14},
                {x: 15, z: 5, rot: 3.14},
                {x: -46, z: -5, rot: 1.5},
                {x: 46, z: -5, rot: -1.5}
            ];
            benchPositions.forEach(pos => {
                const bench = parkCreateBench();
                bench.position.set(pos.x, 0, pos.z);
                bench.rotation.y = pos.rot;
                parent.add(bench);
            });

            // --- 11. Entrance Sign Archway ---
            const arch = parkCreateEntranceArch();
            arch.position.set(0, 0, 48);
            parent.add(arch);

            // --- 12. Striped Food Booths & Carts ---
            const booth1 = parkCreateBooth(false); // Red
            booth1.position.set(-18, 0, 36);
            booth1.rotation.y = 0.4;
            parent.add(booth1);

            const booth2 = parkCreateBooth(true); // Blue
            booth2.position.set(18, 0, 36);
            booth2.rotation.y = -0.4;
            parent.add(booth2);

            // --- 13. Hot Air Balloon ---
            parkAnim.hotAirBalloon = parkCreateHotAirBalloon();
            parkAnim.hotAirBalloon.position.set(40, 24, -15);
            parkAnim.baseY = 24;
            parent.add(parkAnim.hotAirBalloon);
        }


        