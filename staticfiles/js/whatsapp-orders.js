/* =====================================================
   WHATSAPP ORDERS JS - FULLY FIXED
   Convert functionality now uses direct redirect
===================================================== */

function getCSRFToken() {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
        let cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i].trim();
            if (cookie.substring(0, 10) === "csrftoken") {
                cookieValue = decodeURIComponent(cookie.substring(11));
                break;
            }
        }
    }
    return cookieValue;
}

function searchWhatsAppOrders() {
    let input = document.getElementById("whatsappSearch");
    if (!input) return;
    
    let searchTerm = input.value.toLowerCase();
    let rows = document.querySelectorAll("#whatsappTableBody tr");
    
    rows.forEach(row => {
        if (row.querySelector(".empty-state")) return;
        let text = row.innerText.toLowerCase();
        row.style.display = text.includes(searchTerm) ? "" : "none";
    });
}

function deleteWhatsAppOrder(orderId) {
    if (!confirm("Delete this WhatsApp order?")) return;
    
    fetch(`/admin/delete-whatsapp-order/${orderId}/`, {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "ok") {
            let row = document.getElementById(`whatsapp-${orderId}`);
            if (row) row.remove();
            
            // Update total count
            let totalSpan = document.getElementById("totalWhatsappCount");
            if (totalSpan) {
                let current = parseInt(totalSpan.innerText) || 0;
                totalSpan.innerText = current - 1;
            }
            
            if (window.showToastNotification) {
                window.showToastNotification("✅ WhatsApp order deleted successfully!", "success");
            } else {
                alert("Deleted successfully!");
            }
        } else {
            alert("Error deleting order");
        }
    })
    .catch(error => {
        console.error(error);
        alert("Network error!");
    });
}

function updateWhatsAppStatus(orderId, status) {
    fetch(`/admin/update-whatsapp-status/${orderId}/`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCSRFToken()
        },
        body: JSON.stringify({ status: status })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === "ok") {
            if (window.showToastNotification) {
                window.showToastNotification(`✅ Status updated to ${status}!`, "success");
            }
        }
    })
    .catch(error => console.error(error));
}

// ✅ FIXED: Convert function using direct redirect (since view returns redirect)
function convertWhatsappToOrder(leadId) {
    if (!confirm("Convert this lead to a proper order?")) return;
    
    // Direct redirect - no fetch needed because view returns redirect
    window.location.href = `/admin/convert-whatsapp-order/${leadId}/`;
}

document.addEventListener("DOMContentLoaded", function () {
    console.log("✅ WhatsApp Orders JS Loaded Successfully");
    
    // Add event listener for search input
    const searchInput = document.getElementById("whatsappSearch");
    if (searchInput) {
        searchInput.addEventListener("keyup", function() {
            searchWhatsAppOrders();
        });
    }
});