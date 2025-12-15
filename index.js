const slide_list = document.getElementById('slide_list');
const scroll_box = document.getElementById('hero_sec');
const portfolioCont = document.getElementById('port_content');
const servicesSec = document.getElementById('service_sec');
const servicesList = document.getElementById('service_list');
const walkingSec =  document.getElementById('walking_sec');
const walkingList = document.getElementById('walking_items_list');
const walkingItems = Array.from(walkingList.children); 

let totalHeight = 0;
let zIndexCounter;
let walkScrollableHeight = 0; 

// Easing value for smoothness (smaller value = smoother but laggy, 
// 0.1 is a good balance for smooth scroll-jacking effects)
const ease = 0.1; 

// Global state to hold the animated values for smooth transition
let targetOpacity = new Array(walkingItems.length).fill(0);
let currentOpacity = new Array(walkingItems.length).fill(0);
let targetScale = new Array(walkingItems.length).fill(0);
let currentScale = new Array(walkingItems.length).fill(0);


// --- CONFIGURATION PARAMETERS ---
// REDUCED FOR FASTER SCROLL: The scroll distance for a single item's animation cycle.
// Now set to 1.5 times the viewport height (down from 2.5).
const ITEM_SCROLL_HEIGHT_MULTIPLIER = 1.5; 
// The percentage of the previous item's animation that must be complete
// before the next item begins (25% overlap).
const OVERLAP_PERCENTAGE = 0.25; 
// --------------------------------

// Function to calculate dimensions (mostly unchanged)
const calculateDimensions = () => {
    totalHeight = 0;
    zIndexCounter = walkingItems.length;
    walkingItems.forEach(child => {
        const style = window.getComputedStyle(child);
        child.style.zIndex = zIndexCounter--;
        const marginTop = parseFloat(style.marginTop);
        const marginBottom = parseFloat(style.marginBottom);
        totalHeight += child.offsetHeight + marginTop + marginBottom;
    });

    const numItems = walkingItems.length;
    const singleItemScrollDuration = ITEM_SCROLL_HEIGHT_MULTIPLIER * window.innerHeight; 
    
    const totalOverlapDuration = singleItemScrollDuration * OVERLAP_PERCENTAGE * (numItems - 1);
    
    walkScrollableHeight = (numItems * singleItemScrollDuration) - totalOverlapDuration;
    
    if (numItems <= 1) {
        walkScrollableHeight = singleItemScrollDuration;
    }

    // Set height for other sections
    const scrollWidth = slide_list.scrollWidth;
    const windowWidth = window.innerWidth;
    const xScrollDistance = scrollWidth - windowWidth;
    scroll_box.style.height = `calc(100vh + ${xScrollDistance}px)`;

    const windowHeight = window.innerHeight;
    const serviceScrollHeight = servicesList.scrollHeight;
    const yServiceScrollDistance = serviceScrollHeight - windowHeight;
    servicesSec.style.height = `calc(100vh + ${yServiceScrollDistance}px)`;

    walkingSec.style.height = `calc(100vh + ${walkScrollableHeight}px)`;
};


const handleScrollAnimation = () => {
    // Get current scroll position and section offsets
    const scrollTop = window.scrollY;
    
    // --- 1. Hero Section and Services Section Animation (Apply Easing for Smoothness) ---
    const secTop = scroll_box.offsetTop;
    const ofsetDistance = secTop - scrollTop; 
    // Smooth transition logic for Horizontal Scroll (slide_list)
    let currentX = parseFloat(slide_list.style.transform.replace('translateX(', '').replace('px)', '')) || 0;
    let newX = currentX + (ofsetDistance - currentX) * ease;
    slide_list.style.transform = `translateX(${newX}px)`;

    const servicesSecTop = servicesSec.offsetTop;
    const yDistance = servicesSecTop - scrollTop;
    // Smooth transition logic for Vertical Scroll (servicesList)
    let currentY = parseFloat(servicesList.style.transform.replace('translateY(', '').replace('px)', '')) || 0;
    let newY = currentY + (yDistance - currentY) * ease;
    servicesList.style.transform = `translateY(${newY}px)`;


    // --- 2. Sequential Animation (Walking Section) ---
    const walkHeight = walkingSec.offsetTop;
    const walkXDistance = scrollTop - walkHeight; 
    
    const singleItemScrollDuration = ITEM_SCROLL_HEIGHT_MULTIPLIER * window.innerHeight;
    const transitionPoint = singleItemScrollDuration * (1 - OVERLAP_PERCENTAGE); 


    if (walkXDistance >= 0 && walkXDistance <= walkScrollableHeight) {
        
        walkingItems.forEach((item, index) => {
            
            const startScroll = index * transitionPoint;
            const endScroll = startScroll + singleItemScrollDuration;

            let itemProgress = 0;

            if (walkXDistance > startScroll && walkXDistance < endScroll) {
                const currentScrollInSlot = walkXDistance - startScroll;
                itemProgress = currentScrollInSlot / singleItemScrollDuration; 
            } else if (walkXDistance >= endScroll) {
                itemProgress = 1; 
            }
            
            // --- SCALING AND FADE LOGIC (Determine Target Values) ---
            
            let finalScale = 0;
            let finalOpacity = 0;

            if (itemProgress < 0.5) {
                const phaseProgress = itemProgress * 2; 
                finalOpacity = phaseProgress;
                finalScale = 0.5 + (0.5 * phaseProgress); 
            } else {
                const phaseProgress = (itemProgress - 0.5) * 2; 
                finalOpacity = 1 - phaseProgress; 
                finalScale = 1; 
            }

            // Store the calculated instantaneous values as the TARGET
            targetOpacity[index] = Math.max(0, finalOpacity);
            targetScale[index] = Math.max(0, finalScale);
            
            // --- APPLY LERPING (EASING) FOR SMOOTHNESS ---
            // Lerp the current value towards the target value
            currentOpacity[index] += (targetOpacity[index] - currentOpacity[index]) * ease;
            currentScale[index] += (targetScale[index] - currentScale[index]) * ease;
            
            // Apply the smoothed values
            item.style.opacity = currentOpacity[index]; 
            item.style.transform = `scale(${currentScale[index]})`; 
        });

    } else {
        // Before or After the section: reset opacity and scale using smoothing
        walkingItems.forEach((item, index) => {
             // Target is 0, 0
            targetOpacity[index] = 0;
            targetScale[index] = 0;
            
            // Apply LERPING for smooth reset
            currentOpacity[index] += (targetOpacity[index] - currentOpacity[index]) * ease;
            currentScale[index] += (targetScale[index] - currentScale[index]) * ease;
            
            item.style.opacity = currentOpacity[index]; 
            item.style.transform = `scale(${currentScale[index]})`; 
        });
    }
    
    requestAnimationFrame(handleScrollAnimation);
}


// --- Remaining Setup Functions (No Change) ---

const initialScroll = () => {
    calculateDimensions(); 
    handleScrollAnimation();
}

window.addEventListener('load', initialScroll);

let resizeTimer;
window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(initialScroll, 250);
});

const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry =>{
        if(entry.isIntersecting){
            portfolioCont.classList.add('active');
        }else{
            portfolioCont.classList.remove('active');
        }
    })
},{
    threshold: 0.4
});

observer.observe(portfolioCont);