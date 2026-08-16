document.addEventListener(
    "DOMContentLoaded",
    function(){
        loadEvents();
    }
);

/* ======================================================
   CSRF TOKEN HELPER (required for Django POST/PUT/DELETE)
====================================================== */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/* ======================================================
   GLOBAL EVENTS STORAGE
====================================================== */
window.allEvents = [];

/* ======================================================
   HELPER: GENERATE UNIQUE ID (ORDER & PAYMENT)
====================================================== */
function generateOrderId() {
    const lastOrder = window.allEvents.reduce((max, e) => {
        const match = (e.order_id || 'ORD-0').match(/ORD-(\d+)/);
        const num = match ? parseInt(match[1]) : 0;
        return num > max ? num : max;
    }, 0);
    return `ORD-${lastOrder + 1}`;
}

function generatePaymentId() {
    const lastPay = window.allEvents.reduce((max, e) => {
        const match = (e.payment_id || 'PAY-0').match(/PAY-(\d+)/);
        const num = match ? parseInt(match[1]) : 0;
        return num > max ? num : max;
    }, 0);
    return `PAY-${lastPay + 1}`;
}

/* ======================================================
   LOAD EVENTS (GET)
====================================================== */
async function loadEvents(){
    try{
        const response = await fetch("/api/events-management/");
        const events = await response.json();
        console.log(events);
        window.allEvents = events;
        const tableBody = document.getElementById("eventsTableBody");
        tableBody.innerHTML = "";

        if(events.length === 0){
            tableBody.innerHTML = `
                <tr>
                    <td colspan="15" style="text-align:center; padding:50px; color:#94a3b8; font-weight:700;">
                        No Event Bookings Found
                    </td>
                </tr>
            `;
            return;
        }

        events.forEach(event => {
            // Ensure payment_status uses correct values
            let paymentStatus = event.payment_status || "Pending";
            if (paymentStatus === "Partial") paymentStatus = "Partial Paid";
            if (paymentStatus === "Paid") paymentStatus = "Fully Paid";
            
            let orderStatus = event.status || "Pending";
            
            tableBody.innerHTML += `
                <tr id="event-row-${event.id}">
                    <td>#${event.id}</td>
                    <td>${event.order_id || "-"}</td>
                    <td>${event.payment_id || "-"}</td>
                    <td>${event.customer_name || "-"}</td>
                    <td>${event.phone || "-"}</td>
                    <td>${event.event_type || "-"}</td>
                    <td>${event.guests || 0}</td>
                    <td>${formatPackage(event.selected_deal)}</td>
                    <td>PKR ${event.total_price || 0}</td>
                    <td>PKR ${event.advance_payment || 0}</td>
                    <td>PKR ${event.remaining_amount || 0}</td>
                    <td>
                        <select class="payment-dropdown ${paymentStatus.toLowerCase().replace(' ', '-')}"
                                onchange="updatePaymentStatus(${event.id}, this.value, '${event.phone}')">
                            <option value="Pending" ${paymentStatus === "Pending" ? "selected" : ""}>Pending</option>
                            <option value="Partial Paid" ${paymentStatus === "Partial Paid" ? "selected" : ""}>Partial Paid</option>
                            <option value="Fully Paid" ${paymentStatus === "Fully Paid" ? "selected" : ""}>Fully Paid</option>
                        </select>
                    </td>
                    <td>
                        <select class="status-dropdown ${orderStatus.toLowerCase()}"
                                onchange="updateEventStatus(${event.id}, this.value, '${event.phone}')">
                            <option value="Pending" ${orderStatus === "Pending" ? "selected" : ""}>Pending</option>
                            <option value="Confirmed" ${orderStatus === "Confirmed" ? "selected" : ""}>Confirmed</option>
                            <option value="Preparing" ${orderStatus === "Preparing" ? "selected" : ""}>Preparing</option>
                            <option value="Processing" ${orderStatus === "Processing" ? "selected" : ""}>Processing</option>
                            <option value="Delivered" ${orderStatus === "Delivered" ? "selected" : ""}>Delivered</option>
                            <option value="Cancelled" ${orderStatus === "Cancelled" ? "selected" : ""}>Cancelled</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn-invoice" onclick="viewInvoice(${event.id})">
                            <i class="fa-solid fa-file-invoice"></i>
                        </button>
                    </td>
                    <td>${formatDate(event.created_at)}</td>
                    <td>
                        <div class="actions-wrap">
                            <button class="btn-whatsapp" onclick="openWhatsApp('${event.phone}')">
                                <i class="fa-brands fa-whatsapp"></i>
                            </button>
                            <button class="btn-delete" onclick="deleteEvent(${event.id})">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    catch(error){
        console.log("Events Error:", error);
    }
}

/* ======================================================
   GET EVENT BY ID
====================================================== */
function getEventById(id){
    return window.allEvents.find(event => event.id === id);
}

/* ======================================================
   FORMAT PACKAGE (for display in table)
====================================================== */
function formatPackage(packageData){
    if(!packageData){
        return `<div class="package-card"><div class="package-name">Custom Package</div></div>`;
    }
    if(typeof packageData === "string"){
        try{
            packageData = JSON.parse(packageData);
        } catch{
            return `<div class="package-card"><div class="package-name">${packageData}</div></div>`;
        }
    }
    if(typeof packageData === "object"){
        return `
            <div class="package-card">
                <div class="package-name">${packageData.name || "Custom Package"}</div>
                <div class="package-price">PKR ${packageData.total_selling || 0}</div>
            </div>
        `;
    }
    return `<div class="package-card"><div class="package-name">Custom Package</div></div>`;
}

/* ======================================================
   FORMAT DATE
====================================================== */
function formatDate(dateString){
    if(!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB");
}

/* ======================================================
   OPEN WHATSAPP
====================================================== */
function openWhatsApp(phone){
    if(!phone) return;
    window.open(`https://wa.me/${phone}`, "_blank");
}

/* ======================================================
   UPDATE EVENT STATUS (with CSRF & DEBUG LOGS)
====================================================== */
async function updateEventStatus(eventId, status, phone){
    console.log("🔥 updateEventStatus CALLED → eventId:", eventId, "status:", status);

    const csrfToken = getCookie("csrftoken");
    console.log("🔐 CSRF Token found:", csrfToken ? "✅ Yes" : "❌ No");

    try{
        const response = await fetch(`/api/update-event-status/${eventId}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken
            },
            body: JSON.stringify({ status: status })
        });

        console.log("📡 Response status:", response.status);

        if (!response.ok) {
            console.error("❌ HTTP error:", response.status, response.statusText);
            alert(`Error ${response.status}: ${response.statusText}\nCheck console for details.`);
            return;
        }

        const data = await response.json();
        console.log("✅ Response data:", data);

        if (data.whatsapp_link) {
            window.open(data.whatsapp_link, "_blank");
        }

        // Refresh table after update
        loadEvents();
    }
    catch(error){
        console.error("🚨 Status Update Error:", error);
        alert("Network error – see console for details.");
    }
}

/* ======================================================
   UPDATE PAYMENT STATUS (with CSRF & DEBUG LOGS)
====================================================== */
async function updatePaymentStatus(eventId, paymentStatus, phone){
    console.log("💰 updatePaymentStatus CALLED → eventId:", eventId, "paymentStatus:", paymentStatus);

    const csrfToken = getCookie("csrftoken");
    console.log("🔐 CSRF Token found:", csrfToken ? "✅ Yes" : "❌ No");

    try{
        const response = await fetch(`/api/update-event-status/${eventId}/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken
            },
            body: JSON.stringify({ payment_status: paymentStatus })
        });

        console.log("📡 Response status:", response.status);

        if (!response.ok) {
            console.error("❌ HTTP error:", response.status, response.statusText);
            alert(`Error ${response.status}: ${response.statusText}\nCheck console for details.`);
            return;
        }

        const data = await response.json();
        console.log("✅ Response data:", data);

        if (data.whatsapp_link) {
            window.open(data.whatsapp_link, "_blank");
        }

        loadEvents();
    }
    catch(error){
        console.error("🚨 Payment Update Error:", error);
        alert("Network error – see console for details.");
    }
}

/* ======================================================
   DELETE EVENT (with CSRF)
====================================================== */
async function deleteEvent(eventId){
    const confirmDelete = confirm("Delete this event booking?");
    if(!confirmDelete) return;
    try{
        const response = await fetch(`/api/delete-event/${eventId}/`, {
            method:"DELETE",
            headers:{
                "X-CSRFToken": getCookie("csrftoken")
            }
        });
        const data = await response.json();
        console.log(data);
        document.getElementById(`event-row-${eventId}`).remove();
        window.allEvents = window.allEvents.filter(e => e.id !== eventId);
    }
    catch(error){
        console.log("Delete Error:", error);
    }
}

/* ======================================================
   VIEW INVOICE (popup)
====================================================== */
window.viewInvoice = function(eventId){
    const event = getEventById(eventId);
    if(!event) return;
    let packageHTML = "";
    let deal = event.selected_deal;
    if(typeof deal === "string"){
        try{ deal = JSON.parse(deal); } catch{}
    }
    if(deal && deal.items){
        deal.items.forEach(item => {
            packageHTML += `
                <tr>
                    <td>${item.product}</td>
                    <td>${item.quantity}</td>
                    <td>PKR ${item.customer_price}</td>
                </tr>
            `;
        });
    }
    const invoiceWindow = window.open("", "_blank", "width=900,height=700");
    invoiceWindow.document.write(`
        <html>
        <head>
            <title>IK Delights Invoice</title>
            <style>
                body{ font-family:Arial; padding:40px; color:#1e293b; }
                h1{ color:#ec4899; }
                table{ width:100%; border-collapse:collapse; margin-top:20px; }
                table th, table td{ border:1px solid #ddd; padding:12px; text-align:left; }
                table th{ background:#f8fafc; }
                .top{ display:flex; justify-content:space-between; margin-bottom:30px; }
                .badge{ padding:8px 14px; border-radius:30px; background:#fce7f3; color:#be185d; font-weight:700; display:inline-block; }
                .total{ margin-top:30px; font-size:26px; color:#ec4899; font-weight:800; }
            </style>
        </head>
        <body>
            <div class="top">
                <div><h1>IK Delights</h1><p>Premium Bakery Invoice</p></div>
                <div><strong>Event ID:</strong> #${event.id}<br>
                <strong>Order ID:</strong> ${event.order_id || '-'}<br>
                <strong>Payment ID:</strong> ${event.payment_id || '-'}</div>
            </div>
            <hr>
            <h2>Customer Details</h2>
            <p><strong>Name:</strong> ${event.customer_name}</p>
            <p><strong>Phone:</strong> ${event.phone}</p>
            <p><strong>Event:</strong> ${event.event_type}</p>
            <p><strong>Guests:</strong> ${event.guests}</p>
            <p><strong>Budget:</strong> PKR ${event.budget}</p>
            <p><strong>Total:</strong> PKR ${event.total_price}</p>
            <p><strong>Advance Paid:</strong> PKR ${event.advance_payment || 0}</p>
            <p><strong>Remaining:</strong> PKR ${event.remaining_amount || 0}</p>
            <p><strong>Payment Method:</strong> ${event.payment_method || 'Cash'}</p>
            <p><strong>Status:</strong> <span class="badge">${event.status}</span></p>
            <hr>
            <h2>Selected Package</h2>
            <table>
                <thead><tr><th>Product</th><th>Quantity</th><th>Price</th></tr></thead>
                <tbody>${packageHTML}</tbody>
            </table>
            <div class="total">Total: PKR ${event.total_price}</div>
        </body>
        </html>
    `);
};

/* ======================================================
   SAVE EVENT (CREATE / UPDATE) with CSRF and auto IDs
====================================================== */
window.saveEvent = async function(){
    const id = document.getElementById("eventId")?.value; // if editing, hidden field exists
    const customer_name = document.getElementById("eventName").value.trim();
    const phone = document.getElementById("eventPhone").value.trim();
    const event_type = document.getElementById("eventCategory").value.trim();
    const guests = parseInt(document.getElementById("eventGuests").value) || 0;
    const budget = parseFloat(document.getElementById("eventBudget").value) || 0;
    const total_price = parseFloat(document.getElementById("eventTotal").value) || 0;
    const advance_payment = parseFloat(document.getElementById("eventAdvance").value) || 0;
    const package_name = document.getElementById("eventPackage").value;
    const event_date = document.getElementById("eventDate").value;
    let payment_status = document.getElementById("eventPaymentStatus").value;
    const payment_method = document.getElementById("eventPaymentMethod").value;
    let order_status = document.getElementById("eventStatus").value;
    const address = document.getElementById("eventLocation").value;
    const invoice_text = document.getElementById("eventInvoice").value;

    if(!customer_name || !phone){
        alert("Customer name and phone are required");
        return;
    }
    if(!/^03\d{9}$/.test(phone)){
        alert("Enter valid Pakistani phone number (03XXXXXXXXX)");
        return;
    }

    const remaining_amount = total_price - advance_payment;

    // Auto‑adjust payment status based on advance
    let finalPaymentStatus = payment_status;
    let finalOrderStatus = order_status;
    if(advance_payment >= total_price){
        finalPaymentStatus = "Fully Paid";
        finalOrderStatus = "Delivered";
    } else if(advance_payment >= total_price * 0.5){
        if(finalPaymentStatus !== "Fully Paid") finalPaymentStatus = "Partial Paid";
        if(finalOrderStatus === "Pending") finalOrderStatus = "Confirmed";
    }

    // Generate IDs only for new events
    let order_id = document.getElementById("eventOrderId").value;
    let payment_id = document.getElementById("eventPaymentId").value;
    if(!id && (!order_id || !payment_id)){
        order_id = generateOrderId();
        payment_id = generatePaymentId();
    }

    const payload = {
        customer_name, phone, event_type, guests, budget, total_price,
        advance_payment, remaining_amount,
        selected_package: package_name,
        event_date, payment_status: finalPaymentStatus,
        payment_method, status: finalOrderStatus,
        address, notes: invoice_text,
        order_id, payment_id
    };
    if(id) payload.id = id;

    try{
        const url = id ? `/api/update-event/${id}/` : "/api/create-event/";
        const method = id ? "PUT" : "POST";
        const response = await fetch(url, {
            method: method,
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": getCookie("csrftoken")
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log(data);
        if(data.success || data.id){
            alert("Event saved successfully");
            closeEventModal();
            loadEvents(); // refresh table
        } else {
            alert("Error saving event: " + (data.error || "Unknown"));
        }
    } catch(error){
        console.error("Save error:", error);
        alert("Server error");
    }
};

/* ======================================================
   OPEN MODAL (reset form for new event)
====================================================== */
window.showAddEventModal = function(){
    // Clear all fields
    document.getElementById("eventName").value = "";
    document.getElementById("eventPhone").value = "";
    document.getElementById("eventCategory").value = "";
    document.getElementById("eventGuests").value = "";
    document.getElementById("eventBudget").value = "";
    document.getElementById("eventTotal").value = "";
    document.getElementById("eventAdvance").value = "";
    document.getElementById("eventRemaining").value = "";
    document.getElementById("eventPackage").value = "";
    document.getElementById("eventDate").value = "";
    document.getElementById("eventPaymentStatus").value = "Pending";
    document.getElementById("eventPaymentMethod").value = "Cash";
    document.getElementById("eventStatus").value = "Pending";
    document.getElementById("eventLocation").value = "";
    document.getElementById("eventInvoice").value = "";
    document.getElementById("eventOrderId").value = "";
    document.getElementById("eventPaymentId").value = "";
    // Remove hidden id if present
    if(document.getElementById("eventId")) document.getElementById("eventId").remove();
    document.getElementById("eventModal").style.display = "flex";
    
    // Auto-calculate remaining amount
    const totalInput = document.getElementById("eventTotal");
    const advanceInput = document.getElementById("eventAdvance");
    const remainingField = document.getElementById("eventRemaining");
    const updateRemaining = () => {
        const total = parseFloat(totalInput.value) || 0;
        const advance = parseFloat(advanceInput.value) || 0;
        remainingField.value = (total - advance).toFixed(2);
    };
    totalInput.oninput = updateRemaining;
    advanceInput.oninput = updateRemaining;
};

/* ======================================================
   CLOSE MODAL
====================================================== */
window.closeEventModal = function(){
    document.getElementById("eventModal").style.display = "none";
};

/* ======================================================
   EDIT EVENT - populate modal with existing data
====================================================== */
window.editEvent = function(eventId){
    const event = getEventById(eventId);
    if(!event) return;
    document.getElementById("eventName").value = event.customer_name || "";
    document.getElementById("eventPhone").value = event.phone || "";
    document.getElementById("eventCategory").value = event.event_type || "";
    document.getElementById("eventGuests").value = event.guests || 0;
    document.getElementById("eventBudget").value = event.budget || 0;
    document.getElementById("eventTotal").value = event.total_price || 0;
    document.getElementById("eventAdvance").value = event.advance_payment || 0;
    document.getElementById("eventRemaining").value = (event.total_price - (event.advance_payment || 0)).toFixed(2);
    document.getElementById("eventPackage").value = (typeof event.selected_deal === "object" ? event.selected_deal.name : event.selected_deal) || "";
    document.getElementById("eventDate").value = event.event_date || "";
    let payStatus = event.payment_status || "Pending";
    if(payStatus === "Partial") payStatus = "Partial Paid";
    if(payStatus === "Paid") payStatus = "Fully Paid";
    document.getElementById("eventPaymentStatus").value = payStatus;
    document.getElementById("eventPaymentMethod").value = event.payment_method || "Cash";
    document.getElementById("eventStatus").value = event.status || "Pending";
    document.getElementById("eventLocation").value = event.address || "";
    document.getElementById("eventInvoice").value = event.notes || "";
    document.getElementById("eventOrderId").value = event.order_id || "";
    document.getElementById("eventPaymentId").value = event.payment_id || "";
    
    // Add hidden id field
    let hiddenId = document.getElementById("eventId");
    if(!hiddenId){
        hiddenId = document.createElement("input");
        hiddenId.type = "hidden";
        hiddenId.id = "eventId";
        document.querySelector(".event-form-grid").appendChild(hiddenId);
    }
    hiddenId.value = event.id;
    document.getElementById("eventModal").style.display = "flex";
    
    // Attach remaining calculation listeners
    const totalInput = document.getElementById("eventTotal");
    const advanceInput = document.getElementById("eventAdvance");
    const remainingField = document.getElementById("eventRemaining");
    const updateRemaining = () => {
        const total = parseFloat(totalInput.value) || 0;
        const advance = parseFloat(advanceInput.value) || 0;
        remainingField.value = (total - advance).toFixed(2);
    };
    totalInput.oninput = updateRemaining;
    advanceInput.oninput = updateRemaining;
};