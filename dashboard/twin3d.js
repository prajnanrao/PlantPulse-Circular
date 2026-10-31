/**
 * PlantPulse Circular - 3D Virtual Digital Twin Engine (Three.js)
 * Real-time 3D visualization of the circular garden ecosystem:
 * - Dynamic procedural plant beds (Tomato, Basil, Spinach) with live wilting & soil hydration shaders
 * - Smart rainwater cistern with real-time animated water level & surface ripples
 * - Aerobic compost bioreactor with active thermophilic steam particle emitter
 * - Dynamic weather environment (3D falling rain particles, directional sunlight & shadows)
 * - Precision drip irrigation water sprayer particle effects
 * - Interactive raycasting, object selection, camera transitions & telemetry HUD
 */

class GardenTwin3D {
    constructor(containerId, onSelectObject) {
        this.container = document.getElementById(containerId);
        this.onSelectObject = onSelectObject;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // 3D Objects mapping
        this.beds = {};
        this.waterMesh = null;
        this.tankLevelMaxHeight = 3.2;
        this.pumpLight = null;
        this.compostSteam = null;
        this.rainParticles = null;
        this.sprinklerParticles = [];
        this.sunLight = null;
        this.interactiveObjects = [];
        this.hoveredObject = null;
        this.selectedObject = null;

        // Animation clock & state
        this.clock = new THREE.Clock();
        this.isIrrigating = false;
        this.irrigationTimer = 0;
        this.currentRain = 0;

        this.cameraPresets = {
            panoramic: { pos: [0, 8.5, 14], target: [0, 1, 0] },
            bed1: { pos: [-4.2, 3.2, 3.2], target: [-3.8, 1.2, 0] },
            bed2: { pos: [0, 3.2, 3.2], target: [0, 1.2, 0] },
            bed3: { pos: [4.2, 3.2, 3.2], target: [3.8, 1.2, 0] },
            tank: { pos: [-7.5, 4.0, -1.0], target: [-7.0, 2.0, -4.5] },
            compost: { pos: [7.5, 3.5, -1.0], target: [7.0, 1.8, -4.5] },
            topdown: { pos: [0, 16, 0.1], target: [0, 0, 0] }
        };

        this.init();
    }

    init() {
        if (!this.container) return;

        // 1. Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0c1310);
        this.scene.fog = new THREE.FogExp2(0x0c1310, 0.025);

        // 2. Camera setup
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
        this.camera.position.set(0, 8.5, 14);

        // 3. Renderer setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.container.appendChild(this.renderer.domElement);

        // 4. OrbitControls
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.06;
            this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
            this.controls.minDistance = 3;
            this.controls.maxDistance = 24;
            this.controls.target.set(0, 1, 0);
        }

        // 5. Lighting
        this.setupLighting();

        // 6. Build the Garden Environment
        this.buildEnvironment();
        this.buildPlantBeds();
        this.buildRainwaterTank();
        this.buildCompostBioreactor();
        this.buildIrrigationPipes();
        this.buildRainSystem();
        this.buildSprinklerSystem();

        // 7. Event listeners
        window.addEventListener('resize', () => this.onWindowResize());
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));

        // 8. Start render loop
        this.animate();
    }

    setupLighting() {
        // Ambient fill
        const ambient = new THREE.AmbientLight(0xd4ecd5, 0.55);
        this.scene.add(ambient);

        // Directional Sunlight with Shadows
        this.sunLight = new THREE.DirectionalLight(0xfffaed, 1.25);
        this.sunLight.position.set(10, 15, 8);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 40;
        const d = 12;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.bias = -0.0005;
        this.scene.add(this.sunLight);

        // Subtle accent rim lights
        const accentBlue = new THREE.PointLight(0x06b6d4, 0.6, 15);
        accentBlue.position.set(-8, 3, -4);
        this.scene.add(accentBlue);

        const accentGreen = new THREE.PointLight(0x10b981, 0.6, 15);
        accentGreen.position.set(8, 3, -4);
        this.scene.add(accentGreen);
    }

    buildEnvironment() {
        // Garden Platform / Deck
        const deckGeo = new THREE.BoxGeometry(22, 0.4, 16);
        const deckMat = new THREE.MeshStandardMaterial({
            color: 0x1f2923,
            roughness: 0.85,
            metalness: 0.1
        });
        const deck = new THREE.Mesh(deckGeo, deckMat);
        deck.position.y = -0.2;
        deck.receiveShadow = true;
        this.scene.add(deck);

        // Perimeter Grass Border
        const grassGeo = new THREE.PlaneGeometry(36, 30);
        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x111c15,
            roughness: 0.95
        });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.21;
        grass.receiveShadow = true;
        this.scene.add(grass);

        // Greenhouse Glass Backdrop Structure
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x2d3e35, metalness: 0.6, roughness: 0.4 });
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x93c5fd,
            transparent: true,
            opacity: 0.18,
            roughness: 0.1,
            metalness: 0.1,
            transmission: 0.9,
            ior: 1.5
        });

        // Rear wall glass panels
        const wallGeo = new THREE.BoxGeometry(20, 6, 0.1);
        const wall = new THREE.Mesh(wallGeo, glassMat);
        wall.position.set(0, 3, -7.5);
        this.scene.add(wall);

        // Roof slope
        const roofGeo = new THREE.BoxGeometry(20, 0.1, 7);
        const roof = new THREE.Mesh(roofGeo, glassMat);
        roof.position.set(0, 6.2, -4.5);
        roof.rotation.x = 0.25;
        this.scene.add(roof);

        // Frame pillars
        for (let x = -10; x <= 10; x += 5) {
            const pillarGeo = new THREE.CylinderGeometry(0.08, 0.08, 6.5, 12);
            const pillar = new THREE.Mesh(pillarGeo, frameMat);
            pillar.position.set(x, 3.25, -7.5);
            pillar.castShadow = true;
            this.scene.add(pillar);
        }

        // Catchment Gutter along roof
        const gutterGeo = new THREE.CylinderGeometry(0.12, 0.12, 20.2, 16);
        const gutter = new THREE.Mesh(gutterGeo, frameMat);
        gutter.rotation.z = Math.PI / 2;
        gutter.position.set(0, 5.5, -1.0);
        this.scene.add(gutter);

        // Downspout leading to Rain Tank
        const downspoutGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8, 16);
        const downspout = new THREE.Mesh(downspoutGeo, frameMat);
        downspout.position.set(-7.5, 3.8, -1.0);
        this.scene.add(downspout);

        const downspoutElbowGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.6, 16);
        const downspoutElbow = new THREE.Mesh(downspoutElbowGeo, frameMat);
        downspoutElbow.rotation.x = Math.PI / 2;
        downspoutElbow.position.set(-7.5, 2.0, -2.8);
        this.scene.add(downspoutElbow);
    }

    buildPlantBeds() {
        const bedConfigs = [
            { id: "bed-1", plant: "Tomato", pos: [-4.2, 0, 0], color: 0xc48b5b, size: [3.2, 0.7, 4.2] },
            { id: "bed-2", plant: "Basil", pos: [0, 0, 0], color: 0x815f43, size: [2.8, 0.7, 4.2] },
            { id: "bed-3", plant: "Spinach", pos: [4.2, 0, 0], color: 0x5f7650, size: [3.4, 0.7, 4.2] }
        ];

        bedConfigs.forEach(cfg => {
            const group = new THREE.Group();
            group.position.set(...cfg.pos);

            // 1. Raised cedar wood planter box
            const woodMat = new THREE.MeshStandardMaterial({
                color: 0x5c3d28,
                roughness: 0.8,
                metalness: 0.05
            });
            const boxGeo = new THREE.BoxGeometry(cfg.size[0], cfg.size[1], cfg.size[2]);
            const box = new THREE.Mesh(boxGeo, woodMat);
            box.position.y = cfg.size[1] / 2;
            box.castShadow = true;
            box.receiveShadow = true;
            group.add(box);

            // 2. Soil mesh inside planter
            const soilGeo = new THREE.BoxGeometry(cfg.size[0] - 0.2, 0.1, cfg.size[2] - 0.2);
            const soilMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                roughness: 0.95,
                metalness: 0.0
            });
            const soil = new THREE.Mesh(soilGeo, soilMat);
            soil.position.y = cfg.size[1] + 0.02;
            soil.receiveShadow = true;
            group.add(soil);

            // 3. Foliage container for dynamic wilting/growth animation
            const foliageGroup = new THREE.Group();
            foliageGroup.position.y = cfg.size[1] + 0.05;

            if (cfg.plant === "Tomato") {
                this.buildTomatoPlants(foliageGroup, cfg.size[0], cfg.size[2]);
            } else if (cfg.plant === "Basil") {
                this.buildBasilPlants(foliageGroup, cfg.size[0], cfg.size[2]);
            } else {
                this.buildSpinachPlants(foliageGroup, cfg.size[0], cfg.size[2]);
            }
            group.add(foliageGroup);

            // 4. Interactive Invisible Hit Box for raycasting
            const hitGeo = new THREE.BoxGeometry(cfg.size[0] + 0.3, 2.5, cfg.size[2] + 0.3);
            const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
            const hitBox = new THREE.Mesh(hitGeo, hitMat);
            hitBox.position.y = 1.25;
            hitBox.userData = { type: "bed", id: cfg.id, plant: cfg.plant, parentGroup: group };
            group.add(hitBox);
            this.interactiveObjects.push(hitBox);

            // 5. Label indicator ring
            const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(0, cfg.size[1] + 0.03, cfg.size[2] / 2 - 0.4);
            group.add(ring);

            this.scene.add(group);
            this.beds[cfg.id] = {
                group: group,
                soil: soil,
                foliage: foliageGroup,
                plant: cfg.plant,
                config: cfg
            };
        });
    }

    buildTomatoPlants(group, w, d) {
        // Stakes, climbing vines, leaves, and red tomato fruits
        const stakeMat = new THREE.MeshStandardMaterial({ color: 0x855b32, roughness: 0.9 });
        const vineMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.5, side: THREE.DoubleSide });
        const fruitMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, metalness: 0.1 });

        const positions = [
            [-0.7, -1.0], [0.7, -1.0],
            [-0.7, 0.8], [0.7, 0.8]
        ];

        positions.forEach(p => {
            const stakeGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8);
            const stake = new THREE.Mesh(stakeGeo, stakeMat);
            stake.position.set(p[0], 1.0, p[1]);
            stake.castShadow = true;
            group.add(stake);

            // Vine spirals up stake
            const vineGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8);
            const vine = new THREE.Mesh(vineGeo, vineMat);
            vine.position.set(p[0] + 0.02, 0.9, p[1] + 0.02);
            vine.rotation.z = 0.05;
            group.add(vine);

            // Foliage clusters along the vine
            for (let y = 0.4; y <= 1.8; y += 0.35) {
                const clusterGeo = new THREE.SphereGeometry(0.28, 7, 7);
                const cluster = new THREE.Mesh(clusterGeo, leafMat);
                cluster.position.set(p[0] + (Math.random() - 0.5) * 0.2, y, p[1] + (Math.random() - 0.5) * 0.2);
                cluster.scale.set(1.2, 0.6, 1.2);
                cluster.castShadow = true;
                group.add(cluster);
            }

            // Hanging ripe tomatoes
            for (let f = 0; f < 3; f++) {
                const fruitGeo = new THREE.SphereGeometry(0.12, 10, 10);
                const fruit = new THREE.Mesh(fruitGeo, fruitMat);
                fruit.position.set(p[0] + 0.22 * Math.cos(f * 2), 0.7 + f * 0.35, p[1] + 0.22 * Math.sin(f * 2));
                fruit.castShadow = true;
                group.add(fruit);
            }
        });
    }

    buildBasilPlants(group, w, d) {
        // Bushy clusters of vibrant herb leaves
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.4, side: THREE.DoubleSide });
        const stemMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.7 });

        for (let x = -0.8; x <= 0.8; x += 0.55) {
            for (let z = -1.2; z <= 1.2; z += 0.6) {
                const bushGroup = new THREE.Group();
                bushGroup.position.set(x + (Math.random() - 0.5) * 0.1, 0, z + (Math.random() - 0.5) * 0.1);

                // Small stem
                const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6);
                const stem = new THREE.Mesh(stemGeo, stemMat);
                stem.position.y = 0.2;
                bushGroup.add(stem);

                // Leaf domes
                const domeGeo = new THREE.SphereGeometry(0.25, 8, 8);
                const dome = new THREE.Mesh(domeGeo, leafMat);
                dome.position.y = 0.38;
                dome.scale.set(1.1, 0.8, 1.1);
                dome.castShadow = true;
                bushGroup.add(dome);

                group.add(bushGroup);
            }
        }
    }

    buildSpinachPlants(group, w, d) {
        // Low-profile broad rosette leaves
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.45, side: THREE.DoubleSide });

        for (let x = -1.0; x <= 1.0; x += 0.65) {
            for (let z = -1.3; z <= 1.3; z += 0.65) {
                const rosette = new THREE.Group();
                rosette.position.set(x + (Math.random() - 0.5) * 0.1, 0, z + (Math.random() - 0.5) * 0.1);

                // 6 spreading leaves in radial arrangement
                for (let i = 0; i < 6; i++) {
                    const leafGeo = new THREE.CylinderGeometry(0.12, 0.02, 0.35, 6);
                    const leaf = new THREE.Mesh(leafGeo, leafMat);
                    leaf.rotation.z = Math.PI / 3;
                    leaf.rotation.y = (i * Math.PI) / 3;
                    leaf.position.y = 0.08;
                    leaf.scale.set(1, 0.15, 2.0);
                    leaf.castShadow = true;
                    rosette.add(leaf);
                }
                group.add(rosette);
            }
        }
    }

    buildRainwaterTank() {
        const group = new THREE.Group();
        group.position.set(-7.5, 0, -4.5);

        // Concrete base plinth
        const baseGeo = new THREE.CylinderGeometry(1.4, 1.5, 0.3, 32);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.y = 0.15;
        base.receiveShadow = true;
        group.add(base);

        // Outer Transparent Glass/Acrylic Tank Wall
        const tankGeo = new THREE.CylinderGeometry(1.2, 1.2, 3.4, 32, 1, true);
        const tankMat = new THREE.MeshPhysicalMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.32,
            roughness: 0.15,
            metalness: 0.1,
            transmission: 0.85,
            ior: 1.33,
            side: THREE.DoubleSide
        });
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.y = 1.85;
        tank.castShadow = true;
        group.add(tank);

        // Stainless steel structural support bands
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
        [0.4, 1.2, 2.0, 2.8, 3.4].forEach(y => {
            const ringGeo = new THREE.TorusGeometry(1.21, 0.025, 8, 32);
            const r = new THREE.Mesh(ringGeo, ringMat);
            r.rotation.x = Math.PI / 2;
            r.position.y = y;
            group.add(r);
        });

        // Top Lid
        const lidGeo = new THREE.ConeGeometry(1.25, 0.4, 32);
        const lid = new THREE.Mesh(lidGeo, ringMat);
        lid.position.y = 3.6;
        group.add(lid);

        // Inner 3D Animated Water Volume
        const waterGeo = new THREE.CylinderGeometry(1.15, 1.15, 1.0, 32);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0284c7,
            roughness: 0.15,
            metalness: 0.2,
            transparent: true,
            opacity: 0.85
        });
        this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
        this.waterMesh.position.y = 0.3 + 0.5; // Starts scaled
        group.add(this.waterMesh);

        // Solar Booster Pump Unit at base
        const pumpGeo = new THREE.BoxGeometry(0.6, 0.5, 0.6);
        const pumpMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
        const pump = new THREE.Mesh(pumpGeo, pumpMat);
        pump.position.set(1.4, 0.25, 0);
        pump.castShadow = true;
        group.add(pump);

        // Pump Status LED
        const ledGeo = new THREE.SphereGeometry(0.08, 16, 16);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        this.pumpLight = new THREE.Mesh(ledGeo, ledMat);
        this.pumpLight.position.set(1.4, 0.55, 0);
        group.add(this.pumpLight);

        // Hit box for raycasting
        const hitGeo = new THREE.CylinderGeometry(1.6, 1.6, 4.0, 16);
        const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
        const hitBox = new THREE.Mesh(hitGeo, hitMat);
        hitBox.position.y = 2.0;
        hitBox.userData = { type: "tank", id: "tank", name: "Rainwater Harvesting Cistern", parentGroup: group };
        group.add(hitBox);
        this.interactiveObjects.push(hitBox);

        this.scene.add(group);
    }

    buildCompostBioreactor() {
        const group = new THREE.Group();
        group.position.set(7.5, 0, -4.5);

        // Stand legs (A-frame)
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.4 });
        [-0.9, 0.9].forEach(x => {
            const legLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), frameMat);
            legLeft.position.set(x, 1.1, -0.6);
            legLeft.rotation.x = -0.3;
            legLeft.castShadow = true;
            group.add(legLeft);

            const legRight = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), frameMat);
            legRight.position.set(x, 1.1, 0.6);
            legRight.rotation.x = 0.3;
            legRight.castShadow = true;
            group.add(legRight);
        });

        // Rotating Tumbler Drum (Hexagonal / Cylinder)
        const drumGeo = new THREE.CylinderGeometry(0.95, 0.95, 1.8, 12);
        const drumMat = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.8, metalness: 0.2 });
        const drum = new THREE.Mesh(drumGeo, drumMat);
        drum.rotation.z = Math.PI / 2;
        drum.position.y = 1.65;
        drum.castShadow = true;
        group.add(drum);

        // Aeration vents & hatch door
        const hatchGeo = new THREE.BoxGeometry(0.8, 0.5, 0.05);
        const hatchMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.5 });
        const hatch = new THREE.Mesh(hatchGeo, hatchMat);
        hatch.position.set(0, 1.65, 0.96);
        group.add(hatch);

        // Composting Thermophilic Steam Particle System
        const particleCount = 45;
        const steamGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 0.8;
            positions[i * 3 + 1] = 1.8 + Math.random() * 1.5;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
        }
        steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const steamMat = new THREE.PointsMaterial({
            color: 0xe2e8f0,
            size: 0.25,
            transparent: true,
            opacity: 0.45,
            blending: THREE.AdditiveBlending
        });
        this.compostSteam = new THREE.Points(steamGeo, steamMat);
        group.add(this.compostSteam);

        // Hit box for raycasting
        const hitGeo = new THREE.BoxGeometry(2.4, 2.6, 2.0);
        const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
        const hitBox = new THREE.Mesh(hitGeo, hitMat);
        hitBox.position.y = 1.5;
        hitBox.userData = { type: "compost", id: "compost", name: "Aerobic Compost Bioreactor", parentGroup: group };
        group.add(hitBox);
        this.interactiveObjects.push(hitBox);

        this.scene.add(group);
    }

    buildIrrigationPipes() {
        // Main distribution pipe from tank along back of beds
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });
        const mainPipeGeo = new THREE.CylinderGeometry(0.05, 0.05, 14, 12);
        const mainPipe = new THREE.Mesh(mainPipeGeo, pipeMat);
        mainPipe.rotation.z = Math.PI / 2;
        mainPipe.position.set(0, 0.1, -2.5);
        this.scene.add(mainPipe);

        // Feed line from pump to main pipe
        const feedGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 12);
        const feed = new THREE.Mesh(feedGeo, pipeMat);
        feed.rotation.x = Math.PI / 2;
        feed.position.set(-6.1, 0.1, -3.5);
        this.scene.add(feed);

        // Drip emitter manifolds branching into each bed
        [-4.2, 0, 4.2].forEach(x => {
            const branchGeo = new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8);
            const branch = new THREE.Mesh(branchGeo, pipeMat);
            branch.rotation.x = Math.PI / 2;
            branch.position.set(x, 0.1, -1.2);
            this.scene.add(branch);
        });
    }

    buildRainSystem() {
        // 3D Falling Rain Streaks
        const rainCount = 1800;
        const rainGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);

        for (let i = 0; i < rainCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 26;
            positions[i * 3 + 1] = Math.random() * 14 + 1;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
            velocities[i] = 0.25 + Math.random() * 0.2;
        }

        rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        rainGeo.userData = { velocities: velocities };

        const rainMat = new THREE.PointsMaterial({
            color: 0xa5f3fc,
            size: 0.14,
            transparent: true,
            opacity: 0.0, // starts hidden
            blending: THREE.AdditiveBlending
        });

        this.rainParticles = new THREE.Points(rainGeo, rainMat);
        this.scene.add(this.rainParticles);
    }

    buildSprinklerSystem() {
        // Micro-spray droplets over each bed when irrigation is active
        const bedPositions = [[-4.2, 0], [0, 0], [4.2, 0]];
        this.sprinklerParticles = [];

        bedPositions.forEach(p => {
            const dropletCount = 120;
            const geo = new THREE.BufferGeometry();
            const positions = new Float32Array(dropletCount * 3);

            for (let i = 0; i < dropletCount; i++) {
                positions[i * 3] = p[0] + (Math.random() - 0.5) * 2.6;
                positions[i * 3 + 1] = 0.8 + Math.random() * 0.8;
                positions[i * 3 + 2] = p[1] + (Math.random() - 0.5) * 3.6;
            }

            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const mat = new THREE.PointsMaterial({
                color: 0x38bdf8,
                size: 0.09,
                transparent: true,
                opacity: 0.0,
                blending: THREE.AdditiveBlending
            });

            const points = new THREE.Points(geo, mat);
            this.scene.add(points);
            this.sprinklerParticles.push(points);
        });
    }

    /**
     * Updates 3D digital twin state based on backend snapshot telemetry
     */
    updateState(snapshot) {
        if (!snapshot || !snapshot.state) return;
        const state = snapshot.state;
        const weather = state.weather || {};
        const beds = state.beds || [];

        // 1. Update Soil Moisture & Health on Plant Beds
        beds.forEach(b => {
            const bedObj = this.beds[b.id];
            if (bedObj) {
                // Soil color interpolation: dry sandy (#c48b5b) -> moist rich loam (#2e1f14)
                const moistureNorm = Math.min(1.0, Math.max(0.0, (b.moisture_pct - 15) / 60));
                const dryColor = new THREE.Color(0xc48b5b);
                const moistColor = new THREE.Color(0x271911);
                bedObj.soil.material.color.lerpColors(dryColor, moistColor, moistureNorm);

                // Plant Wilting / Health Scale
                const healthNorm = Math.min(1.0, Math.max(0.3, b.health_pct / 100));
                const wilting = b.wilting_index || (b.moisture_pct < 28 ? 0.35 : 0.0);
                
                // Wilting causes foliage to droop (tilt down) and compress slightly
                bedObj.foliage.rotation.x = wilting * 0.25;
                bedObj.foliage.scale.set(healthNorm, Math.max(0.65, 1.0 - wilting * 0.4), healthNorm);
            }
        });

        // 2. Update Rainwater Tank Height
        const tankCapacity = state.tank_capacity_l || 500;
        const tankLevel = state.tank_l || 0;
        const fillFraction = Math.min(1.0, Math.max(0.03, tankLevel / tankCapacity));

        if (this.waterMesh) {
            // Animate water height and position
            const targetHeight = fillFraction * this.tankLevelMaxHeight;
            this.waterMesh.scale.y = Math.max(0.05, targetHeight);
            this.waterMesh.position.y = 0.3 + (targetHeight / 2);
        }

        // 3. Update Weather Dynamics: Sun position & Rain particles
        this.currentRain = weather.rainfall_mm || 0;
        if (this.rainParticles) {
            this.rainParticles.material.opacity = this.currentRain > 0 ? Math.min(0.85, 0.3 + this.currentRain * 0.03) : 0.0;
        }

        // Sunlight index updates lighting intensity
        const lightIndex = weather.light_index !== undefined ? weather.light_index : 0.7;
        if (this.sunLight) {
            this.sunLight.intensity = 0.4 + lightIndex * 1.1;
        }

        // 4. Trigger Irrigation Sprinklers if action was taken
        const lastAction = state.last_action || {};
        if (lastAction.irrigation_l > 0) {
            this.triggerIrrigationAnimation(lastAction.irrigation_l);
        }

        // 5. Update Pump status LED
        if (this.pumpLight) {
            if (this.isIrrigating) {
                this.pumpLight.material.color.setHex(0x06b6d4); // Blue when active pumping
            } else {
                this.pumpLight.material.color.setHex(0x10b981); // Green when idle ready
            }
        }

        // 6. Update Compost Steam emission
        const activeBatches = (state.composting_batches || []).length;
        if (this.compostSteam) {
            this.compostSteam.material.opacity = activeBatches > 0 ? 0.55 : 0.15;
        }
    }

    triggerIrrigationAnimation(liters) {
        this.isIrrigating = true;
        this.irrigationTimer = 3.5; // Runs sprinkler for 3.5 seconds
        this.sprinklerParticles.forEach(sp => {
            sp.material.opacity = 0.75;
        });
        if (this.pumpLight) this.pumpLight.material.color.setHex(0x06b6d4);
    }

    setCameraPreset(name) {
        const preset = this.cameraPresets[name];
        if (!preset || !this.camera || !this.controls) return;

        // Smooth camera movement
        const startPos = this.camera.position.clone();
        const endPos = new THREE.Vector3(...preset.pos);
        const startTarget = this.controls.target.clone();
        const endTarget = new THREE.Vector3(...preset.target);

        let progress = 0;
        const anim = () => {
            progress += 0.05;
            if (progress <= 1.0) {
                this.camera.position.lerpVectors(startPos, endPos, progress);
                this.controls.target.lerpVectors(startTarget, endTarget, progress);
                requestAnimationFrame(anim);
            } else {
                this.camera.position.copy(endPos);
                this.controls.target.copy(endTarget);
            }
        };
        anim();
    }

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactiveObjects);

        if (intersects.length > 0) {
            this.renderer.domElement.style.cursor = 'pointer';
            this.hoveredObject = intersects[0].object;
        } else {
            this.renderer.domElement.style.cursor = 'default';
            this.hoveredObject = null;
        }
    }

    onClick(event) {
        if (!this.hoveredObject) return;
        const data = this.hoveredObject.userData;
        this.selectedObject = data;

        // Notify parent UI callback
        if (this.onSelectObject) {
            this.onSelectObject(data);
        }

        // Smooth zoom to clicked object
        if (data.type === "bed") {
            this.setCameraPreset(data.id === "bed-1" ? "bed1" : data.id === "bed-2" ? "bed2" : "bed3");
        } else if (data.type === "tank") {
            this.setCameraPreset("tank");
        } else if (data.type === "compost") {
            this.setCameraPreset("compost");
        }
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        // 1. Controls update
        if (this.controls) this.controls.update();

        // 2. Animate Rain particles
        if (this.rainParticles && this.currentRain > 0) {
            const positions = this.rainParticles.geometry.attributes.position.array;
            const v = this.rainParticles.geometry.userData.velocities;
            for (let i = 0; i < positions.length / 3; i++) {
                positions[i * 3 + 1] -= v[i] * 1.5;
                if (positions[i * 3 + 1] < 0) {
                    positions[i * 3 + 1] = 14;
                }
            }
            this.rainParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 3. Animate Irrigation Sprinklers
        if (this.isIrrigating) {
            this.irrigationTimer -= delta;
            this.sprinklerParticles.forEach((sp, idx) => {
                const pos = sp.geometry.attributes.position.array;
                for (let i = 0; i < pos.length / 3; i++) {
                    pos[i * 3 + 1] -= delta * 1.8;
                    if (pos[i * 3 + 1] < 0.6) {
                        pos[i * 3 + 1] = 1.4 + Math.random() * 0.4;
                    }
                }
                sp.geometry.attributes.position.needsUpdate = true;
            });

            if (this.irrigationTimer <= 0) {
                this.isIrrigating = false;
                this.sprinklerParticles.forEach(sp => { sp.material.opacity = 0.0; });
                if (this.pumpLight) this.pumpLight.material.color.setHex(0x10b981);
            }
        }

        // 4. Animate Compost Steam Vapor
        if (this.compostSteam) {
            const pos = this.compostSteam.geometry.attributes.position.array;
            for (let i = 0; i < pos.length / 3; i++) {
                pos[i * 3 + 1] += delta * 0.4;
                pos[i * 3] += Math.sin(time * 2 + i) * 0.003;
                if (pos[i * 3 + 1] > 3.6) {
                    pos[i * 3 + 1] = 1.8;
                    pos[i * 3] = (Math.random() - 0.5) * 0.8;
                }
            }
            this.compostSteam.geometry.attributes.position.needsUpdate = true;
        }

        // 5. Water surface gentle ripple oscillation
        if (this.waterMesh) {
            this.waterMesh.rotation.y = time * 0.15;
        }

        // 6. Render scene
        this.renderer.render(this.scene, this.camera);
    }
}

window.GardenTwin3D = GardenTwin3D;
