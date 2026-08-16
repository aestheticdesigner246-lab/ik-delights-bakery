// ================= EVENTS PAGE JS - FINAL (NO ALERTS, DIRECT WHATSAPP) =================

document.addEventListener("DOMContentLoaded", function(){
    loadEvents();
});

window.allEvents = [];

function generateOrderId() {
    const lastOrder = window.allEvents.reduce((max, e) => {
        const num = parseInt((e.order_id || 'ORD-0').split('-')[1]);
        return num > max ? num : max;
    }, 0);
    return `ORD-${lastOrder + 1}`;
}

function generatePaymentId() {
    const lastPay = window.allEvents.reduce((max, e) => {
        const num = parseInt((e.payment_id || 'PAY-0').split('-')[1]);
        return num > max ? num : max;
    }, 0);
    return `PAY-${lastPay + 1}`;
}

async function loadEvents(){
    try{
        const response = await fetch("/api/events-management/");
        const events = await response.json();
        window.allEvents = events;
        const tableBody = document.getElementById("eventsTableBody");
        tableBody.innerHTML = "";

        if(events.length === 0){
            tableBody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding:50px;">No Event Bookings Found<\/td><\/tr>`;
            return;
        }

        events.forEach(event => {
            let paymentStatus = event.payment_status || "Pending";
            if (paymentStatus === "Partial") paymentStatus = "Partial Paid";
            if (paymentStatus === "Paid") paymentStatus = "Fully Paid";
            let orderStatus = event.status || "Pending";
            
            tableBody.innerHTML += `
                <tr id="event-row-${event.id}">
                    <td>#${event.id}<\/td>
                    <td>${event.order_id || "-"}<\/td>
                    <td>${event.payment_id || "-"}<\/td>
                    <td>${event.customer_name || "-"}<\/td>
                    <td>${event.phone || "-"}<\/td>
                    <td>${event.event_type || "-"}<\/td>
                    <td>${event.guests || 0}<\/td>
                    <td>${formatPackage(event.selected_deal)}<\/td>
                    <td>PKR ${event.total_price || 0}<\/td>
                    <td>PKR ${event.advance_payment || 0}<\/td>
                    <td>PKR ${event.remaining_amount || 0}<\/td>
                    <td>
                        <select class="payment-dropdown" onchange="updateEventPaymentStatus(${event.id}, this.value)">
                            <option ${paymentStatus === "Pending" ? "selected" : ""}>Pending</option>
                            <option ${paymentStatus === "Partial Paid" ? "selected" : ""}>Partial Paid</option>
                            <option ${paymentStatus === "Fully Paid" ? "selected" : ""}>Fully Paid</option>
                        </select>
                     <\/td>
                    <td>
                        <select class="status-dropdown" onchange="updateEventStatus(${event.id}, this.value)">
                            <option ${orderStatus === "Pending" ? "selected" : ""}>Pending</option>
                            <option ${orderStatus === "Confirmed" ? "selected" : ""}>Confirmed</option>
                            <option ${orderStatus === "Preparing" ? "selected" : ""}>Preparing</option>
                            <option ${orderStatus === "Processing" ? "selected" : ""}>Processing</option>
                            <option ${orderStatus === "Delivered" ? "selected" : ""}>Delivered</option>
                            <option ${orderStatus === "Cancelled" ? "selected" : ""}>Cancelled</option>
                        </select>
                     <\/td>
                    <td><button class="btn-invoice" onclick="viewInvoice(${event.id})"><i class="fa-solid fa-file-invoice"></i><\/button><\/td>
                    <td>${formatDate(event.created_at)}<\/td>
                    <td>
                        <div class="actions-wrap">
                            <button class="btn-whatsapp" onclick="openWhatsApp('${event.phone}')"><i class="fa-brands fa-whatsapp"></i><\/button>
                            <button class="btn-delete" onclick="deleteEvent(${event.id})"><i class="fa-solid fa-trash"></i><\/button>
                        </div>
                     <\/td>
                <\/tr>
            `;
        });
    } catch(error){ console.log(error); }
}

function getEventById(id){ return window.allEvents.find(e => e.id === id); }

function formatPackage(pkg){
    if(!pkg) return "Custom Package";
    if(typeof pkg === "string") return pkg;
    return pkg.name || "Custom Package";
}

function formatDate(ds){ return ds ? new Date(ds).toLocaleDateString("en-GB") : "-"; }

function openWhatsApp(phone){ if(phone) window.open(`https://wa.me/${phone}`, "_blank"); }

async function updateEventStatus(eventId, status){
    try{
        const res = await fetch(`/api/update-event-status/${eventId}/`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({status: status})
        });
        const data = await res.json();
        if(data.whatsapp_link) window.open(data.whatsapp_link, "_blank");
        loadEvents();
    } catch(e){ console.log(e); }
}

async function updateEventPaymentStatus(eventId, paymentStatus){
    try{
        const res = await fetch(`/api/update-event-status/${eventId}/`, {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({payment_status: paymentStatus})
        });
        const data = await res.json();
        if(data.whatsapp_link) window.open(data.whatsapp_link, "_blank");
        loadEvents();
    } catch(e){ console.log(e); }
}

async function deleteEvent(eventId){
    if(!confirm("Delete this event?")) return;
    try{
        await fetch(`/api/delete-event/${eventId}/`, {method:"DELETE"});
        document.getElementById(`event-row-${eventId}`).remove();
        window.allEvents = window.allEvents.filter(e => e.id !== eventId);
    } catch(e){ console.log(e); }
}

window.viewInvoice = function(eventId){
    const event = getEventById(eventId);
    if(!event) return;
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(`<html><head><title>Invoice</title><style>body{font-family:Arial;padding:40px;} h1{color:#ec4899;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;}</style></head><body>
        <h1>IK Delights Invoice</h1>
        <p><strong>Event ID:</strong> #${event.id}</p>
        <p><strong>Customer:</strong> ${event.customer_name}</p>
        <p><strong>Phone:</strong> ${event.phone}</p>
        <p><strong>Event:</strong> ${event.event_type}</p>
        <p><strong>Total:</strong> PKR ${event.total_price}</p>
        <p><strong>Advance:</strong> PKR ${event.advance_payment || 0}</p>
        <p><strong>Remaining:</strong> PKR ${event.remaining_amount || 0}</p>
        <p><strong>Status:</strong> ${event.status}</p>
        <hr><h2>Package</h2><p>${event.selected_deal || "Custom Package"}</p>
        <hr><p>Thank you for choosing IK Delights!</p>
    </body></html>`);
};

window.saveEvent = async function(){ /* keep your existing save function */ };
window.showAddEventModal = function(){ /* keep your existing modal function */ };
window.closeEventModal = function(){ document.getElementById("eventModal").style.display = "none"; };
window.editEvent = function(eventId){ /* keep your existing edit function */ };