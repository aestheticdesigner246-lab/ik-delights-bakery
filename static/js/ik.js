/* ============================================
   IK DELIGHTS – FINAL PRODUCTION JS v26.0
   FIXED: Checkout uses last added product type (sessionStorage)
   FIXED: Order submission URL to /api/order/place/
   ADDED: Profile save & password change functions
   ============================================ */
console.log("NEW IK.JS LOADED");
// ==================== PAGE DETECTION ====================
const isCheckoutPage = window.location.pathname === '/checkout/';
const isCategoryPage = window.location.pathname.includes('/category/');
const isProductPage = window.location.pathname.includes('/product/');
const isInnerPage = isCategoryPage || isProductPage || isCheckoutPage;

// ==================== USER AUTH CHECK ====================
function isUserLoggedIn() {
    return document.body.getAttribute('data-user-authenticated') === 'true';
}

function redirectToLogin() {
    alert('🔐 Please login first to place order');
}

// ==================== DELIVERY TIME VALIDATION ====================
function validateDeliveryTime6Hours(deliveryDateTime) {
    if (!deliveryDateTime) {
        return { valid: false, message: '❌ Please select delivery date and time' };
    }
    const selectedDateTime = new Date(deliveryDateTime);
    const currentDateTime = new Date();
    if (isNaN(selectedDateTime.getTime())) {
        return { valid: false, message: '❌ Invalid delivery date/time' };
    }
    const diffHours = (selectedDateTime - currentDateTime) / (1000 * 60 * 60);
    if (diffHours < 6) {
        return { valid: false, message: '⚠️ Orders must be placed at least 6 hours before delivery time' };
    }
    if (diffHours > 720) {
        return { valid: false, message: '⚠️ Orders cannot be placed more than 30 days in advance' };
    }
    return { valid: true, message: '✅ Delivery time accepted' };
}

// ==================== PAKISTANI NUMBER VALIDATION ====================
function validatePakistaniNumber(phone) {
    const phonePattern = /^03[0-9]{9}$/;
    if (!phonePattern.test(phone)) {
        return { valid: false, message: '📱 Please enter valid Pakistani number (03XXXXXXXXX)' };
    }
    return { valid: true, message: '✅ Valid number' };
}

// ==================== ESCAPE HTML ====================
function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ==================== CSRF TOKEN ====================
function getCSRFToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith('csrftoken=')) {
                cookieValue = decodeURIComponent(cookie.substring(10));
                break;
            }
        }
    }
    if (!cookieValue) {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) cookieValue = meta.getAttribute('content');
    }
    if (!cookieValue) {
        const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
        if (csrfInput) cookieValue = csrfInput.value;
    }
    return cookieValue;
}

// ==================== TOAST ====================
function showToast(message, type = 'success') {
    let oldToast = document.getElementById('ikToast');
    if (oldToast) oldToast.remove();
    let toast = document.createElement('div');
    toast.id = 'ikToast';
    let config = {
        success: { bg: 'linear-gradient(135deg, #28a745, #20c997)', icon: '✅', border: '#1e7e34' },
        error: { bg: 'linear-gradient(135deg, #dc3545, #c82333)', icon: '❌', border: '#a71d2a' },
        warning: { bg: 'linear-gradient(135deg, #ffc107, #ffca2c)', icon: '⚠️', border: '#d39e00' },
        info: { bg: 'linear-gradient(135deg, #17a2b8, #138496)', icon: 'ℹ️', border: '#0f6674' }
    };
    let c = config[type] || config.success;
    toast.style.cssText = `
        position: fixed !important;
        bottom: 30px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        background: ${c.bg} !important;
        color: white !important;
        padding: 14px 28px !important;
        border-radius: 50px !important;
        z-index: 999999999 !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        text-align: center !important;
        max-width: 90% !important;
        min-width: 280px !important;
        box-shadow: 0 8px 25px rgba(0,0,0,0.2) !important;
        font-family: 'Poppins', 'Segoe UI', sans-serif !important;
        border-left: 4px solid ${c.border} !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 10px !important;
        backdrop-filter: blur(4px) !important;
        animation: toastSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
    `;
    toast.innerHTML = `<span style="font-size: 18px;">${c.icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease forwards';
        setTimeout(() => { if (toast && toast.parentNode) toast.remove(); }, 300);
    }, 4000);
}

(function addToastAnimations() {
    if (document.getElementById('toastAnimations')) return;
    let style = document.createElement('style');
    style.id = 'toastAnimations';
    style.textContent = `
        @keyframes toastSlideIn { 0% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.9); } 100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes toastSlideOut { 0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.9); } }
    `;
    document.head.appendChild(style);
})();

// ==================== SPLASH ====================
function initSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    setTimeout(() => {
        splash.classList.add('hidden');
        setTimeout(() => { splash.style.display = 'none'; }, 500);
    }, 3000);
}
let dealTimerInterval = null;
async function showDealPopup() {
    if (isInnerPage) return;
    const popup = document.getElementById('dealPopup');
    if (!popup) return;
    try {
        const response = await fetch('/api/featured-deal/');
        if (!response.ok) return;
        const data = await response.json();
        const deal = data.deal;
        if (!deal) return;
        const titleEl = popup.querySelector('.deal-popup-title');
        const priceEl = popup.querySelector('.deal-popup-price');
        const descEl = popup.querySelector('.deal-popup-desc');
        const img = popup.querySelector('.deal-popup-img img');
        const waBtn = popup.querySelector('.deal-popup-btn');
        if (titleEl) titleEl.textContent = deal.title;
        if (priceEl) priceEl.textContent = `Rs ${deal.deal_price}`;
        if (descEl) descEl.textContent = deal.description;
        if (img && deal.image_url) img.src = deal.image_url;
        
        // ========== REPLACED WHATSAPP BUTTON LOGIC ==========
        if (waBtn && deal.id) {
            const dealUrl = `/grab-deal/${deal.id}/`;
            waBtn.removeAttribute('onclick');
            waBtn.onclick = null;
            waBtn.href = dealUrl;
            waBtn.target = "_blank";
            waBtn.addEventListener('click', function(e) {
                e.preventDefault();
                window.open(dealUrl, '_blank');
                return false;
            });
        }
        // ====================================================
        
        const oldTimer = popup.querySelector('.deal-popup-timer');
        if (oldTimer) oldTimer.remove();
        if (deal.expiry) {
            const timerDiv = document.createElement('div');
            timerDiv.className = 'deal-popup-timer';
            timerDiv.setAttribute('data-expiry', deal.expiry);
            timerDiv.innerHTML = `<i class="fas fa-hourglass-half"></i> <span class="timer-days">00</span>d <span class="timer-hours">00</span>h <span class="timer-mins">00</span>m <span class="timer-secs">00</span>s`;
            const imgContainer = popup.querySelector('.deal-popup-img');
            if (imgContainer) imgContainer.appendChild(timerDiv);
            if (dealTimerInterval) clearInterval(dealTimerInterval);
            function updateTimer() {
                const tDiv = document.querySelector('.deal-popup-timer');
                if (!tDiv) return;
                const expiry = new Date(tDiv.getAttribute('data-expiry'));
                const diff = expiry - new Date();
                if (diff <= 0) { tDiv.innerHTML = '<i class="fas fa-hourglass-end"></i> Expired'; clearInterval(dealTimerInterval); return; }
                const days = Math.floor(diff / 86400000);
                const hours = Math.floor((diff % 86400000) / 3600000);
                const mins = Math.floor((diff % 3600000) / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                tDiv.innerHTML = `<i class="fas fa-hourglass-half"></i> ${days}d ${hours.toString().padStart(2,'0')}h ${mins.toString().padStart(2,'0')}m ${secs.toString().padStart(2,'0')}s`;
            }
            updateTimer();
            dealTimerInterval = setInterval(updateTimer, 1000);
        }
        popup.style.display = 'flex';
    } catch(e) { console.error(e); }
}
window.closeDealPopup = function() {
    const popup = document.getElementById('dealPopup');
    if (popup) popup.style.display = 'none';
    if (dealTimerInterval) clearInterval(dealTimerInterval);
};
// ==================== PAYMENT FIELDS ====================
function initPaymentFields() {
    const paymentSelect = document.getElementById("orderPaymentSelect");
    const paymentFields = document.getElementById("paymentFieldsContainer");
    if (!paymentSelect || !paymentFields) return;
    function togglePaymentFields() {
        const selectedPayment = paymentSelect.value.trim().toLowerCase();
        const needsFields = selectedPayment === "jazzcash" || selectedPayment === "easypaisa";
        paymentFields.style.display = needsFields ? "flex" : "none";
    }
    paymentSelect.onchange = togglePaymentFields;
    togglePaymentFields();
}

// ==================== DARK MODE ====================
function initDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') document.documentElement.classList.add('dark');
}
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
}
function toggleMobileMenu() {
    document.getElementById('nav-links')?.classList.toggle('open');
}

async function apiRequest(url, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (method !== 'GET') headers['X-CSRFToken'] = getCSRFToken();
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

// ==================== CART ====================
let cart = [];
let lastAddedProductType = 'cake';

// Normalize product type (cookies -> cookie, brownies -> brownie, etc.)
function normalizeProductType(type) {
    let t = String(type).toLowerCase().trim();
    if (t === 'cookies') return 'cookie';
    if (t === 'brownies') return 'brownie';
    if (t === 'bento cakes') return 'bento';
    return t;
}

async function refreshCart() {
    try {
        const data = await apiRequest('/api/cart/');
        cart = data.cart || [];
        updateCartUI();
    } catch(e) { console.error('Cart error:', e); }
}

window.addToCart = async function(productId, productName, productPrice, productType = 'cake', eventElement = null) {
    // Normalize the incoming product type
    let finalProductType = normalizeProductType(productType);
    console.log("🛒 addToCart - final product type:", finalProductType);
    
    if (!isUserLoggedIn()) {
        redirectToLogin();
        return;
    }
    if (!productId) {
        showToast("Product ID missing", "error");
        return;
    }
    try {
        const csrfToken = getCSRFToken();
        const response = await fetch('/api/cart/add/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            body: JSON.stringify({ product_id: parseInt(productId), quantity: 1 })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        showToast(`✨ ${productName} added to cart!`, 'success');
        // Store normalized product type
        lastAddedProductType = finalProductType;
        sessionStorage.setItem('lastProductType', finalProductType);
        await refreshCart();
    } catch(error) {
        console.error("Add to cart error:", error);
        showToast(error.message || '⚠️ Error adding to cart', 'error');
    }
};

async function updateQuantity(productId, delta) {
    const item = cart.find(i => Number(i.product_id || i.id) === Number(productId));
    if (!item) return;
    let currentQty = parseInt(item.quantity || 1);
    const newQty = currentQty + delta;
    if (newQty < 1) {
        await removeFromCart(productId);
        return;
    }
    try {
        await fetch('/api/cart/update/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ product_id: Number(productId), quantity: Number(newQty) })
        });
        await refreshCart();
    } catch (e) { console.error(e); }
}

async function removeFromCart(productId) {
    try {
        await fetch('/api/cart/remove/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ product_id: productId })
        });
        await refreshCart();
    } catch(e) { console.error(e); }
}

function openCartDrawer() {
    document.getElementById('cartDrawer')?.classList.add('open');
    document.getElementById('drawerOverlay')?.classList.add('open');
}
function closeCartDrawer() {
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('drawerOverlay')?.classList.remove('open');
}

function loadCartIntoDrawer() {
    const drawerBody = document.getElementById('cartDrawerItems');
    const drawerTotal = document.getElementById('drawerCartTotal');
    if (!drawerBody) return;
    const totalPrice = cart.reduce((s, i) => s + (i.price * (i.quantity || 1)), 0);
    if (drawerTotal) drawerTotal.textContent = `Rs ${totalPrice.toLocaleString()}`;
    if (cart.length === 0) {
        drawerBody.innerHTML = '<div class="empty-cart-drawer">🛒 Your cart is empty</div>';
        return;
    }
    drawerBody.innerHTML = cart.map(item => {
        const qty = item.quantity || 1;
        const itemId = item.product_id || item.id;
        return `
        <div style="display:flex; gap:15px; padding:15px 0; border-bottom:1px solid #ffe5ed;">
            <div style="flex:1;">
                <div><strong>${escapeHTML(item.name)}</strong></div>
                <div style="color:#c46a84;">Rs ${item.price}</div>
                <div style="display:flex; gap:10px; margin-top:8px;">
                    <button onclick="updateQuantity(${itemId}, -1)" style="background:#c46a84; color:white; border:none; width:30px; border-radius:50%; cursor:pointer;">-</button>
                    <span>${qty}</span>
                    <button onclick="updateQuantity(${itemId}, 1)" style="background:#c46a84; color:white; border:none; width:30px; border-radius:50%; cursor:pointer;">+</button>
                    <button onclick="removeFromCart(${itemId})" style="background:none; border:none; color:#c46a84; cursor:pointer;">Remove</button>
                </div>
            </div>
            <div style="font-weight:600;">Rs ${(item.price * qty).toLocaleString()}</div>
        </div>`;
    }).join('');
}

function updateCartUI() {
    const badge = document.getElementById('cart-badge');
    const totalItems = cart.reduce((s, i) => s + (i.quantity || 1), 0);
    if (badge) badge.textContent = totalItems;
    loadCartIntoDrawer();
}

// ==================== PROCEED TO CHECKOUT (FIXED) ====================
function proceedToCheckout() {
    if (!isUserLoggedIn()) {
        redirectToLogin();
        return;
    }
    if (cart.length === 0) {
        showToast('🛒 Your cart is empty! Add some items first.', 'warning');
        return;
    }
    
    // Priority: sessionStorage > lastAddedProductType > cake
    let productType = sessionStorage.getItem('lastProductType') || lastAddedProductType || 'cake';
    
    // Normalize one more time
    productType = normalizeProductType(productType);
    
    console.log("🚀 Proceed to checkout with productType:", productType);
    openCustomizationModal(productType);
    closeCartDrawer();
}

// ==================== SHOW PRODUCT FIELDS ====================
function showProductFields(productType = 'cake') {
    const cakeFields = document.getElementById('cakeFields');
    const cookieFields = document.getElementById('cookieFields');
    const brownieFields = document.getElementById('brownieFields');
    const bentoFields = document.getElementById('bentoFields');

    if (!cakeFields || !cookieFields || !brownieFields || !bentoFields) return;

    cakeFields.style.display = 'none';
    cookieFields.style.display = 'none';
    brownieFields.style.display = 'none';
    bentoFields.style.display = 'none';

    const type = normalizeProductType(productType);
    if (type === 'cookie') {
        cookieFields.style.display = 'block';
    } else if (type === 'brownie') {
        brownieFields.style.display = 'block';
    } else if (type === 'bento') {
        bentoFields.style.display = 'block';
    } else {
        cakeFields.style.display = 'block';
    }
    console.log("📦 Show product fields for type:", type);
}

// ==================== CUSTOMIZATION MODAL ====================
let currentCustomizationStep = 1;
let currentProductType = 'cake';

window.openCustomizationModal = function(productType = 'cake') {
    if (!isUserLoggedIn()) {
        redirectToLogin();
        return;
    }
    const modal = document.getElementById('customizationModal');
    if (!modal) {
        showToast('Customization modal not found', 'error');
        return;
    }
    currentProductType = normalizeProductType(productType);
    modal.style.display = 'flex';
    showCustomizationStep(1);
    showProductFields(currentProductType);
    setTimeout(() => { if (typeof initPaymentFields === 'function') initPaymentFields(); }, 100);
    document.body.style.overflow = 'hidden';
};

window.closeCustomizationModal = function() {
    const modal = document.getElementById('customizationModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
};

window.showCustomizationStep = function(step) {
    currentCustomizationStep = step;
    const step1 = document.getElementById('customStep1');
    const step2 = document.getElementById('customStep2');
    const step3 = document.getElementById('customStep3');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';
    const activeStep = document.getElementById(`customStep${step}`);
    if (activeStep) activeStep.style.display = 'block';
    for(let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step${i}`);
        if(indicator) {
            if(i === step){
                indicator.style.background = 'linear-gradient(135deg,#c46a84,#e89ab0)';
                indicator.style.color = '#fff';
            } else {
                indicator.style.background = '#f4d7df';
                indicator.style.color = '#8b4b5a';
            }
        }
    }
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitCustomBtn');
    if (step === 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'inline-block';
        if (submitBtn) submitBtn.style.display = 'none';
    } else if (step === 3) {
        if (prevBtn) prevBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'inline-block';
        setTimeout(() => { if (typeof initPaymentFields === 'function') initPaymentFields(); }, 50);
    } else {
        if (prevBtn) prevBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'inline-block';
        if (submitBtn) submitBtn.style.display = 'none';
    }
};

window.nextCustomizationStep = function() {
    if (currentCustomizationStep === 1 && currentProductType === 'cake') {
        let flavor = document.getElementById('cakeFlavor')?.value;
        let weight = document.getElementById('cakeWeight')?.value;
        if (!flavor || !weight) {
            alert('Please select cake flavor and weight');
            return;
        }
    }
    if (currentCustomizationStep === 2) {
        const summary = document.getElementById('priceSummary');
        if (summary) summary.style.display = 'none';
    }
    if (currentCustomizationStep < 3) showCustomizationStep(currentCustomizationStep + 1);
};

window.prevCustomizationStep = function() {
    if (currentCustomizationStep === 3) {
        const summary = document.getElementById('priceSummary');
        if (summary) summary.style.display = 'block';
    }
    if (currentCustomizationStep > 1) showCustomizationStep(currentCustomizationStep - 1);
};

// ==================== PROFILE MODAL ====================
function initProfileModal() {
    const trigger = document.getElementById('profileModalTrigger');
    if (!trigger) return;
    trigger.addEventListener('click', async (e) => {
        e.preventDefault();
        const modal = document.getElementById('profileModal');
        const content = document.getElementById('profileModalContent');
        if (!modal || !content) return;
        modal.style.display = 'flex';
        content.innerHTML = '<div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-pulse"></i> Loading profile...</div>';
        try {
            const response = await fetch('/profile/modal-content/');
            const html = await response.text();
            content.innerHTML = html;
            const closeBtn = modal.querySelector('.close-modal');
            if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
        } catch(err) {
            content.innerHTML = '<div style="text-align:center;padding:2rem;color:red;">⚠️ Error loading profile</div>';
        }
    });
}

// ==================== PROFILE SAVE (ADDED) ====================
window.saveProfileChanges = async function() {
    const phone = document.getElementById('editPhone')?.value.trim();
    const city = document.getElementById('editCity')?.value.trim();
    const address = document.getElementById('editAddress')?.value.trim();

    if (!phone) {
        showToast('Please enter WhatsApp number', 'error');
        return;
    }
    if (!/^03\d{9}$/.test(phone)) {
        showToast('Enter valid Pakistani number (03XXXXXXXXX)', 'error');
        return;
    }
    if (!city) {
        showToast('Please enter city', 'error');
        return;
    }
    if (!address) {
        showToast('Please enter address', 'error');
        return;
    }

    // Submit via AJAX
    const formData = new FormData();
    formData.append('phone', phone);
    formData.append('city', city);
    formData.append('address', address);

    try {
        const response = await fetch('/api/profile/update/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCSRFToken() },
            body: formData
        });
        const data = await response.json();
        if (data.status === 'ok') {
            showToast('Profile updated successfully!', 'success');
            setTimeout(() => location.reload(), 800);
        } else {
            showToast(data.error || 'Update failed', 'error');
        }
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
    }
};

// ==================== CHANGE PASSWORD (ADDED) ====================
window.changePasswordFromModal = async function() {
    const oldPassword = document.getElementById('oldPassword')?.value;
    const newPassword1 = document.getElementById('newPassword1')?.value;
    const newPassword2 = document.getElementById('newPassword2')?.value;
    const errorDiv = document.getElementById('pwErrorMsg');

    if (!oldPassword || !newPassword1 || !newPassword2) {
        if (errorDiv) errorDiv.innerText = 'All fields are required';
        showToast('All fields are required', 'error');
        return;
    }
    if (newPassword1.length < 8) {
        if (errorDiv) errorDiv.innerText = 'Password must be at least 8 characters';
        showToast('Password must be at least 8 characters', 'error');
        return;
    }
    if (newPassword1 !== newPassword2) {
        if (errorDiv) errorDiv.innerText = 'Passwords do not match';
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        const response = await fetch('/change-password-ajax/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password1: newPassword1,
                new_password2: newPassword2
            })
        });
        const data = await response.json();
        if (data.status === 'ok') {
            showToast('Password changed successfully! Please login again.', 'success');
            setTimeout(() => { window.location.href = '/logout/'; }, 1500);
        } else {
            if (errorDiv) errorDiv.innerText = data.error || 'Failed to change password';
            showToast(data.error || 'Failed to change password', 'error');
        }
    } catch (err) {
        if (errorDiv) errorDiv.innerText = 'Network error';
        showToast('Network error. Please try again.', 'error');
    }
};

document.addEventListener('click', function(e) {
    const modal = document.getElementById('profileModal');
    if (modal && modal.style.display === 'flex' && e.target === modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// ==================== SUBMIT CUSTOMIZATION ====================
window.submitCustomization = async function(event) {
    if (event) event.preventDefault();
    if (!isUserLoggedIn()) {
        alert('🔐 Please login to place order');
        return;
    }
    const name = document.getElementById('orderName')?.value.trim();
    const phone = document.getElementById('orderPhone')?.value.trim();
    const address = document.getElementById('orderAddress')?.value.trim();
    const payment = document.getElementById('orderPaymentSelect')?.value;
    const deliveryDateTime = document.getElementById('deliveryDateTime')?.value;
    let transactionId = document.getElementById("transactionIdInput")?.value.trim().toUpperCase();
    const screenshotFile = document.getElementById("paymentScreenshotInput")?.files[0];

    if (!name || !phone || !address || !payment) {
        alert('❌ Please fill all customer details');
        return;
    }
    const deliveryValidation = validateDeliveryTime6Hours(deliveryDateTime);
    if (!deliveryValidation.valid) { alert(deliveryValidation.message); return; }
    const phoneValidation = validatePakistaniNumber(phone);
    if (!phoneValidation.valid) { alert(phoneValidation.message); return; }

    if (payment === 'jazzcash' || payment === 'easypaisa') {
        if (!transactionId) { alert('💳 Transaction ID is required'); return; }
        transactionId = transactionId.replace(/[:,\s\-]/g, '');
        if (transactionId.startsWith('TID')) transactionId = 'JC' + transactionId.substring(3);
        let pattern = /^[A-Za-z0-9]{6,25}$/;
        if (!pattern.test(transactionId)) { alert('⚠️ Invalid Transaction ID format.'); return; }
        if (!screenshotFile) { alert('📸 Payment screenshot is required'); return; }
    }

    const productType = currentProductType;
    let productName = '';
    let productDetails = {};
    let addons = [];

    let basePriceFromCart = 0;
    if (cart.length > 0) basePriceFromCart = (cart[0].price || 0) * (cart[0].quantity || 1);
    else { alert('❌ Cart is empty.'); return; }

    let finalTotal = basePriceFromCart;

    if (productType === 'cake') {
        let weightSelect = document.getElementById('cakeWeight');
        let isCustomSize = weightSelect.value === 'custom';
        let cakeWeightText = isCustomSize ? 'Custom Size (estimate Rs 9000+)' : weightSelect.options[weightSelect.selectedIndex]?.text;
        productName = 'Custom Cake';
        productDetails = {
            cake_flavor: document.getElementById('cakeFlavor')?.value,
            cake_weight: cakeWeightText,
            cake_shape: document.getElementById('cakeShape')?.value,
            theme: document.getElementById('cakeTheme')?.value,
            message: document.getElementById('cakeMessage')?.value,
            instructions: document.getElementById('specialInstructions')?.value,
            eggless: document.getElementById('eggless')?.value,
            addons: []
        };
        if (isCustomSize && productDetails.instructions) productDetails.instructions = `[Custom size cake] ${productDetails.instructions}`;
        else if (isCustomSize) productDetails.instructions = 'Custom size cake - please contact customer for exact dimensions';
    } else if (productType === 'cookie') {
        productName = 'Cookie Box';
        productDetails = {
            cookie_flavor: document.getElementById('cookieFlavor')?.value,
            box_size: document.getElementById('cookieBoxSize')?.value,
            gift_wrap: document.getElementById('cookieGiftWrap')?.value,
            theme: document.getElementById('cakeTheme')?.value,
            message: document.getElementById('cakeMessage')?.value,
            instructions: document.getElementById('specialInstructions')?.value,
            eggless: document.getElementById('eggless')?.value,
            addons: []
        };
    } else if (productType === 'brownie') {
        productName = 'Brownie Tray';
        productDetails = {
            brownie_flavor: document.getElementById('brownieFlavor')?.value,
            tray_size: document.getElementById('brownieTraySize')?.value,
            toppings: document.getElementById('brownieToppings')?.value,
            theme: document.getElementById('cakeTheme')?.value,
            message: document.getElementById('cakeMessage')?.value,
            instructions: document.getElementById('specialInstructions')?.value,
            eggless: document.getElementById('eggless')?.value,
            addons: []
        };
    } else if (productType === 'bento') {
        productName = 'Bento Cake';
        productDetails = {
            bento_flavor: document.getElementById('bentoFlavor')?.value,
            bento_theme: document.getElementById('bentoTheme')?.value,
            bento_text: document.getElementById('bentoText')?.value,
            theme: document.getElementById('cakeTheme')?.value,
            message: document.getElementById('cakeMessage')?.value,
            instructions: document.getElementById('specialInstructions')?.value,
            eggless: document.getElementById('eggless')?.value,
            addons: []
        };
    }

    document.querySelectorAll('.addon-option:checked').forEach(cb => {
        addons.push({ name: cb.dataset.name, price: parseFloat(cb.dataset.price) || 0 });
    });
    productDetails.addons = addons;
    let addonTotal = addons.reduce((sum, a) => sum + a.price, 0);
    finalTotal = basePriceFromCart + addonTotal;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phone);
    formData.append('address', address);
    formData.append('payment_method', payment);
    formData.append('delivery_datetime', deliveryDateTime);
    formData.append('transaction_id', transactionId || '');
    formData.append('product_info', productName);
    formData.append('theme', productDetails.theme || '');
    formData.append('cake_message', productDetails.message || '');
    formData.append('instructions', productDetails.instructions || '');
    formData.append('eggless', productDetails.eggless || 'No');
    formData.append('cart_items', JSON.stringify([{
        name: productName,
        price: finalTotal,
        quantity: 1,
        customizations: productDetails,
        addons: addons
    }]));
    formData.append('selected_addons', JSON.stringify(addons));
    formData.append('addon_total', addonTotal.toString());
    formData.append('final_total', finalTotal.toString());

    if (payment !== 'cod') {
        formData.append('transaction_id', transactionId);
        if (screenshotFile) formData.append('payment_screenshot', screenshotFile);
    }

    const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
    if (!csrftoken) { alert('CSRF token missing. Refresh page.'); return; }

    try {
        // ✅ FIX: changed from '/place-order/' to '/api/order/place/'
        const response = await fetch('/api/order/place/', {
            method: 'POST',
            headers: { 'X-CSRFToken': csrftoken },
            body: formData
        });
        let result;
        try { result = await response.json(); } catch(e) { result = { error: 'Server returned invalid response' }; }
        if (response.ok && result.status === "success") {
            alert('✅ Order placed successfully!');
            if (result.invoice_text) {
                closeCustomizationModal();
                setTimeout(() => showInvoiceModal(result.invoice_text, result.order_id, result.wa_link), 300);
            } else {
                closeCustomizationModal();
                alert('🎉 Order confirmed! Check your WhatsApp for invoice.');
            }
            cart = [];
            updateCartUI();
            closeCartDrawer();
        } else {
            const backendError = result.error || result.message || '❌ Order failed.';
            alert('❌ ' + backendError);
        }
    } catch(error) {
        alert('🌐 Network error. Please check your connection.');
    }
};

// ==================== INVOICE MODAL ====================
function printInvoice() {
    const invoiceContent = document.querySelector('#invoiceModal pre')?.innerText;
    if (!invoiceContent) { alert('❌ Invoice content not found'); return; }
    const printWindow = window.open('', '', 'width=800,height=900');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>IK Delights Invoice</title><style>body{font-family:'Courier New',monospace;padding:40px;}pre{white-space:pre-wrap;font-size:13px;}</style></head><body><pre>${invoiceContent}</pre></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    setTimeout(() => printWindow.print(), 500);
}

function showInvoiceModal(invoiceText, orderId, waLink) {
    const existingModal = document.getElementById('invoiceModal');
    if (existingModal) existingModal.remove();
    const modalHtml = `
        <div id="invoiceModal" class="modal-ov" style="display:flex; z-index:10020;">
            <div class="modal-box" style="max-width:550px;">
                <div class="modal-hd" style="background:linear-gradient(135deg,#c46a84,#e89ab0);">
                    <h3 style="color:white;"><i class="fas fa-file-invoice"></i> Order Invoice #${orderId || 'N/A'}</h3>
                    <button onclick="closeInvoiceModal()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">&times;</button>
                </div>
                <div class="modal-body" style="max-height:500px; overflow-y:auto;">
                    <pre style="white-space:pre-wrap;font-family:monospace;font-size:13px;background:#f9f5f7;padding:15px;border-radius:12px;">${escapeHTML(invoiceText)}</pre>
                    <div style="text-align:center;margin-top:20px;">
                        <button onclick="printInvoice()" class="btn-grad" style="margin-right:10px;"><i class="fas fa-print"></i> Print Invoice</button>
                        <button onclick="closeInvoiceModal()" class="btn-outline">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
    if (waLink) window.open(waLink, "_blank");
}

window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if (modal) modal.remove();
    document.body.style.overflow = 'auto';
    alert('🎉 Thank you for choosing IK Delights!');
};

// ==================== MODAL HANDLERS ====================
function initModalHandlers() {
    document.querySelectorAll('.open-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = btn.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            if (modal) modal.style.display = 'flex';
        });
    });
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            if (modal) modal.style.display = 'none';
        });
    });
}

// ==================== FAVORITES ====================
async function loadFavorites() {
    if (isInnerPage) return;
    try {
        const data = await apiRequest('/api/favorites/');
        const favorites = data.favorites || [];
        const favIds = new Set(favorites.map(f => f.product_id));
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            const pid = parseInt(btn.getAttribute('data-product-id'));
            if (pid && favIds.has(pid)) {
                btn.classList.add('active');
                const icon = btn.querySelector('i');
                if (icon) icon.classList.replace('far', 'fas');
            }
        });
    } catch(e) { console.error(e); }
}

window.toggleFavorite = async function(productId, btnElement) {
    if (!isUserLoggedIn()) { alert('🔐 Please login to save favorites'); return; }
    try {
        const res = await fetch('/api/favorites/toggle/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
            body: JSON.stringify({ product_id: productId })
        });
        const data = await res.json();
        const icon = btnElement.querySelector('i');
        if (data.status === 'added') {
            btnElement.classList.add('active');
            if (icon) icon.classList.replace('far', 'fas');
            alert('❤️ Added to favorites');
        } else {
            btnElement.classList.remove('active');
            if (icon) icon.classList.replace('fas', 'far');
            alert('💔 Removed from favorites');
        }
    } catch(error) { alert('🔐 Please login to save favorites'); }
};

function initFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const productId = btn.getAttribute('data-product-id');
            if (productId) await window.toggleFavorite(productId, btn);
        });
    });
}

// ==================== REVIEWS ====================
async function loadReviews() {
    if (isInnerPage) return;
    try {
        const data = await apiRequest('/api/reviews/');
        const reviews = data || [];
        const track = document.getElementById('reviews-track');
        if (track) {
            if (!reviews.length) { track.innerHTML = '<div class="review-card"><p>✨ No reviews yet. Be the first to review!</p></div>'; return; }
            track.innerHTML = reviews.map(r => `
                <div class="review-card">
                    <div class="rc-quote">"</div>
                    <div class="rc-header"><div class="rc-avatar">${(r.name?.slice(0,2) || 'GU').toUpperCase()}</div><div><div class="rc-name">${escapeHTML(r.name)}</div><div class="rc-role">${escapeHTML(r.city)}</div></div></div>
                    <div class="rc-stars">${Array(5).fill().map((_,i) => `<i class="${i < r.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}</div>
                    <div class="rc-text">${escapeHTML(r.comment)}</div>
                    <div class="rc-date">${r.created_at || ''}</div>
                </div>
            `).join('');
        }
    } catch(e) { console.error(e); }
}

function setupReviewForm() {
    if (isInnerPage) return;
    const form = document.getElementById('reviewForm');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('reviewName')?.value.trim();
        const city = document.getElementById('reviewCity')?.value.trim();
        const text = document.getElementById('reviewText')?.value.trim();
        const starsEl = document.querySelector('input[name="rating"]:checked');
        if (!name || !city || !text || !starsEl) { alert('⭐ Please fill all fields and select a rating'); return; }
        try {
            const res = await apiRequest('/api/reviews/submit/', 'POST', { name, city, rating: parseInt(starsEl.value), comment: text });
            if (res.status === 'ok') { alert('✨ Thank you for your valuable feedback!'); form.reset(); await loadReviews(); }
        } catch(err) { alert('Network error.'); }
    });
}

// ==================== ZOOM MODAL ====================
window.currentZoomImages = [];
window.currentZoomIndex = 0;
function openZoomModalFromGallery(imgSrc) {
    const allImgs = [];
    document.querySelectorAll('.gal-card img').forEach(img => allImgs.push({ src: img.src }));
    window.currentZoomImages = allImgs;
    window.currentZoomIndex = window.currentZoomImages.findIndex(img => img.src === imgSrc) || 0;
    const zoomImg = document.getElementById('zoomImg');
    if (zoomImg) zoomImg.src = window.currentZoomImages[window.currentZoomIndex].src;
    document.getElementById('zoomModal')?.classList.add('open');
}
function closeZoomModal() { document.getElementById('zoomModal')?.classList.remove('open'); }
function prevZoomImage() {
    if (!window.currentZoomImages.length) return;
    window.currentZoomIndex = (window.currentZoomIndex - 1 + window.currentZoomImages.length) % window.currentZoomImages.length;
    document.getElementById('zoomImg').src = window.currentZoomImages[window.currentZoomIndex].src;
}
function nextZoomImage() {
    if (!window.currentZoomImages.length) return;
    window.currentZoomIndex = (window.currentZoomIndex + 1) % window.currentZoomImages.length;
    document.getElementById('zoomImg').src = window.currentZoomImages[window.currentZoomIndex].src;
}

// ==================== NAVBAR DROPDOWN ====================
let categoriesCache = null;
async function renderNavbarDropdown() {
    const container = document.getElementById('mainDropdown');
    if (!container) return;
    try {
        if (!categoriesCache) {
            const res = await fetch('/api/categories/');
            const data = await res.json();
            categoriesCache = Array.isArray(data) ? data : (data.categories || []);
        }
        const categories = categoriesCache;
        if (!categories.length) { container.innerHTML = '<div class="category-item">No categories</div>'; return; }
        let html = '';
        for (const cat of categories) {
            html += `<div class="category-item" data-slug="${cat.slug}"><span><i class="fas ${cat.icon || 'fa-tag'}"></i> ${escapeHTML(cat.name)}</span><i class="fas fa-chevron-right"></i><div class="category-submenu"><div class="submenu-grid"><div class="submenu-product-card" onclick="window.location.href='/category/${cat.slug}/'"><div class="submenu-product-info"><div class="submenu-product-name">View All ${escapeHTML(cat.name)}</div></div></div></div></div></div>`;
        }
        container.innerHTML = html;
        document.querySelectorAll('#mainDropdown .category-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.submenu-product-card')) return;
                e.preventDefault();
                const slug = item.getAttribute('data-slug');
                if (slug) window.location.href = `/category/${slug}/`;
            });
        });
    } catch(e) { console.error(e); }
}

// ==================== COUNTERS & GALLERY ====================
function animateCounter(element, target, duration = 2000) {
    if (!element) return;
    let start = 0;
    const increment = target / (duration / 16);
    let current = start;
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.innerText = target.toLocaleString();
            clearInterval(timer);
        } else { element.innerText = Math.floor(current).toLocaleString(); }
    }, 16);
}

function initAboutCounters() {
    if (isInnerPage) return;
    const aboutSection = document.querySelector('#about');
    if (!aboutSection) return;
    let counted = false;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !counted) {
                counted = true;
                document.querySelectorAll('#about .count').forEach(counter => {
                    const target = parseInt(counter.getAttribute('data-target'));
                    if (target) animateCounter(counter, target, 2000);
                });
                observer.unobserve(aboutSection);
            }
        });
    }, { threshold: 0.3 });
    observer.observe(aboutSection);
}

function initGalleryFilter() {
    if (isInnerPage) return;
    const filterBtns = document.querySelectorAll('.gal-filters .gal-filter');
    const galleryCards = document.querySelectorAll('.gal-card');
    if (!filterBtns.length) return;
    function filterGallery(category) {
        galleryCards.forEach(card => {
            if (category === 'all') card.style.display = '';
            else {
                const cardCat = card.getAttribute('data-category');
                card.style.display = cardCat === category ? '' : 'none';
            }
        });
    }
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const filter = btn.getAttribute('data-filter');
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterGallery(filter);
        });
    });
}

function initExploreButton() {
    if (isInnerPage) return;
    const exploreBtn = document.getElementById('exploreMenuBtn');
    if (exploreBtn) exploreBtn.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }); });
}

function initSmoothScroll() {
    if (isInnerPage) return;
    const arrow = document.querySelector('.hero-scroll-arrow');
    if (arrow) arrow.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }); });
}

// ==================== AJAX LOGIN ====================
function initAjaxLogin() {
    const loginForm = document.getElementById('ajaxLoginForm');
    if(loginForm){
        loginForm.addEventListener('submit', async function(e){
            e.preventDefault();
            const username = document.getElementById('loginUsername')?.value;
            const password = document.getElementById('loginPassword')?.value;
            if (!username || !password) { alert('📝 Please enter username and password'); return; }
            try{
                const response = await fetch('/ajax-login/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify({ username, password })
                });
                const data = await response.json();
                if(data.status === 'ok'){
                    alert('✅ Welcome back! Login successful.');
                    setTimeout(() => { window.location.href = "/"; }, 800);
                } else { alert(data.message || '❌ Invalid username or password'); }
            } catch(error){ alert('🌐 Network error.'); }
        });
    }
}

// ==================== AJAX SIGNUP ====================
function initAjaxSignup() {
    const signupForm = document.getElementById('ajaxSignupForm');
    if(signupForm){
        signupForm.addEventListener('submit', async function(e){
            e.preventDefault();
            const fullName = document.getElementById('signupFullName')?.value;
            const username = document.getElementById('signupUsername')?.value;
            const email = document.getElementById('signupEmail')?.value;
            const password = document.getElementById('signupPassword')?.value;
            const confirmPassword = document.getElementById('signupConfirmPassword')?.value;
            if (!fullName || !username || !email || !password || !confirmPassword) { alert('📝 Please fill all required fields'); return; }
            if (password !== confirmPassword) { alert('❌ Passwords do not match'); return; }
            try{
                const response = await fetch('/ajax-register/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRFToken() },
                    body: JSON.stringify({ full_name: fullName, username, email, password, confirm_password: confirmPassword })
                });
                const data = await response.json();
                if(data.status === 'ok'){
                    alert('🎉 Account created successfully! Welcome to IK Delights.');
                    setTimeout(() => { window.location.href = "/"; }, 800);
                } else { alert(data.message || '❌ Registration failed'); }
            } catch(error){ alert('🌐 Network error.'); }
        });
    }
}

function openSignupModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.style.display = 'none';
    const signupModal = document.getElementById('signupModal');
    if (signupModal) { signupModal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    else alert('⚠️ Signup form not available');
}

// ==================== SCROLL BUTTONS ====================
function initSweetCreationsScrollButtons() {
    const leftBtn = document.getElementById('scrollLeftBtn');
    const rightBtn = document.getElementById('scrollRightBtn');
    const grid = document.querySelector('.ikd-grid');
    if (!leftBtn || !rightBtn || !grid) return;
    leftBtn.addEventListener('click', () => grid.scrollBy({ left: -280, behavior: 'smooth' }));
    rightBtn.addEventListener('click', () => grid.scrollBy({ left: 280, behavior: 'smooth' }));
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔐 IK Delights v26.0 PRODUCTION READY');
    
    if (!isInnerPage) {
        initSplash();
        setTimeout(() => { try { showDealPopup(); } catch(e) {} }, 500);
    }
    refreshCart();
    initModalHandlers();
    initProfileModal();
    initFavoriteButtons();
    initAjaxLogin();
    initAjaxSignup();
    initSweetCreationsScrollButtons();
    if (!isInnerPage) {
        initDarkMode();
        loadReviews();
        loadFavorites();
        setupReviewForm();
        initAboutCounters();
        initGalleryFilter();
        initExploreButton();
        initSmoothScroll();
    }
    console.log('✅ Loaded on', window.location.pathname);
});

// ==================== GLOBAL EXPORTS ====================
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;
window.proceedToCheckout = proceedToCheckout;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleDarkMode = toggleDarkMode;
window.closeZoomModal = closeZoomModal;
window.prevZoomImage = prevZoomImage;
window.nextZoomImage = nextZoomImage;
window.initPaymentFields = initPaymentFields;
window.showProductFields = showProductFields;
window.renderNavbarDropdown = renderNavbarDropdown;
window.escapeHTML = escapeHTML;
window.openZoomModalFromGallery = openZoomModalFromGallery;
window.openCustomizationModal = openCustomizationModal;
window.closeCustomizationModal = closeCustomizationModal;
window.showCustomizationStep = showCustomizationStep;
window.nextCustomizationStep = nextCustomizationStep;
window.prevCustomizationStep = prevCustomizationStep;
window.submitCustomization = submitCustomization;
window.closeInvoiceModal = closeInvoiceModal;
window.printInvoice = printInvoice;
window.openSignupModal = openSignupModal;
