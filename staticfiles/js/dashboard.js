/* ======================================================
   IK DELIGHTS ADMIN DASHBOARD JS
   PRODUCTION-READY REAL-TIME SYSTEM
   FULLY FIXED: All modals (Add/Edit/Delete) working
   UPDATED: Professional toast with beautiful styles
   ADDED: All 4 charts (Sales, Status, Events, Event Types)
   FIXED: Duplicate modal creation and table shift issue
====================================================== */

document.addEventListener("DOMContentLoaded", function () {

    /* ==================================================
       GLOBAL VARIABLES
    ================================================== */

    let salesChart = null;
    let statusChart = null;
    let eventsChart = null;
    let eventTypesChart = null;
    let lastOrdersCount = 0;
    let lastMessagesCount = 0;
    let liveInterval = null;
    let isLiveSystemActive = true;
    let isChartsInitialized = false;
    let retryCount = 0;
    const MAX_RETRIES = 10;
    
    // Global editing variables
    let editingProductId = null;
    let editingCategoryId = null;
    let editingDealId = null;

    /* ==================================================
       SAFETY: Ensure window variables exist
    ================================================== */

    if (typeof window.sales_labels === 'undefined') {
        window.sales_labels = [];
        console.warn("sales_labels not defined, initialized as empty array");
    }
    
    if (typeof window.sales_data === 'undefined') {
        window.sales_data = [];
        console.warn("sales_data not defined, initialized as empty array");
    }
    
    if (typeof window.status_labels === 'undefined') {
        window.status_labels = [];
        console.warn("status_labels not defined, initialized as empty array");
    }
    
    if (typeof window.status_data === 'undefined') {
        window.status_data = [];
        console.warn("status_data not defined, initialized as empty array");
    }
    
    if (typeof window.event_labels === 'undefined') {
        window.event_labels = [];
        console.warn("event_labels not defined, initialized as empty array");
    }
    
    if (typeof window.event_counts === 'undefined') {
        window.event_counts = [];
        console.warn("event_counts not defined, initialized as empty array");
    }
    
    if (typeof window.event_type_labels === 'undefined') {
        window.event_type_labels = [];
        console.warn("event_type_labels not defined, initialized as empty array");
    }
    
    if (typeof window.event_type_counts === 'undefined') {
        window.event_type_counts = [];
        console.warn("event_type_counts not defined, initialized as empty array");
    }

    /* ==================================================
       🆕 PROFESSIONAL TOAST NOTIFICATION (BEAUTIFUL)
    ================================================== */

    window.showToastNotification = function(message, type = "info") {
        const existingToast = document.getElementById('dashboardToast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.id = 'dashboardToast';
        
        let bgColor, icon, borderColor;
        switch(type) {
            case 'success':
                bgColor = 'linear-gradient(135deg, #28a745, #20c997)';
                icon = '✓';
                borderColor = '#1e7e34';
                break;
            case 'error':
                bgColor = 'linear-gradient(135deg, #dc3545, #c82333)';
                icon = '✗';
                borderColor = '#a71d2a';
                break;
            case 'warning':
                bgColor = 'linear-gradient(135deg, #ffc107, #ffca2c)';
                icon = '⚠';
                borderColor = '#d39e00';
                break;
            case 'order':
                bgColor = 'linear-gradient(135deg, #ff69b4, #ff9fcf)';
                icon = '🎂';
                borderColor = '#ff1493';
                break;
            default:
                bgColor = 'linear-gradient(135deg, #c46a84, #e89ab0)';
                icon = 'ℹ';
                borderColor = '#9e4a64';
        }
        
        toast.style.cssText = `
            position: fixed !important;
            bottom: 30px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            background: ${bgColor} !important;
            color: white !important;
            padding: 14px 28px !important;
            border-radius: 12px !important;
            z-index: 999999999 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            text-align: center !important;
            max-width: 90% !important;
            min-width: 280px !important;
            box-shadow: 0 8px 25px rgba(0,0,0,0.2) !important;
            font-family: 'Poppins', 'Segoe UI', sans-serif !important;
            border-left: 4px solid ${borderColor} !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 10px !important;
            animation: toastSlideIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55) !important;
        `;
        
        toast.innerHTML = `<span style="font-size: 18px; font-weight: 900;">${icon}</span> <span>${message}</span>`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => { if (toast && toast.parentNode) toast.remove(); }, 300);
        }, 4000);
    };

    // Add animation styles dynamically
    if (!document.getElementById('dashboardToastStyles')) {
        const style = document.createElement('style');
        style.id = 'dashboardToastStyles';
        style.textContent = `
            @keyframes toastSlideIn {
                0% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.9); }
                100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
            }
            @keyframes toastSlideOut {
                0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                100% { opacity: 0; transform: translateX(-50%) translateY(40px) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
    }

    /* ==================================================
       SOUND NOTIFICATION SYSTEM
    ================================================== */

    const playSound = () => {
        try {
            const audio = new Audio("https://www.soundjay.com/buttons/sounds/button-3.mp3");
            audio.play().catch(e => console.log("Audio play failed:", e));
        } catch(e) { console.log("Audio not supported"); }
    };

    /* ==================================================
       CARD HOVER ANIMATION
    ================================================== */

    const cards = document.querySelectorAll(".dashboard-card");
    cards.forEach(card => {
        card.addEventListener("mouseenter", () => { card.style.boxShadow = "0 12px 25px rgba(255,105,180,0.25)"; });
        card.addEventListener("mouseleave", () => { card.style.boxShadow = "0 4px 15px rgba(0,0,0,0.08)"; });
    });

    /* ==================================================
       COUNTING ANIMATION FOR CARDS
    ================================================== */

    const animateCounter = (element, targetValue, isCurrency = false) => {
        const startValue = 0;
        const duration = 1000;
        const stepTime = 20;
        const steps = duration / stepTime;
        const increment = targetValue / steps;
        let current = startValue;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= targetValue) {
                current = targetValue;
                clearInterval(timer);
            }
            if (isCurrency) {
                element.innerText = `Rs ${Math.floor(current).toLocaleString()}`;
            } else {
                element.innerText = Math.floor(current).toLocaleString();
            }
        }, stepTime);
    };

    const initializeCounters = () => {
        const counters = document.querySelectorAll(".stats-info h2");
        counters.forEach(counter => {
            const targetText = counter.innerText;
            const numericValue = parseInt(targetText.replace(/[^0-9]/g, ""));
            if (!isNaN(numericValue) && numericValue > 0) {
                const isCurrency = targetText.includes("Rs");
                if (isCurrency) counter.innerText = "Rs 0";
                else counter.innerText = "0";
                animateCounter(counter, numericValue, isCurrency);
            }
        });
    };

    /* ==================================================
       STATUS BADGE COLORS
    ================================================== */

    window.updateBadgeColors = function() {
        const badges = document.querySelectorAll(".status-badge");
        badges.forEach(badge => {
            const text = badge.innerText.toLowerCase().trim();
            if (text.includes("pending")) { badge.style.background = "#fff3cd"; badge.style.color = "#856404"; }
            else if (text.includes("processing")) { badge.style.background = "#d1ecf1"; badge.style.color = "#0c5460"; }
            else if (text.includes("delivered")) { badge.style.background = "#d4edda"; badge.style.color = "#155724"; }
            else if (text.includes("cancel")) { badge.style.background = "#f8d7da"; badge.style.color = "#721c24"; }
            else if (text.includes("active")) { badge.style.background = "#d4edda"; badge.style.color = "#155724"; }
            else if (text.includes("inactive")) { badge.style.background = "#f8d7da"; badge.style.color = "#721c24"; }
        });
    };

    /* ==================================================
       SMOOTH PAGE LOAD ANIMATION
    ================================================== */

    const content = document.querySelector(".main-content");
    if (content) {
        content.style.opacity = "0";
        content.style.transform = "translateY(20px)";
        setTimeout(() => {
            content.style.transition = "all 0.5s ease";
            content.style.opacity = "1";
            content.style.transform = "translateY(0)";
        }, 100);
    }

    /* ==================================================
       WHATSAPP SYSTEM
    ================================================== */

    const openWhatsApp = (number, message) => {
        if (!number || number.length < 10) {
            console.error("Invalid WhatsApp number");
            return;
        }
        const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
        window.open(url, "_blank");
    };

    const addWhatsAppButtons = () => {
        const orderRows = document.querySelectorAll("#recentOrdersTable tbody tr");
        orderRows.forEach(row => {
            const customerName = row.cells[1]?.innerText;
            const orderId = row.cells[0]?.innerText;
            const phoneElement = row.cells[2]?.innerText;
            if (customerName && !row.querySelector(".whatsapp-btn")) {
                const whatsappCell = document.createElement("td");
                whatsappCell.innerHTML = `<button class="whatsapp-btn" data-phone="${phoneElement || ''}" style="background:#25D366; color:white; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px;"><i class="fab fa-whatsapp"></i> Message</button>`;
                const btn = whatsappCell.querySelector(".whatsapp-btn");
                btn.addEventListener("click", () => {
                    const phone = btn.getAttribute("data-phone");
                    const message = `Hi ${customerName}, your ${orderId} is confirmed 🎂\nThanks for choosing IK Delights!`;
                    openWhatsApp(phone, message);
                });
                row.appendChild(whatsappCell);
            }
        });
    };

    /* ==================================================
       LIVE DATA FETCH
    ================================================== */

    const updateUIWithData = (data) => {
        const totalOrdersEl = document.getElementById("totalOrders");
        const totalRevenueEl = document.getElementById("totalRevenue");
        const pendingOrdersEl = document.getElementById("pendingOrders");
        const unreadMessagesEl = document.getElementById("unreadMessages");
        const notifCountEl = document.getElementById("notifCount");
        const msgCountEl = document.getElementById("msgCount");
        
        if (data.total_orders > lastOrdersCount && lastOrdersCount > 0) {
            playSound();
            window.showToastNotification(`🆕 New Order Received! Total: ${data.total_orders}`, "order");
        }
        if (data.unread_messages > lastMessagesCount && lastMessagesCount > 0) {
            playSound();
            window.showToastNotification(`💬 New Message Received!`, "info");
        }
        
        if (totalOrdersEl && data.total_orders !== undefined) {
            const currentVal = parseInt(totalOrdersEl.innerText.replace(/[^0-9]/g, "")) || 0;
            if (currentVal !== data.total_orders) animateCounter(totalOrdersEl, data.total_orders, false);
        }
        if (totalRevenueEl && data.total_revenue !== undefined) {
            const currentVal = parseInt(totalRevenueEl.innerText.replace(/[^0-9]/g, "")) || 0;
            if (currentVal !== data.total_revenue) animateCounter(totalRevenueEl, data.total_revenue, true);
        }
        if (pendingOrdersEl && data.pending_orders !== undefined) {
            const currentVal = parseInt(pendingOrdersEl.innerText) || 0;
            if (currentVal !== data.pending_orders) animateCounter(pendingOrdersEl, data.pending_orders, false);
        }
        if (unreadMessagesEl && data.unread_messages !== undefined) {
            const currentVal = parseInt(unreadMessagesEl.innerText) || 0;
            if (currentVal !== data.unread_messages) animateCounter(unreadMessagesEl, data.unread_messages, false);
        }
        if (notifCountEl && data.notifications !== undefined) notifCountEl.innerText = data.notifications;
        if (msgCountEl && data.unread_messages !== undefined) msgCountEl.innerText = data.unread_messages;
        
        lastOrdersCount = data.total_orders || 0;
        lastMessagesCount = data.unread_messages || 0;
    };

    const fetchLiveData = () => {
        if (!isLiveSystemActive) return;
        fetch("/admin/live-dashboard/")
            .then(response => response.json())
            .then(data => updateUIWithData(data))
            .catch(error => console.error("Live data fetch error:", error));
    };

    /* ==================================================
       📊 ALL 4 CHARTS INITIALIZATION
    ================================================== */

    const initCharts = () => {
        if (isChartsInitialized) {
            console.log("Charts already initialized");
            return;
        }
        
        if (typeof Chart === 'undefined') {
            console.log("Chart.js not loaded yet, retrying in 1 second...");
            setTimeout(initCharts, 1000);
            return;
        }
        
        console.log("✅ Chart.js loaded, initializing all charts...");
        
        const chartColors = ['#f39c12', '#3498db', '#9b59b6', '#e67e22', '#1abc9c', '#2ecc71', '#27ae60', '#e74c3c'];
        const pieColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#1e8449'];
        
        // 1. SALES CHART (Line Chart)
        const salesCanvas = document.getElementById('salesChart');
        if (salesCanvas && window.sales_labels && window.sales_labels.length > 0) {
            const ctx = salesCanvas.getContext('2d');
            if (salesChart) salesChart.destroy();
            salesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: window.sales_labels,
                    datasets: [{
                        label: 'Revenue (PKR)',
                        data: window.sales_data,
                        borderColor: '#c46a84',
                        backgroundColor: 'rgba(196, 106, 132, 0.1)',
                        borderWidth: 3,
                        pointBackgroundColor: '#c46a84',
                        pointBorderColor: '#fff',
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx) => `PKR ${ctx.raw.toLocaleString()}` } } },
                    scales: { y: { beginAtZero: true, ticks: { callback: (val) => 'PKR ' + val.toLocaleString() } } }
                }
            });
            console.log("✅ Sales chart initialized");
        }
        
        // 2. STATUS CHART (Pie Chart)
        const statusCanvas = document.getElementById('statusChart');
        if (statusCanvas && window.status_labels && window.status_labels.length > 0) {
            const ctx = statusCanvas.getContext('2d');
            if (statusChart) statusChart.destroy();
            statusChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: window.status_labels,
                    datasets: [{ data: window.status_data, backgroundColor: chartColors.slice(0, window.status_labels.length), borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} orders` } } } }
            });
            console.log("✅ Status chart initialized");
        }
        
        // 3. EVENTS CHART (Bar Chart)
        const eventsCanvas = document.getElementById('eventsChart');
        if (eventsCanvas && window.event_labels && window.event_labels.length > 0) {
            const ctx = eventsCanvas.getContext('2d');
            if (eventsChart) eventsChart.destroy();
            eventsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: window.event_labels,
                    datasets: [{ label: 'Number of Events', data: window.event_counts, backgroundColor: '#c46a84', borderRadius: 8, barPercentage: 0.7 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw} events` } } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
            console.log("✅ Events chart initialized");
        }
        
        // 4. EVENT TYPES CHART (Pie Chart)
        const eventTypesCanvas = document.getElementById('eventTypesChart');
        if (eventTypesCanvas && window.event_type_labels && window.event_type_labels.length > 0) {
            const ctx = eventTypesCanvas.getContext('2d');
            if (eventTypesChart) eventTypesChart.destroy();
            eventTypesChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: window.event_type_labels,
                    datasets: [{ data: window.event_type_counts, backgroundColor: pieColors.slice(0, window.event_type_labels.length), borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} events` } } } }
            });
            console.log("✅ Event types chart initialized");
        }
        
        isChartsInitialized = true;
    };

    /* ==================================================
       LIVE NOTIFICATIONS, MESSAGES, EVENTS
    ================================================== */

    async function loadNotifications() {
        try {
            const response = await fetch("/admin/live-notifications/");
            const data = await response.json();
            const container = document.getElementById("notifications-list");
            const count = document.getElementById("notification-count");
            if (!container || !count) return;
            count.innerText = data.notifications.length;
            container.innerHTML = data.notifications.length === 0 ? '<div class="notification-item"><div class="notify-content"><p>No new notifications</p></div></div>' : '';
            data.notifications.forEach(item => {
                container.innerHTML += `<div class="notification-item" onclick="loadPage('orders')" style="cursor:pointer;"><div class="notify-icon">📦</div><div class="notify-content"><h5>${item.customer}</h5><p>Rs ${item.total}</p><span>${item.time}</span></div></div>`;
            });
        } catch (error) { console.error("Notification Error:", error); }
    }

    async function loadMessages() {
        try {
            const response = await fetch("/admin/live-messages/");
            const data = await response.json();
            const container = document.getElementById("messages-list");
            const count = document.getElementById("message-count");
            if (!container || !count) return;
            count.innerText = data.messages.length;
            container.innerHTML = data.messages.length === 0 ? '<div class="message-item"><div class="message-content"><p>No new messages</p></div></div>' : '';
            data.messages.forEach(msg => {
                container.innerHTML += `<div class="message-item" onclick="loadPage('messages')" style="cursor:pointer;"><div class="message-avatar">${msg.name.charAt(0)}</div><div class="message-content"><h5>${msg.name}</h5><p>${msg.message}</p><span>${msg.time}</span></div></div>`;
            });
        } catch (error) { console.error("Message Error:", error); }
    }

    async function loadDashboardEvents() {
        try {
            const response = await fetch("/admin/live-events/");
            const data = await response.json();
            const eventsGrid = document.getElementById("eventsGrid");
            if (!eventsGrid) return;
            let html = data.events.length === 0 ? '<div class="event-mini-card pink-card"><div class="event-emoji">📅</div><h4>No Events</h4><p>Upcoming events will appear here</p><div class="event-date-badge">--</div></div>' : '';
            data.events.forEach(event => {
                html += `<div class="event-mini-card pink-card" onclick="loadPage('events')" style="cursor:pointer;"><div class="event-emoji">🎉</div><h4>${event.event_type || 'Event'}</h4><p>${event.customer || 'Customer'}</p><p class="event-phone">📞 ${event.phone || 'N/A'}</p><p class="event-total">💰 Rs ${event.total || '0'}</p><p class="event-guests">👥 ${event.guests || '0'} Guests</p><p class="event-status">🏷️ ${event.status || 'Confirmed'}</p><div class="event-date-badge">${event.time || '--:--'}</div></div>`;
            });
            eventsGrid.innerHTML = html;
        } catch(error) { console.log("Events Error", error); }
    }

    /* ==================================================
       CLEAN LIVE SYSTEM INIT
    ================================================== */

    const initLiveSystem = () => {
        if (liveInterval) clearInterval(liveInterval);
        fetchLiveData();
        liveInterval = setInterval(fetchLiveData, 5000);
        console.log("✅ Live system initialized");
    };

    /* ==================================================
       SEARCH FUNCTIONALITY
    ================================================== */

    const initSearch = () => {
        const searchInput = document.querySelector(".search-box input");
        if (searchInput) {
            searchInput.addEventListener("input", function(e) {
                const searchTerm = e.target.value.toLowerCase();
                const orderRows = document.querySelectorAll("#recentOrdersTable tbody tr");
                let visibleCount = 0;
                orderRows.forEach(row => {
                    const text = row.innerText.toLowerCase();
                    const isVisible = text.includes(searchTerm);
                    row.style.display = isVisible ? "" : "none";
                    if (isVisible) visibleCount++;
                });
                const noResultsRow = document.querySelector("#noSearchResults");
                if (visibleCount === 0 && orderRows.length > 0) {
                    if (!noResultsRow) {
                        const tbody = document.querySelector("#recentOrdersTable tbody");
                        const emptyRow = document.createElement("tr");
                        emptyRow.id = "noSearchResults";
                        emptyRow.innerHTML = '<td colspan="4" class="text-center text-muted">No orders found matching your search<\/td>';
                        tbody.appendChild(emptyRow);
                    }
                } else if (noResultsRow) noResultsRow.remove();
            });
        }
    };

    /* ==================================================
       NOTIFICATION CLICK HANDLERS
    ================================================== */

    const initNotificationHandlers = () => {
        const notificationBell = document.getElementById("notificationBell");
        const messageBell = document.getElementById("messageBell");
        if (notificationBell) notificationBell.addEventListener("click", () => loadPage('orders'));
        if (messageBell) messageBell.addEventListener("click", () => loadPage('messages'));
    };

    /* ==================================================
       ORDERS GLOBALS
    ================================================== */

    window.updateOrderStatus = function(select, orderId, phone) {
        let status = select.value;
        let statusText = select.options[select.selectedIndex].text;
        select.disabled = true;
        select.style.opacity = '0.6';
        window.showToastNotification("Updating order status...", "info");
        
        fetch(`/admin/update-order-status/${orderId}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": window.getCookie('csrftoken') },
            body: JSON.stringify({status: status})
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === "ok") {
                window.showToastNotification(`✅ Order #${orderId} updated to ${statusText}!`, "success");
                if (data.whatsapp_link) window.open(data.whatsapp_link, "_blank");
                select.disabled = false;
                select.style.opacity = '1';
                select.value = status;
            } else {
                window.showToastNotification("❌ Error: " + (data.error || "Unknown error"), "error");
                select.disabled = false;
                select.style.opacity = '1';
            }
        })
        .catch(error => {
            window.showToastNotification("❌ Network error!", "error");
            select.disabled = false;
            select.style.opacity = '1';
        });
    };

    window.viewOrder = function(orderId) {
        fetch(`/api/order/${orderId}/`)
        .then(response => response.json())
        .then(data => {
            let html = `<h3>📦 Order #${data.id}</h3><hr><p><b>Customer:</b> ${data.name}</p><p><b>Phone:</b> ${data.phone}</p><p><b>Total:</b> Rs ${data.total}</p><p><b>Status:</b> ${data.status}</p><p><b>Date:</b> ${data.created_at || new Date().toLocaleDateString()}</p>`;
            let modal = document.getElementById("orderModal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "orderModal";
                modal.style.display = "none";
                modal.style.position = "fixed";
                modal.style.top = "0";
                modal.style.left = "0";
                modal.style.width = "100%";
                modal.style.height = "100%";
                modal.style.backgroundColor = "rgba(0,0,0,0.5)";
                modal.style.zIndex = "9999";
                modal.innerHTML = `<div style="background:white; width:500px; margin:100px auto; border-radius:10px; padding:20px;"><span onclick="window.closeModal()" style="float:right; cursor:pointer; font-size:20px;">&times;</span><div id="orderDetails"></div></div>`;
                document.body.appendChild(modal);
            }
            document.getElementById("orderDetails").innerHTML = html;
            modal.style.display = "block";
        })
        .catch(error => window.showToastNotification("Error loading order details", "error"));
    };

    window.closeModal = function() {
        const modal = document.getElementById("orderModal");
        if (modal) modal.style.display = "none";
    };

    /* ==================================================
       HELPERS GLOBALS
    ================================================== */

    window.getCookie = function(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                cookie = cookie.trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    };

    window.escapeHtml = function(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    };

    /* ==================================================
       PRODUCTS GLOBALS (FIXED: No duplicate modal)
    ================================================== */

    window.loadProducts = function() {
        fetch('/api/products/')
            .then(response => response.json())
            .then(products => {
                const tbody = document.getElementById('productsTableBody');
                if (!tbody) return;
                if (products.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No products found. Click "Add New Product" to create one.<\/td><\/tr>';
                    return;
                }
                let html = '';
                products.forEach(product => {
                    html += `<tr><td>${product.id}<\/td><td>${product.image ? `<img src="${product.image}" width="50" height="50" style="object-fit:cover; border-radius:8px;">` : '📷'}<\/td><td><strong>${window.escapeHtml(product.name)}<\/strong><\/td><td>${window.escapeHtml(product.category || 'No Category')}<\/td><td>Rs ${product.price}<\/td><td><span class="status-badge ${product.is_active ? 'active' : 'inactive'}">${product.is_active ? 'Active' : 'Inactive'}<\/span><\/td><td><button class="btn-edit-product" onclick="window.editProduct(${product.id})"><i class="fa-solid fa-edit"></i> Edit<\/button> <button class="btn-delete-product" onclick="window.deleteProduct(${product.id})"><i class="fa-solid fa-trash"></i> Delete<\/button><\/td><\/tr>`;
                });
                tbody.innerHTML = html;
                window.updateBadgeColors();
            })
            .catch(error => console.error("Error loading products:", error));
    };

    window.showAddProductModal = function() {
        editingProductId = null;
        
        // Get existing modal from HTML (no dynamic creation)
        let modal = document.getElementById("productModal");
        if (!modal) {
            console.error("Product modal not found in DOM. Please ensure the modal HTML exists.");
            return;
        }
        
        document.getElementById("productModalTitle").innerText = "Add New Product";
        document.getElementById("productName").value = "";
        document.getElementById("productPrice").value = "";
        document.getElementById("productImage").value = "";
        document.getElementById("productStatus").value = "true";
        
        fetch('/api/categories/')
            .then(r => r.json())
            .then(cats => {
                const catSelect = document.getElementById("productCategory");
                if (catSelect) {
                    catSelect.innerHTML = '<option value="">Select Category</option>';
                    cats.forEach(c => {
                        catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
                    });
                }
            });
        
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    };

    window.editProduct = async function(id) {
        try {
            const products = await fetch('/api/products/').then(r=>r.json());
            const product = products.find(p => p.id == id);
            if (!product) { window.showToastNotification("Product not found", "error"); return; }
            editingProductId = product.id;
            window.showAddProductModal();
            document.getElementById("productModalTitle").innerText = "Edit Product";
            document.getElementById("productName").value = product.name;
            document.getElementById("productPrice").value = product.price;
            document.getElementById("productStatus").value = product.is_active ? "true" : "false";
            const cats = await fetch('/api/categories/').then(r=>r.json());
            const catSelect = document.getElementById("productCategory");
            if(catSelect){
                catSelect.innerHTML = '<option value="">Select Category</option>';
                cats.forEach(c=>{ catSelect.innerHTML += `<option value="${c.id}" ${product.category_id == c.id ? 'selected' : ''}>${c.name}</option>`; });
            }
        } catch(error) { window.showToastNotification("Error loading product", "error"); }
    };

    window.saveProduct = async function() {
        const name = document.getElementById("productName")?.value;
        const price = document.getElementById("productPrice")?.value;
        const category = document.getElementById("productCategory")?.value;
        const status = document.getElementById("productStatus")?.value;
        const image = document.getElementById("productImage")?.files[0];
        if (!name || !price) { window.showToastNotification("Please fill product name and price", "error"); return; }
        const formData = new FormData();
        formData.append("name", name); formData.append("price", price); formData.append("category", category); formData.append("is_active", status);
        if (image) formData.append("image", image);
        let url = "/api/products/add/";
        if (editingProductId) url = `/api/products/update/${editingProductId}/`;
        try {
            const response = await fetch(url, { method: "POST", headers: { "X-CSRFToken": window.getCookie('csrftoken') }, body: formData });
            const result = await response.json();
            if (result.status === "ok") {
                window.showToastNotification("✅ Product saved successfully!", "success");
                window.closeProductModal();
                window.loadProducts();
                // Ensure table stays at top after reload
                setTimeout(function() {
                    const wrapper = document.querySelector('.table-wrapper');
                    if (wrapper) {
                        wrapper.style.marginTop = '0px';
                        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 150);
            } else { window.showToastNotification("❌ Error: " + (result.error || "Unknown error"), "error"); }
        } catch(error) { window.showToastNotification("❌ Network error!", "error"); }
    };

    window.deleteProduct = async function(id) {
        if (!confirm("Are you sure you want to delete this product?")) return;
        try {
            const response = await fetch(`/api/products/delete/${id}/`, { method: "DELETE", headers: { "X-CSRFToken": window.getCookie('csrftoken') } });
            const result = await response.json();
            if (result.status === "ok") {
                window.showToastNotification("🗑 Product deleted successfully!", "success");
                window.loadProducts();
            } else { window.showToastNotification("Error deleting product", "error"); }
        } catch(error) { window.showToastNotification("❌ Network error!", "error"); }
    };

    window.closeProductModal = function() {
        const modal = document.getElementById("productModal");
        if (modal) { 
            modal.style.display = "none"; 
            document.body.style.overflow = "";
            // Force table position reset
            setTimeout(function() {
                const wrapper = document.querySelector('.table-wrapper');
                if (wrapper) {
                    wrapper.style.marginTop = '0px';
                }
            }, 50);
        }
    };

    /* ==================================================
       PAGE LOADER GLOBAL
    ================================================== */

    window.loadPage = function(pageName, event) {
        if (event) event.preventDefault();
        let cleanPageName = pageName;
        let queryString = "";
        if (pageName.includes("?")) { cleanPageName = pageName.split("?")[0]; queryString = "?" + pageName.split("?")[1]; }
        
        document.querySelectorAll('.sidebar-links a').forEach(link => link.classList.remove('active-link'));
        if (event && event.currentTarget) event.currentTarget.classList.add('active-link');
        
        let pageTitle = cleanPageName.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        const titleElement = document.querySelector('.topbar-left h2');
        if (titleElement) titleElement.textContent = pageTitle;
        if (cleanPageName === 'dashboard-home') { window.location.reload(); return; }
        
        let contentArea = document.getElementById('content-area');
        if (!contentArea) {
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                const existingContent = mainContent.innerHTML;
                contentArea = document.createElement('div');
                contentArea.id = 'content-area';
                contentArea.innerHTML = existingContent;
                mainContent.innerHTML = '';
                mainContent.appendChild(contentArea);
            }
        }
        if (contentArea) { contentArea.innerHTML = `<div class="text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-3">Loading ${pageTitle}...</p></div>`; }
        
        let fetchUrl = '';
        switch(cleanPageName) {
            case 'orders': fetchUrl = '/admin/orders/'; break;
            case 'products': fetchUrl = '/admin/products/'; break;
            case 'deals': fetchUrl = '/admin/deals/'; break;
            case 'events': fetchUrl = '/admin/events/'; break;
            case 'messages': fetchUrl = '/admin/messages/'; break;
            case 'gallery': fetchUrl = '/admin/gallery/'; break;
            case 'announcements': fetchUrl = '/admin/announcements/'; break;
            case 'categories': fetchUrl = '/admin/categories/'; break;
            case 'reports': fetchUrl = '/admin/reports/' + queryString; break;
            case 'reviews': fetchUrl = '/admin/reviews/'; break;
            case 'customers': fetchUrl = '/admin/customers/'; break;
            case 'whatsapp-orders': fetchUrl = '/admin/whatsapp-orders/'; break;
            case 'settings': fetchUrl = '/admin/settings/'; break;
        }
        
        if (fetchUrl) {
            fetch(fetchUrl)
                .then(response => response.text())
                .then(html => {
                    if (contentArea) contentArea.innerHTML = html;
                    window.updateBadgeColors();
                    if (cleanPageName === 'categories') setTimeout(() => { if (typeof window.loadCategories === 'function') window.loadCategories(); }, 300);
                    if (cleanPageName === 'products') setTimeout(() => { if (typeof window.loadProducts === 'function') window.loadProducts(); }, 300);
                    if (cleanPageName === 'deals') setTimeout(() => { if (typeof window.loadDeals === 'function') window.loadDeals(); }, 300);
                    if (cleanPageName === 'events') setTimeout(() => { if (typeof window.loadEvents === 'function') window.loadEvents(); }, 300);
                    if (cleanPageName === 'reports') setTimeout(() => { if (typeof window.initReportsCharts === 'function') window.initReportsCharts(); }, 400);
                    if (cleanPageName === 'settings') {
                        const settingsForm = document.getElementById("settingsForm");
                        if (settingsForm) {
                            settingsForm.addEventListener("submit", async function(e) {
                                e.preventDefault();
                                const formData = new FormData(settingsForm);
                                try {
                                    const response = await fetch("/admin/settings/save/", { method: "POST", headers: { "X-CSRFToken": window.getCookie("csrftoken") }, body: formData });
                                    const result = await response.json();
                                    if (result.status === "ok") window.showToastNotification("✅ Settings saved!", "success");
                                    else window.showToastNotification("❌ Error saving settings", "error");
                                } catch(error) { window.showToastNotification("❌ Network error!", "error"); }
                            });
                        }
                    }
                })
                .catch(error => { if (contentArea) contentArea.innerHTML = `<div class="dashboard-table"><div class="table-header"><h3>Error Loading ${pageTitle}</h3></div><div class="text-center py-5 text-danger"><i class="fa-solid fa-circle-exclamation fa-3x mb-3"></i><h4>Failed to load content</h4><button class="btn btn-primary mt-3" onclick="location.reload()">Refresh Page</button></div></div>`; });
        }
    };

    /* ==================================================
       🔥 MAIN INITIALIZATION
    ================================================== */

    const init = () => {
        console.log("🚀 IK Delights Dashboard Initializing...");
        initializeCounters();
        window.updateBadgeColors();
        initSearch();
        initNotificationHandlers();
        setTimeout(() => { initCharts(); }, 1000);
        initLiveSystem();
        loadNotifications(); loadMessages(); loadDashboardEvents();
        setInterval(() => { loadNotifications(); loadMessages(); loadDashboardEvents(); }, 5000);
        setTimeout(addWhatsAppButtons, 1000);
        console.log("✅ IK Delights Dashboard Ready!");
    };

    init();

    window.addEventListener("beforeunload", () => { if (liveInterval) clearInterval(liveInterval); });

});