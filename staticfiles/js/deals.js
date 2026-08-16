/* ======================================================
   🌸 IK DELIGHTS - COMPLETE DEALS SYSTEM (FINAL PRODUCTION)
   FIXED: Modal display with proper styles
   FIXED: No flickering in admin panel
====================================================== */

let previewInterval = null;
let popupInterval = null;
let currentDealId = null;

/* ======================================================
   CSRF TOKEN
====================================================== */

function getCookie(name) {

    let value = null;

    document.cookie.split(';').forEach(cookie => {

        cookie = cookie.trim();

        if (cookie.startsWith(name + '=')) {

            value = decodeURIComponent(cookie.slice(name.length + 1));
        }
    });

    return value;
}

/* ======================================================
   TOAST NOTIFICATION
====================================================== */

function toast(msg, error = false) {

    let box = document.getElementById("toastBox");

    if (!box) {

        box = document.createElement("div");
        box.id = "toastBox";

        box.style.cssText = `
            position:fixed;
            bottom:20px;
            right:20px;
            z-index:999999;
            display:flex;
            flex-direction:column;
            gap:10px;
        `;

        document.body.appendChild(box);
    }

    const t = document.createElement("div");

    t.style.cssText = `
        background:${error ? "#e74c3c" : "#2ecc71"};
        color:white;
        padding:12px 18px;
        border-radius:30px;
        font-weight:700;
        font-size:14px;
        box-shadow:0 10px 25px rgba(0,0,0,.2);
        animation:slideIn 0.3s ease;
    `;

    t.innerText = msg;

    box.appendChild(t);

    setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateX(100px)";
        t.style.transition = "0.3s ease";
        setTimeout(() => t.remove(), 300);
    }, 2700);
}

/* ======================================================
   SAFE DATA PARSER
====================================================== */

function parseDeals(data) {

    if (!data) return [];

    if (Array.isArray(data)) return data;

    if (Array.isArray(data.deals)) return data.deals;

    if (Array.isArray(data.results)) return data.results;

    return [];
}

/* ======================================================
   CHECK IF IN ADMIN - STRONGER CHECK
====================================================== */

function isAdminPanel() {
    return window.location.pathname.includes("/admin/");
}

/* ======================================================
   CHECK IF SHOULD SHOW POPUP
====================================================== */

function shouldShowPopup() {
    // Popup only on frontend, not on admin pages
    if (isAdminPanel()) return false;
    // Popup only on homepage or specific pages (customize as needed)
    const path = window.location.pathname;
    // Don't show on admin, dashboard, login, signup, checkout, cart
    if (path.includes("/admin/")) return false;
    if (path.includes("/dashboard/")) return false;
    if (path.includes("/login/")) return false;
    if (path.includes("/signup/")) return false;
    if (path.includes("/checkout/")) return false;
    if (path.includes("/cart/")) return false;
    return true;
}

/* ======================================================
   LOAD DEALS TABLE - NO DEFAULT IMAGE
====================================================== */

window.loadDeals = async function () {

    try {

        const res = await fetch("/api/deals/");
        const data = await res.json();

        const deals = parseDeals(data);

        const tbody = document.getElementById("dealsTableBody");

        if (!tbody) return;

        tbody.innerHTML = "";

        if (deals.length === 0) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center;padding:30px;">
                        🎯 No Deals Found
                    </td>
                </tr>
            `;
            return;
        }

        deals.forEach(deal => {

            const imageSrc = deal.image || deal.image_url || "";
            
            tbody.innerHTML += `
                <tr>
                    <td>${deal.id}</td>
                    <td>
                        ${imageSrc ? `<img src="${imageSrc}" class="deal-image" onerror="this.style.display='none'">` : '<div style="width:80px;height:80px;background:#f0f0f0;border-radius:20px;"></div>'}
                    </td>
                    <td>${deal.title || "Untitled"}</td>
                    <td>
                        <div class="live-countdown"
                             data-expiry="${deal.expiry}">
                            Loading...
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${deal.is_active ? "active" : "inactive"}">
                            ${deal.is_active ? "Active" : "Inactive"}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='editDeal(${JSON.stringify(deal)})'>
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn-delete" onclick="deleteDeal(${deal.id})">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        startCountdowns();

    } catch (e) {
        console.error(e);
        toast("Load Failed", true);
    }
};

/* ======================================================
   TABLE COUNTDOWN TIMER
====================================================== */

function startCountdowns() {

    document.querySelectorAll(".live-countdown").forEach(el => {

        const expiry = el.dataset.expiry;

        if (!expiry) return;

        if (el._timer) clearInterval(el._timer);

        const timer = setInterval(() => {

            const diff = new Date(expiry) - new Date();

            if (diff <= 0) {
                el.innerText = "Expired";
                el.style.opacity = "0.5";
                clearInterval(timer);
                return;
            }

            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            el.innerText = `${d}d ${h}h ${m}m ${s}s`;

        }, 1000);

        el._timer = timer;
    });
}

/* ======================================================
   🆕 OPEN ADD DEAL MODAL (FIXED - FORCE DISPLAY)
====================================================== */

window.showAddDealModal = function () {
    console.log("🔄 showAddDealModal called");
    
    currentDealId = null;

    const modal = document.getElementById("dealModal");
    
    // Clear form fields
    const nameInput = document.getElementById("dealName");
    const timerInput = document.getElementById("dealTimer");
    const statusSelect = document.getElementById("dealStatus");
    const imageInput = document.getElementById("dealImage");
    const preview = document.getElementById("previewDealImage");
    const previewTitle = document.querySelector(".preview-overlay-content h3");
    
    if (nameInput) nameInput.value = "";
    if (timerInput) timerInput.value = "";
    if (statusSelect) statusSelect.value = "true";
    if (imageInput) imageInput.value = "";
    
    if (preview) {
        preview.src = "";
        preview.style.display = "none";
    }
    
    if (previewTitle) {
        previewTitle.innerText = "Deal Preview";
    }
    
    // ✅ FORCE MODAL DISPLAY
    if (modal) {
        modal.removeAttribute('style');
        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
        modal.style.backdropFilter = "blur(5px)";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";
        modal.style.zIndex = "999999";
        
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = "15px";
        
        console.log("✅ Add Deal Modal opened");
    } else {
        console.error("❌ Deal modal element not found!");
    }
};

/* ======================================================
   🆕 CLOSE DEAL MODAL (FIXED)
====================================================== */

window.closeDealModal = function () {
    console.log("🔄 closeDealModal called");
    
    const modal = document.getElementById("dealModal");
    if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
        document.body.style.paddingRight = "0";
        console.log("✅ Deal Modal closed");
    }
};

/* ======================================================
   🆕 EDIT DEAL (FIXED)
====================================================== */

window.editDeal = function (deal) {
    console.log("🔄 editDeal called for id:", deal.id);
    
    currentDealId = deal.id;

    const modal = document.getElementById("dealModal");
    const nameInput = document.getElementById("dealName");
    const statusSelect = document.getElementById("dealStatus");
    const timerInput = document.getElementById("dealTimer");
    const preview = document.getElementById("previewDealImage");
    const previewTitle = document.querySelector(".preview-overlay-content h3");
    
    if (nameInput) nameInput.value = deal.title || "";
    if (statusSelect) statusSelect.value = String(deal.is_active);
    if (timerInput) timerInput.value = deal.expiry?.slice(0, 16) || "";
    
    if (preview) {
        const imageSrc = deal.image || deal.image_url || "";
        if (imageSrc) {
            preview.src = imageSrc;
            preview.style.display = "block";
        } else {
            preview.src = "";
            preview.style.display = "none";
        }
    }
    
    if (previewTitle && deal.title) {
        previewTitle.innerText = deal.title;
    }
    
    if (modal) {
        modal.removeAttribute('style');
        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.left = "0";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
        modal.style.backdropFilter = "blur(5px)";
        modal.style.justifyContent = "center";
        modal.style.alignItems = "center";
        modal.style.zIndex = "999999";
        
        document.body.style.overflow = "hidden";
        document.body.style.paddingRight = "15px";
        
        console.log("✅ Edit Deal Modal opened for:", deal.title);
    }
};

/* ======================================================
   LIVE PREVIEW UPDATE
====================================================== */

function updateLivePreview() {

    const timerValue = document.getElementById("dealTimer").value;
    const titleValue = document.getElementById("dealName").value;
    const imageInput = document.getElementById("dealImage");
    const previewImg = document.getElementById("previewDealImage");

    const previewTitle = document.querySelector(".preview-overlay-content h3");
    if (previewTitle && titleValue) {
        previewTitle.innerText = titleValue;
    }

    if (timerValue) {
        const expiry = new Date(timerValue);
        const previewTimer = document.querySelector(".popup-live-timer");
        
        if (previewTimer && expiry > new Date()) {
            const diff = expiry - new Date();
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff % 86400000) / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            
            previewTimer.innerHTML = `
                <div class="time-card">
                    <span>${d}</span>
                    <small>DAYS</small>
                </div>
                <div class="time-card">
                    <span>${h}</span>
                    <small>HOURS</small>
                </div>
                <div class="time-card">
                    <span>${m}</span>
                    <small>MINS</small>
                </div>
            `;
        }
    }

    if (imageInput.files && imageInput.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewImg.style.display = "block";
        };
        reader.readAsDataURL(imageInput.files[0]);
    }
}

/* ======================================================
   SAVE DEAL (ADD/UPDATE)
====================================================== */

window.saveDeal = async function () {

    try {

        const title = document.getElementById("dealName").value;
        const expiry = document.getElementById("dealTimer").value;
        const is_active = document.getElementById("dealStatus").value;
        const image = document.getElementById("dealImage").files[0];

        if (!title) {
            toast("Please enter deal title", true);
            return;
        }

        if (!expiry) {
            toast("Please select expiry date/time", true);
            return;
        }

        const formData = new FormData();

        formData.append("title", title);
        formData.append("expiry", expiry);
        formData.append("is_active", is_active);

        if (image) {
            formData.append("image", image);
        }

        let url = "/api/deals/add/";

        if (currentDealId) {
            url = `/api/deals/update/${currentDealId}/`;
        }

        const res = await fetch(url, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCookie("csrftoken")
            },
            body: formData
        });

        const data = await res.json();

        if (data.success || data.status === "success") {

            toast("✅ Your deal has been saved");

            window.closeDealModal();

            window.loadDeals();

        } else {
            toast(data.message || "Save Failed", true);
        }

    } catch (e) {
        console.error(e);
        toast("Save Failed", true);
    }
};

/* ======================================================
   DELETE DEAL
====================================================== */

window.deleteDeal = async function (id) {

    if (!confirm("Delete this deal?")) return;

    try {

        const res = await fetch(`/api/deals/delete/${id}/`, {
            method: "POST",
            headers: {
                "X-CSRFToken": getCookie("csrftoken")
            }
        });

        const data = await res.json();

        if (data.success || data.status === "success") {

            toast("🗑️ Deleted Successfully");
            window.loadDeals();

        } else {
            toast("Delete Failed", true);
        }

    } catch (e) {
        console.error(e);
        toast("Delete Failed", true);
    }
};

/* ======================================================
   CLOSE POPUP (SMOOTH VERSION)
====================================================== */

window.closeDealPopup = function () {

    const popup = document.getElementById("dealPopup");

    if (popup) {
        popup.classList.remove("show");
        setTimeout(() => {
            popup.style.display = "none";
        }, 250);
    }

    document.body.classList.remove("popup-open");

    if (popupInterval) {
        clearInterval(popupInterval);
        popupInterval = null;
    }

    console.log("✅ Popup closed successfully");
};

/* ======================================================
   LOAD AND SHOW POPUP (AUTO TRIGGER) - NO FLICKERING
====================================================== */

window.loadDealPopup = async function () {

    // 🆕 STRONG CHECK - Don't show popup in admin panel at all
    if (isAdminPanel()) {
        console.log("🛠️ Admin panel detected - Popup disabled");
        return;
    }
    
    // 🆕 Don't show popup on these pages
    const blockedPaths = ["/admin/", "/dashboard/", "/login/", "/signup/", "/checkout/", "/cart/"];
    for (const path of blockedPaths) {
        if (window.location.pathname.includes(path)) {
            console.log(`🚫 Popup disabled on ${path}`);
            return;
        }
    }

    try {

        const res = await fetch("/api/deals/");
        const data = await res.json();

        const deals = parseDeals(data);

        const active = deals.find(d => {
            const activeStatus = d.is_active === true || d.is_active === "true";
            const notExpired = new Date(d.expiry) > new Date();
            return activeStatus && notExpired;
        });

        const popup = document.getElementById("dealPopup");

        if (!popup) return;

        if (!active) {
            if (popup.style.display !== "none") {
                popup.style.display = "none";
            }
            document.body.classList.remove("popup-open");
            console.log("ℹ️ No active & non-expired deal found");
            return;
        }

        const popupImage = document.getElementById("popupImage");
        const popupTimer = document.getElementById("popupTimer");
        const popupBtn = document.getElementById("popupBtn");

        if (popupImage) {
            const imageSrc = active.image || active.image_url;
            if (imageSrc) {
                popupImage.src = imageSrc;
                popupImage.style.display = "block";
            } else {
                popupImage.style.display = "none";
            }
        }

        if (popupBtn) {
            popupBtn.href = active.link || "#";
            popupBtn.target = "_blank";
        }

        if (popupTimer && active.expiry) {

            if (popupInterval) clearInterval(popupInterval);

            const updatePopupTimer = () => {
                const diff = new Date(active.expiry) - new Date();

                if (diff <= 0) {
                    popupTimer.innerHTML = `EXPIRED`;
                    if (popupInterval) clearInterval(popupInterval);
                    setTimeout(() => window.closeDealPopup(), 2000);
                    return;
                }

                const d = Math.floor(diff / 86400000);
                const h = Math.floor((diff % 86400000) / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);

                popupTimer.innerHTML = `${d}d ${h}h ${m}m ${s}s`;
            };

            updatePopupTimer();
            popupInterval = setInterval(updatePopupTimer, 1000);
        }

        // 🆕 Smooth show - no flickering
        popup.style.display = "flex";
        setTimeout(() => {
            popup.classList.add("show");
        }, 50);
        
        document.body.classList.add("popup-open");
        
        console.log("🎉 Popup shown for deal:", active.title);

    } catch (e) {
        console.error("Popup Error:", e);
    }
};

/* ======================================================
   FORCE TEST POPUP (MANUAL)
====================================================== */

window.testPopup = async function() {
    console.log("🔄 Manually testing popup...");
    await window.loadDealPopup();
};

/* ======================================================
   INITIALIZATION
====================================================== */

document.addEventListener("DOMContentLoaded", () => {

    console.log("🌸 IK DELIGHTS SYSTEM LOADED");
    console.log("✅ Path:", window.location.pathname);
    console.log("✅ Is Admin:", isAdminPanel());

    window.loadDeals();

    // 🆕 Show popup ONLY on frontend website with delay and check
    if (shouldShowPopup()) {
        setTimeout(() => {
            window.loadDealPopup();
        }, 1500);
        console.log("📱 Frontend detected - Popup will show");
    } else {
        console.log("🛠️ Admin/Protected page - Popup disabled");
    }

    // Close button binding
    const closeBtn = document.getElementById("closeDealPopup");

    if (closeBtn) {
        closeBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.closeDealPopup();
        };
    }

    document.querySelectorAll(".deal-popup-close").forEach(btn => {
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.closeDealPopup();
        };
    });

    // ESC key close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            window.closeDealModal();
            window.closeDealPopup();
        }
    });

    // Click outside modal close
    const modal = document.getElementById("dealModal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                window.closeDealModal();
            }
        });
    }

    // Click outside popup close
    const popup = document.getElementById("dealPopup");
    if (popup) {
        popup.addEventListener("click", (e) => {
            if (e.target === popup) {
                window.closeDealPopup();
            }
        });
    }

    // Live preview listeners
    const timerInput = document.getElementById("dealTimer");
    const nameInput = document.getElementById("dealName");
    const imageInput = document.getElementById("dealImage");

    if (timerInput) timerInput.addEventListener("input", updateLivePreview);
    if (nameInput) nameInput.addEventListener("input", updateLivePreview);
    if (imageInput) imageInput.addEventListener("change", updateLivePreview);
    
    console.log("✅ All event listeners registered successfully");
});