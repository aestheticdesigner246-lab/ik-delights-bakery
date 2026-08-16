/* =========================================================
   IK DELIGHTS SMART EVENT PLANNER - FINAL DEFINITIVE v3.0
   ✅ Modal open -> first question INSTANTLY
   ✅ No "Loading Planner..." flicker
   ✅ All 19 questions with conditional logic
========================================================= */

const SmartPlanner = {
    currentQuestion: 0,
    answers: {},
    questions: [
        { id: "event_type", question: "🎉 Which type of event are you planning?", type: "options", options: ["Birthday", "Wedding", "Anniversary", "Baby Shower", "Engagement", "Corporate"] },
        { id: "theme", question: "🎨 Select event theme", type: "options", options: ["Pink Theme", "Blue Theme", "Golden Theme", "Pastel Theme", "Elegant White", "Custom"] },
        { id: "guests", question: "👥 How many guests are expected?", type: "number", placeholder: "Enter number of guests" },
        { id: "budget", question: "💰 What is your estimated budget (PKR)?", type: "number", placeholder: "Enter budget" },
        { id: "cake_required", question: "🎂 Do you need a custom cake?", type: "options", options: ["Yes", "No"] },
        { id: "cake_flavor", question: "🍰 Select your preferred cake flavor", type: "options", options: ["Chocolate", "Vanilla", "Red Velvet", "Black Forest", "Pineapple", "Lemon"], condition: (ans) => ans.cake_required === "Yes" },
        { id: "cake_size", question: "⚖️ Select cake size", type: "options", options: ["1 Pound", "2 Pound", "3 Pound", "5 Pound", "1 KG", "2 KG", "3 KG"], condition: (ans) => ans.cake_required === "Yes" },
        { id: "cake_text", question: "✍️ Any text on cake?", type: "text", placeholder: "e.g., Happy Birthday Sarah", condition: (ans) => ans.cake_required === "Yes" },
        { id: "cupcakes", question: "🧁 Do you need cupcakes?", type: "options", options: ["Yes", "No"] },
        { id: "cupcakes_qty", question: "🧁 How many cupcakes?", type: "number", placeholder: "Enter quantity", condition: (ans) => ans.cupcakes === "Yes" },
        { id: "brownies", question: "🍫 Do you need brownies?", type: "options", options: ["Yes", "No"] },
        { id: "brownies_qty", question: "🍫 How many brownies?", type: "number", placeholder: "Enter quantity", condition: (ans) => ans.brownies === "Yes" },
        { id: "donuts", question: "🍩 Do you need donuts?", type: "options", options: ["Yes", "No"] },
        { id: "donuts_qty", question: "🍩 How many donuts?", type: "number", placeholder: "Enter quantity", condition: (ans) => ans.donuts === "Yes" },
        { id: "delivery_date", question: "📅 Delivery / Pickup Date (min 1 day ahead)", type: "date" },
        { id: "pickup_time", question: "⏰ Pickup Time", type: "time" },
        { id: "customer_name", question: "👤 Your full name", type: "text", placeholder: "Enter your name" },
        { id: "customer_phone", question: "📞 Your phone number", type: "text", placeholder: "03XXXXXXXXX" },
        { id: "notes", question: "📝 Any special notes or requests?", type: "text", placeholder: "Optional" }
    ]
};

function getVisibleQuestions() {
    return SmartPlanner.questions.filter(q => !q.condition || q.condition(SmartPlanner.answers));
}

function getCurrentVisibleIndex() {
    const visible = getVisibleQuestions();
    const currentId = SmartPlanner.questions[SmartPlanner.currentQuestion]?.id;
    return visible.findIndex(q => q.id === currentId);
}

function goToNextVisible() {
    const visible = getVisibleQuestions();
    let idx = getCurrentVisibleIndex();
    if (idx + 1 < visible.length) {
        let nextId = visible[idx+1].id;
        let nextIndex = SmartPlanner.questions.findIndex(q => q.id === nextId);
        if (nextIndex !== -1) {
            SmartPlanner.currentQuestion = nextIndex;
            renderQuestion();
            return true;
        }
    }
    return false;
}

function goToPrevVisible() {
    const visible = getVisibleQuestions();
    let idx = getCurrentVisibleIndex();
    if (idx - 1 >= 0) {
        let prevId = visible[idx-1].id;
        let prevIndex = SmartPlanner.questions.findIndex(q => q.id === prevId);
        if (prevIndex !== -1) {
            SmartPlanner.currentQuestion = prevIndex;
            renderQuestion();
            return true;
        }
    }
    return false;
}

function updateDynamicPackages() {
    const packagesDiv = document.getElementById('suggestedPackages');
    if (!packagesDiv) return;
    const budget = parseInt(SmartPlanner.answers.budget) || 0;
    if (budget < 5000) {
        packagesDiv.innerHTML = '<p style="color:#c46a84;">💡 Please enter a budget (minimum PKR 5,000) to see packages.</p>';
        return;
    }
    const eventType = SmartPlanner.answers.event_type || "Event";
    const guests = parseInt(SmartPlanner.answers.guests) || 0;
    const cakeFlavor = SmartPlanner.answers.cake_flavor || "chocolate";
    const cakeSize = SmartPlanner.answers.cake_size || "2 Pound";
    const cakeText = SmartPlanner.answers.cake_text || "";
    const theme = SmartPlanner.answers.theme || "Elegant";
    const cupcakes = SmartPlanner.answers.cupcakes === "Yes" ? (parseInt(SmartPlanner.answers.cupcakes_qty) || 0) : 0;
    const brownies = SmartPlanner.answers.brownies === "Yes" ? (parseInt(SmartPlanner.answers.brownies_qty) || 0) : 0;
    const donuts = SmartPlanner.answers.donuts === "Yes" ? (parseInt(SmartPlanner.answers.donuts_qty) || 0) : 0;
    const cakeRequired = SmartPlanner.answers.cake_required || "Yes";
    
    let silverPrice = Math.round(budget * 0.6);
    let goldPrice = Math.round(budget * 0.85);
    let premiumPrice = budget;
    let extraCost = (cupcakes * 120) + (brownies * 100) + (donuts * 90);
    silverPrice += Math.round(extraCost * 0.5);
    goldPrice += extraCost;
    premiumPrice += extraCost;
    
    const cakeDetail = cakeRequired === "Yes" ? `${cakeSize} ${cakeFlavor} cake` : "No cake";
    const textDetail = cakeText ? ` with "${cakeText}"` : "";
    const themeDetail = theme !== "Custom" ? theme : "Custom theme";
    let dessertDetail = "";
    if (cupcakes > 0) dessertDetail += `${cupcakes} cupcakes, `;
    if (brownies > 0) dessertDetail += `${brownies} brownies, `;
    if (donuts > 0) dessertDetail += `${donuts} donuts, `;
    dessertDetail = dessertDetail.slice(0, -2) || "No extras";
    
    let silverFeatures = `🎂 ${cakeDetail}${textDetail}<br>🎈 Basic decor (${themeDetail})<br>🍬 Simple sweet table`;
    if (guests > 0) silverFeatures += `<br>👥 Setup for up to ${Math.min(guests, 50)} guests`;
    silverFeatures += `<br>🍪 ${dessertDetail}`;
    
    let goldFeatures = `🎂 Premium ${cakeDetail}${textDetail}<br>🎨 Themed decor (${themeDetail})<br>🧁 12 Cupcakes (included)<br>🍫 Chocolate fountain<br>🎈 Balloon arch`;
    if (guests > 0) goldFeatures += `<br>👥 Setup for up to ${Math.min(guests, 100)} guests`;
    goldFeatures += `<br>🍪 ${dessertDetail}`;
    if (eventType === "Wedding") goldFeatures += `<br>💐 Bridal bouquet`;
    if (eventType === "Birthday") goldFeatures += `<br>🎁 Party favors`;
    
    let premiumFeatures = `🎂 Luxury 3-tier ${cakeDetail}${textDetail}<br>✨ Full event decor (${themeDetail})<br>🧁 24 Cupcakes + Macarons<br>🍫 Gourmet dessert bar<br>🎪 Photo backdrop<br>📸 Event coordination`;
    if (guests > 0) premiumFeatures += `<br>👥 Setup for all ${guests} guests`;
    premiumFeatures += `<br>🍪 ${dessertDetail}`;
    if (eventType === "Wedding") premiumFeatures += `<br>💐 Bridal + bridesmaid bouquets<br>🎥 Highlight video`;
    if (eventType === "Birthday") premiumFeatures += `<br>🎈 Bouncy castle or magician`;
    
    packagesDiv.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px;">
            <div class="package-card" style="padding:12px; border:1px solid #ffe5ed; border-radius:16px; background:white;">
                <h3 style="color:#c46a84;">🥈 Silver Package</h3>
                <div style="font-size:1.3rem; font-weight:700;">PKR ${silverPrice.toLocaleString()}</div>
                <div style="font-size:0.75rem;">${silverFeatures}</div>
                <button class="planner-btn" onclick="selectPackage('Silver', ${silverPrice})" style="margin-top:10px; width:100%; background:#c46a84; color:white; border:none; padding:8px; border-radius:40px;">Select Package</button>
            </div>
            <div class="package-card" style="padding:12px; border:2px solid #c46a84; border-radius:16px; background:linear-gradient(135deg,#fff,#fef5f7);">
                <h3 style="color:#c46a84;">🥇 Gold Package (Bestseller)</h3>
                <div style="font-size:1.3rem; font-weight:700;">PKR ${goldPrice.toLocaleString()}</div>
                <div style="font-size:0.75rem;">${goldFeatures}</div>
                <button class="planner-btn" onclick="selectPackage('Gold', ${goldPrice})" style="margin-top:10px; width:100%; background:#c46a84; color:white; border:none; padding:8px; border-radius:40px;">Select Package</button>
            </div>
            <div class="package-card" style="padding:12px; border:1px solid #ffe5ed; border-radius:16px; background:white;">
                <h3 style="color:#c46a84;">💎 Premium Package</h3>
                <div style="font-size:1.3rem; font-weight:700;">PKR ${premiumPrice.toLocaleString()}</div>
                <div style="font-size:0.75rem;">${premiumFeatures}</div>
                <button class="planner-btn" onclick="selectPackage('Premium', ${premiumPrice})" style="margin-top:10px; width:100%; background:#c46a84; color:white; border:none; padding:8px; border-radius:40px;">Select Package</button>
            </div>
        </div>
        <p style="font-size:11px; color:#999;">* Prices include all taxes.</p>
    `;
}

window.selectPackage = function(pkg, price) {
    SmartPlanner.answers.selected_package = pkg;
    SmartPlanner.answers.package_price = price;
    updateSummary();
    updateInvoicePreview(pkg, price);
};

function updateInvoicePreview(pkg, price) {
    const invoiceDiv = document.getElementById('invoicePreview');
    if (!invoiceDiv) return;
    let items = [];
    if (SmartPlanner.answers.cake_required === "Yes") {
        items.push(`${SmartPlanner.answers.cake_size || ''} ${SmartPlanner.answers.cake_flavor || ''} cake`);
        if (SmartPlanner.answers.cake_text) items.push(`Text: "${SmartPlanner.answers.cake_text}"`);
    }
    if (SmartPlanner.answers.cupcakes === "Yes") items.push(`${SmartPlanner.answers.cupcakes_qty || 0} cupcakes`);
    if (SmartPlanner.answers.brownies === "Yes") items.push(`${SmartPlanner.answers.brownies_qty || 0} brownies`);
    if (SmartPlanner.answers.donuts === "Yes") items.push(`${SmartPlanner.answers.donuts_qty || 0} donuts`);
    invoiceDiv.innerHTML = `
        <div style="background:#f9f0f4; border-radius:16px; padding:12px;">
            <p><strong>📦 Package:</strong> ${pkg}</p>
            <p><strong>💰 Total:</strong> PKR ${price.toLocaleString()}</p>
            <p><strong>📋 Items:</strong> ${items.join(', ') || 'Standard package'}</p>
            <p><strong>👤 Customer:</strong> ${SmartPlanner.answers.customer_name || '—'}</p>
            <p><strong>📞 Phone:</strong> ${SmartPlanner.answers.customer_phone || '—'}</p>
            <p><strong>📅 Pickup:</strong> ${SmartPlanner.answers.delivery_date || '—'} ${SmartPlanner.answers.pickup_time || ''}</p>
        </div>
    `;
}

function renderQuestion() {
    const container = document.getElementById('eventStepContent');
    if (!container) return;
    const visible = getVisibleQuestions();
    const idx = getCurrentVisibleIndex();
    if (idx < 0 || idx >= visible.length) {
        showFinalStep();
        return;
    }
    const q = visible[idx];
    let html = `<div class="planner-question-box"><h2 class="planner-question-title">${q.question}</h2>`;
    if (q.type === "options") {
        html += `<div class="event-cards">`;
        q.options.forEach(opt => {
            html += `<div class="event-card" onclick="selectOption('${q.id}', '${opt.replace(/'/g, "\\'")}')">${opt}</div>`;
        });
        html += `</div>`;
    } else if (q.type === "text" || q.type === "number") {
        let inputType = q.type === "number" ? "number" : "text";
        let saved = SmartPlanner.answers[q.id] || '';
        html += `<input type="${inputType}" class="form-control" id="plannerInput" placeholder="${q.placeholder || ''}" value="${saved.replace(/"/g, '&quot;')}"><br><br>
                 <button class="planner-btn planner-next-btn" onclick="submitInput('${q.id}')">Continue →</button>`;
    } else if (q.type === "date") {
        let saved = SmartPlanner.answers[q.id] || '';
        let today = new Date();
        let minDate = new Date(today);
        minDate.setDate(today.getDate() + 1);
        let minStr = minDate.toISOString().split('T')[0];
        html += `<input type="date" class="form-control" id="plannerInput" min="${minStr}" value="${saved}"><br><br>
                 <button class="planner-btn planner-next-btn" onclick="submitInput('${q.id}')">Continue →</button>`;
    } else if (q.type === "time") {
        let saved = SmartPlanner.answers[q.id] || '';
        html += `<input type="time" class="form-control" id="plannerInput" value="${saved}"><br><br>
                 <button class="planner-btn planner-next-btn" onclick="submitInput('${q.id}')">Continue →</button>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    updateProgress();
    updateSummary();
}

window.selectOption = function(id, val) {
    SmartPlanner.answers[id] = val;
    if (id === 'cake_required' && val === 'No') {
        delete SmartPlanner.answers.cake_flavor;
        delete SmartPlanner.answers.cake_size;
        delete SmartPlanner.answers.cake_text;
    }
    updateSummary();
    updateDynamicPackages();
    goToNextVisible();
};

window.submitInput = function(id) {
    let inp = document.getElementById('plannerInput');
    if (!inp) return;
    let val = inp.value.trim();
    if (id !== 'notes' && val === "") {
        alert("Please fill the field");
        return;
    }
    if (id === 'customer_phone') {
        if (!/^03\d{9}$/.test(val)) {
            alert("Enter valid Pakistani number (03XXXXXXXXX)");
            return;
        }
    }
    if (id === 'delivery_date') {
        let today = new Date();
        let selected = new Date(val);
        let minDate = new Date();
        minDate.setDate(today.getDate() + 1);
        if (selected < minDate) {
            alert("Pickup date must be at least 1 day from today");
            return;
        }
    }
    SmartPlanner.answers[id] = val;
    updateSummary();
    updateDynamicPackages();
    goToNextVisible();
};

window.nextQuestion = function() { goToNextVisible(); };
window.prevPlannerStep = function() { goToPrevVisible(); };

function updateSummary() {
    let summaryDiv = document.getElementById('liveSummary');
    let totalDiv = document.getElementById('plannerTotalDisplay');
    if (!summaryDiv) return;
    let html = '';
    for (let [k,v] of Object.entries(SmartPlanner.answers)) {
        if (v && !['selected_package','package_price'].includes(k)) {
            html += `<p><strong>${formatKey(k)}:</strong> ${v}</p>`;
        }
    }
    if (SmartPlanner.answers.selected_package) {
        html += `<p><strong>Selected Package:</strong> ${SmartPlanner.answers.selected_package} (PKR ${SmartPlanner.answers.package_price?.toLocaleString()})</p>`;
    }
    summaryDiv.innerHTML = html || "Start answering questions...";
    if (totalDiv && SmartPlanner.answers.budget) {
        totalDiv.innerHTML = `PKR ${parseInt(SmartPlanner.answers.budget).toLocaleString()}`;
    } else if (totalDiv) totalDiv.innerHTML = "PKR 0";
}

function updateProgress() {
    let fill = document.getElementById('eventProgressFill');
    let indicator = document.getElementById('stepIndicator');
    if (!fill || !indicator) return;
    let visible = getVisibleQuestions();
    let total = visible.length;
    if (total <= 0) return;
    let idx = getCurrentVisibleIndex();
    let curr = idx + 1;
    fill.style.width = (curr / total) * 100 + '%';
    indicator.innerText = `Question ${curr} / ${total}`;
}

function formatKey(k) {
    return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function showFinalStep() {
    let container = document.getElementById('eventStepContent');
    if (!container) return;
    let answersHtml = '';
    for (let [k,v] of Object.entries(SmartPlanner.answers)) {
        if (v) answersHtml += `<p><strong>${formatKey(k)}:</strong> ${v}</p>`;
    }
    container.innerHTML = `
        <div class="planner-question-box">
            <h2>🎉 Thank You!</h2>
            <p>Your event plan is ready. Select a package above then click below.</p>
            <div class="summary-card"><h3>Event Summary</h3>${answersHtml}</div>
            <button class="planner-btn planner-next-btn" onclick="sendToWhatsApp()">📱 Send to WhatsApp</button>
            <button class="planner-btn" onclick="closeSmartEventModal()" style="background:#ddd;">Close</button>
        </div>
    `;
}

window.sendToWhatsApp = function() {
    let msg = `🎂 IK DELIGHTS EVENT PLANNER\n━━━━━━━━━━━━━━━\n`;
    for (let [k,v] of Object.entries(SmartPlanner.answers)) {
        if (v) msg += `${formatKey(k)}: ${v}\n`;
    }
    msg += `━━━━━━━━━━━━━━━\nThank you! 💖`;
    let biz = window.IK_BUSINESS_NUMBER || "923214243501";
    window.open(`https://wa.me/${biz}?text=${encodeURIComponent(msg)}`, '_blank');
    closeSmartEventModal();
};

// ========== MODAL OPEN - IMMEDIATE RENDER ==========
window.openSmartEventPlanner = function() {
    let modal = document.getElementById('smartEventModal');
    if (!modal) return;
    modal.classList.add('active');
    SmartPlanner.currentQuestion = 0;
    SmartPlanner.answers = {};
    // Directly render – no delay, no condition
    renderQuestion();
    updateProgress();
    updateSummary();
    updateDynamicPackages();
};

window.closeSmartEventModal = function() {
    let modal = document.getElementById('smartEventModal');
    if (modal) modal.classList.remove('active');
};

// Enter key support
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        let input = document.getElementById('plannerInput');
        if (input && input.offsetParent !== null) {
            let visible = getVisibleQuestions();
            let idx = getCurrentVisibleIndex();
            if (idx >= 0 && visible[idx] && ['text','number','date','time'].includes(visible[idx].type)) {
                e.preventDefault();
                submitInput(visible[idx].id);
            }
        }
    }
});

// Close modal on background click
document.addEventListener('DOMContentLoaded', () => {
    let modal = document.getElementById('smartEventModal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeSmartEventModal(); });
    console.log("IK Delights Planner v3.0 - Instant first question");
});