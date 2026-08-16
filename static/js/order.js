// ================= ORDERS PAGE JS - COMPLETE VERSION =================
// FULLY FIXED: updatePaymentStatus uses correct admin URL

// View Order Modal
function viewOrder(orderId) {
    fetch(`/api/order/${orderId}/`)
        .then(response => response.json())
        .then(data => {
            let verificationBadge = data.payment_verified
                ? '<span style="color:#16a34a; font-weight:bold;">✅ Verified</span>'
                : '<span style="color:#dc2626; font-weight:bold;">❌ Pending</span>';

            let screenshotHtml = data.payment_screenshot
                ? `<a href="${data.payment_screenshot}" target="_blank"><img src="${data.payment_screenshot}" style="width:100px; border-radius:8px; margin-top:10px; border:1px solid #eee;"></a>`
                : '<p style="color:#888; margin-top:10px;">No Screenshot</p>';

            let html = `
                <div style="padding:15px; font-family:sans-serif;">
                    <h3 style="margin-bottom:10px; color:#c46a84;">📦 Order #${data.id}</h3>
                    <hr style="margin:10px 0;">
                    <p><b>👤 Customer:</b> ${data.name}</p>
                    <p><b>📱 Phone:</b> ${data.phone}</p>
                    <p><b>💰 Total:</b> Rs ${data.total}</p>
                    <p><b>💳 Advance:</b> Rs ${data.advance_amount || 0}</p>
                    <p><b>⏳ Remaining:</b> Rs ${data.remaining_amount || 0}</p>
                    <p><b>📦 Status:</b> ${data.status}</p>
                    <p><b>💵 Payment:</b> ${data.payment_status}</p>
                    <p><b>🔑 Transaction:</b> ${data.transaction_id || '-'}</p>
                    <p><b>✅ Verification:</b> ${verificationBadge}</p>
                    <p><b>📅 Date:</b> ${data.created_at ? new Date(data.created_at).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                    <hr style="margin:10px 0;">
                    <h4>📸 Payment Screenshot</h4>
                    ${screenshotHtml}
                    <div style="margin-top:15px; text-align:center;">
                        <button onclick="closeModal()" style="background:#c46a84; color:white; border:none; padding:8px 20px; border-radius:8px; cursor:pointer;">Close</button>
                    </div>
                </div>
            `;
            
            let orderDetails = document.getElementById("orderDetails");
            if (orderDetails) orderDetails.innerHTML = html;
            
            let modal = document.getElementById("orderModal");
            if (modal) modal.style.display = "block";
        })
        .catch(error => {
            console.error("Error:", error);
            alert("Error loading order details");
        });
}

// Close Modal
function closeModal() {
    let modal = document.getElementById("orderModal");
    if (modal) modal.style.display = "none";
}

// Update Order Status
function updateOrderStatus(select, orderId, phone) {
    let newStatus = select.value;
    let statusText = select.options[select.selectedIndex].text;
    select.disabled = true;
    select.style.opacity = '0.6';

    showToast(`Updating order status...`, 'info');

    fetch(`/admin/update-order-status/${orderId}/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie('csrftoken')
        },
        body: JSON.stringify({ status: newStatus })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "ok") {
            showToast(`✅ Order #${orderId} updated to ${statusText}!`, 'success');
            
            if (data.whatsapp_link) {
                window.open(data.whatsapp_link, '_blank');
            }
            select.disabled = false;
            select.style.opacity = '1';
        } else {
            showToast(`❌ Error: ${data.error || 'Update failed'}`, 'error');
            select.disabled = false;
            select.style.opacity = '1';
        }
    })
    .catch(error => {
        console.error("Error:", error);
        showToast(`❌ Network error!`, 'error');
        select.disabled = false;
        select.style.opacity = '1';
    });
}

// ✅ Payment Status Function - FIXED URL (uses admin, not api)
function updatePaymentStatus(select, orderId) {
    let paymentStatus = select.value;

    // Get the amount input field for this order
    let amountInput = document.querySelector(
        `.received-amount[data-order-id="${orderId}"]`
    );
    let receivedAmount = amountInput ? parseFloat(amountInput.value) : 0;

    // Debug logs
    console.log("ORDER ID =", orderId);
    console.log("STATUS =", paymentStatus);
    console.log("AMOUNT =", receivedAmount);

    select.disabled = true;
    select.style.opacity = '0.6';

    showToast('Updating payment status...', 'info');

    // ✅ CORRECT URL: /admin/update-payment-status/... (NOT /api/...)
    fetch(`/admin/update-payment-status/${orderId}/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie('csrftoken')
        },
        body: JSON.stringify({
            payment_status: paymentStatus,
            received_amount: receivedAmount
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log("SERVER RESPONSE =", data);

        if (data.status === "ok") {
            showToast("✅ Payment updated successfully!", "success");

            if (data.whatsapp_link) {
                window.open(data.whatsapp_link, "_blank");
            }

            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            showToast("❌ Update failed: " + (data.error || "Unknown error"), "error");
        }

        select.disabled = false;
        select.style.opacity = '1';
    })
    .catch(error => {
        console.error("FETCH ERROR =", error);
        showToast("❌ Network Error", "error");
        select.disabled = false;
        select.style.opacity = '1';
    });
}

// Show Toast Notification
function showToast(message, type = 'info') {
    let existingToast = document.querySelector('.custom-toast');
    if (existingToast) existingToast.remove();

    let bgColor = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#c46a84';
    let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';

    let toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `<span style="margin-right:8px;">${icon}</span> ${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: ${bgColor};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 99999;
        font-size: 14px;
        font-weight: 500;
        font-family: 'Segoe UI', sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Get CSRF Token
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Close modal on outside click
window.onclick = function(event) {
    let modal = document.getElementById("orderModal");
    if (event.target === modal && modal) {
        closeModal();
    }
}

// Add animation styles
(function addStyles() {
    if (!document.querySelector('#orderPageStyles')) {
        let style = document.createElement('style');
        style.id = 'orderPageStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            #orderModal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
            }
            #orderModal > div {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 16px;
                max-width: 500px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }
        `;
        document.head.appendChild(style);
    }
})();