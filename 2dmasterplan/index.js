// View state
const state = {
    scale: 0.4,
    tx: 0,
    ty: 0,
    tilt: 0, // 0 for flat top-down, 45 for 3D
    isDragging: false,
    startX: 0,
    startY: 0,
    lastClickTime: 0,
    dragDistance: 0
};

let currentHouse = null;

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
    state.dragDistance = 0;
    state.lastClickTime = Date.now();
    viewport.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const newTx = (e.clientX - state.startX) / state.scale;
    const newTy = (e.clientY - state.startY) / state.scale;

    // Track drag distance to distinguish between click and drag
    state.dragDistance += Math.abs(newTx - state.tx) + Math.abs(newTy - state.ty);

    state.tx = newTx;
    state.ty = newTy;
    updateTransform();
});

window.addEventListener('mouseup', (e) => {
    state.isDragging = false;
    viewport.style.cursor = 'grab';

    // If drag distance is small and time is short, it's a click
    const clickDuration = Date.now() - state.lastClickTime;
    if (state.dragDistance < 5 && clickDuration < 300) {
        handleViewportClick(e);
    }
});

function handleViewportClick(e) {
    const house = e.target.closest('.sub-house-block');
    if (house) {
        openPopup(house);
    } else if (!e.target.closest('.info-popup') && !e.target.closest('.nav-ui') && !e.target.closest('.controls')) {
        closePopup();
    }
}

function openPopup(house) {
    currentHouse = house;
    const infoPopup = document.getElementById('infoPopup');
    const label = house.querySelector('.prefix-label') ? house.querySelector('.prefix-label').innerText : 'Unknown';
    document.getElementById('houseTitle').innerText = `Townhome 1900 (${label})`;

    const status = house.getAttribute('data-status') || 'Available';
    updatePopupStatusUI(status);

    infoPopup.classList.add('active');
}

function closePopup() {
    const infoPopup = document.getElementById('infoPopup');
    if (infoPopup) infoPopup.classList.remove('active');
    currentHouse = null;
}

function updatePopupStatusUI(status) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;

    badge.innerText = status;
    badge.className = 'status-badge';

    const statusClassMap = {
        'Available': 'badge-available',
        'Saff-kaboola & Power': 'badge-saff-kaboola',
        'Contact Sign': 'badge-contact-sign',
        'Full Reservation': 'badge-full-reservation',
        'Token Received': 'badge-token-received',
        'Hold': 'badge-hold'
    };

    badge.classList.add(statusClassMap[status] || 'badge-available');

    const btns = document.querySelectorAll('.status-btn');
    btns.forEach(btn => {
        if (btn.innerText === status) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function updateStatus(status) {
    if (!currentHouse) return;

    currentHouse.setAttribute('data-status', status);
    currentHouse.classList.remove('status-available', 'status-saff-kaboola', 'status-contact-sign', 'status-full-reservation', 'status-token-received', 'status-hold');

    const borderClassMap = {
        'Available': 'status-available',
        'Saff-kaboola & Power': 'status-saff-kaboola',
        'Contact Sign': 'status-contact-sign',
        'Full Reservation': 'status-full-reservation',
        'Token Received': 'status-token-received',
        'Hold': 'status-hold'
    };

    currentHouse.classList.add(borderClassMap[status] || 'status-available');
    updatePopupStatusUI(status);
}

function initializeHouseNumbers() {
    document.querySelectorAll('.zone-light').forEach(zone => {
        const isBunch = zone.classList.contains('bunch-zone');
        const blOdd = zone.querySelector('.bl_odd');
        const blEven = zone.querySelector('.bl_even');

        if (blOdd) {
            blOdd.querySelectorAll('.house-block').forEach((block, i) => {
                const num = (2 * i + 1);
                const subBlocks = block.querySelectorAll('.sub-house-block');
                if (isBunch) {
                    const label = String(num).padStart(2, '0');
                    if (subBlocks[0]) setHouseLabel(subBlocks[0], label);
                } else {
                    if (subBlocks[0]) setHouseLabel(subBlocks[0], `${num}A`);
                    if (subBlocks[1]) setHouseLabel(subBlocks[1], `${num}B`);
                }
            });
        }

        if (blEven) {
            blEven.querySelectorAll('.house-block').forEach((block, i) => {
                const num = (2 * i + 2);
                const subBlocks = block.querySelectorAll('.sub-house-block');
                if (isBunch) {
                    const label = String(num).padStart(2, '0');
                    if (subBlocks[0]) setHouseLabel(subBlocks[0], label);
                } else {
                    if (subBlocks[0]) setHouseLabel(subBlocks[0], `${num}A`);
                    if (subBlocks[1]) setHouseLabel(subBlocks[1], `${num}B`);
                }
            });
        }
    });
}

function setHouseLabel(subBlock, label) {
    // Update prefix label
    const prefix = subBlock.querySelector('.prefix-label');
    if (prefix) prefix.innerText = label;

    // Add/Update big number in the middle
    let numDisp = subBlock.querySelector('.house-number');
    if (!numDisp) {
        numDisp = document.createElement('div');
        numDisp.className = 'house-number';
        subBlock.appendChild(numDisp);
    }
    numDisp.innerText = label;
}

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
    // generateLayout();
    updateTransform();
    initializeHouseNumbers();

    // Initialize all sub-house-blocks with status-available class
    document.querySelectorAll('.sub-house-block').forEach(house => {
        if (!house.classList.contains('status-available')) {
            house.classList.add('status-available');
            house.setAttribute('data-status', 'Available');
        }
    });
};