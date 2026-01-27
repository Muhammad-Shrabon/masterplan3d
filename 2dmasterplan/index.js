// View state
const state = {
    scale: 0.4,
    tx: 0,
    ty: 0,
    tilt: 0, // 0 for flat top-down, 45 for 3D
    isDragging: false,
    startX: 0,
    startY: 0
};

const viewport = document.getElementById('viewport');
const cameraRig = document.getElementById('cameraRig');
const sceneContent = document.getElementById('sceneContent');

function updateTransform() {
    cameraRig.style.transform = `
                scale(${state.scale})
                translate(${state.tx}px, ${state.ty}px)
                rotateX(${state.tilt}deg)
            `;
}

function createHouse(x, y) {
    const house = document.createElement('div');
    house.className = 'house';
    house.style.left = `${x}px`;
    house.style.top = `${y}px`;

    const faces = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    faces.forEach(face => {
        const f = document.createElement('div');
        f.className = `house-face house-${face}`;
        house.appendChild(f);
    });
    return house;
}

function generateLayout() {
    const plotW = 1000;
    const plotH = 800;
    const roadGap = 160;

    // Define 6 zones (3 rows, 2 columns)
    const zones = [
        { x: -plotW / 2 - roadGap / 2, y: -plotH - roadGap }, // Top Left
        { x: plotW / 2 + roadGap / 2, y: -plotH - roadGap }, // Top Right
        { x: -plotW / 2 - roadGap / 2, y: 0 },              // Mid Left
        { x: plotW / 2 + roadGap / 2, y: 0 },              // Mid Right
        { x: -plotW / 2 - roadGap / 2, y: plotH + roadGap },  // Bot Left
        { x: plotW / 2 + roadGap / 2, y: plotH + roadGap }   // Bot Right
    ];

    zones.forEach((zone, idx) => {
        // Create Ground Parcel
        const parcel = document.createElement('div');
        parcel.className = 'parcel';
        parcel.style.width = `${plotW}px`;
        parcel.style.height = `${plotH}px`;
        parcel.style.left = `${zone.x}px`;
        parcel.style.top = `${zone.y}px`;
        parcel.style.transform = 'translate(-50%, -50%)';
        sceneContent.appendChild(parcel);

        // Add label to parcel
        const label = document.createElement('div');
        label.className = 'absolute top-4 left-4 text-white/40 font-black text-4xl';
        label.innerText = `ZONE ${String.fromCharCode(65 + idx)}`;
        parcel.appendChild(label);

        // Add houses to this zone
        const rows = 3;
        const cols = 4;
        const hGapX = plotW / (cols + 1);
        const hGapY = plotH / (rows + 1);

        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                const hx = zone.x - plotW / 2 + (c * hGapX);
                const hy = zone.y - plotH / 2 + (r * hGapY);
                sceneContent.appendChild(createHouse(hx - 30, hy - 30));
            }
        }
    });
}

// Interaction
viewport.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.startX = e.clientX - state.tx * state.scale;
    state.startY = e.clientY - state.ty * state.scale;
    viewport.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.tx = (e.clientX - state.startX) / state.scale;
    state.ty = (e.clientY - state.startY) / state.scale;
    updateTransform();
});

window.addEventListener('mouseup', () => {
    state.isDragging = false;
    viewport.style.cursor = 'grab';
});

viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.pow(1.1, -e.deltaY / 200);
    state.scale = Math.min(Math.max(0.05, state.scale * factor), 5);
    updateTransform();
}, { passive: false });

function resetView() {
    state.scale = 0.4;
    state.tx = 0;
    state.ty = 0;
    state.tilt = 0;
    updateTransform();
}

function toggleTilt() {
    state.tilt = state.tilt === 0 ? 45 : 0;
    updateTransform();
}

window.onload = () => {
    generateLayout();
    updateTransform();
};