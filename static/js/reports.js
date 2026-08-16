// =========================================
// REPORTS JS - MINIMAL VERSION
// =========================================

document.addEventListener("DOMContentLoaded", function() {
    initReportsCharts();
});

// =========================================
// INIT CHARTS
// =========================================

function initReportsCharts() {
    if (typeof Chart === "undefined") {
        console.log("Chart.js not loaded");
        return;
    }

    // Destroy old charts
    if (window.ordersOverviewInstance) window.ordersOverviewInstance.destroy();
    if (window.ordersSourceInstance) window.ordersSourceInstance.destroy();

    // Get data from Django
    let monthsLabels = [];
    let websiteMonthlyData = [];
    let whatsappMonthlyData = [];

    try {
        const monthsElem = document.getElementById("monthsLabelsData");
        const websiteElem = document.getElementById("websiteOrdersMonthlyData");
        const whatsappElem = document.getElementById("whatsappOrdersMonthlyData");

        if (monthsElem && monthsElem.innerHTML) monthsLabels = JSON.parse(monthsElem.innerHTML);
        if (websiteElem && websiteElem.innerHTML) websiteMonthlyData = JSON.parse(websiteElem.innerHTML);
        if (whatsappElem && whatsappElem.innerHTML) whatsappMonthlyData = JSON.parse(whatsappElem.innerHTML);
    } catch(e) {
        console.log("Error parsing data:", e);
    }

    // Calculate totals
    const websiteTotal = websiteMonthlyData.reduce((a,b) => a + b, 0);
    const whatsappTotal = whatsappMonthlyData.reduce((a,b) => a + b, 0);
    const totalOrders = websiteTotal + whatsappTotal;

    // Orders Overview Chart (Line)
    const overviewCanvas = document.getElementById("ordersOverviewChart");
    if (overviewCanvas && monthsLabels.length > 0) {
        window.ordersOverviewInstance = new Chart(overviewCanvas, {
            type: "line",
            data: {
                labels: monthsLabels,
                datasets: [
                    {
                        label: "Website Orders",
                        data: websiteMonthlyData,
                        borderColor: "#ff4f81",
                        backgroundColor: "rgba(255,79,129,0.1)",
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: "WhatsApp Orders",
                        data: whatsappMonthlyData,
                        borderColor: "#22c55e",
                        backgroundColor: "rgba(34,197,94,0.1)",
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top" }
                }
            }
        });
    }

    // Orders Source Chart (Doughnut)
    const sourceCanvas = document.getElementById("ordersSourceChart");
    if (sourceCanvas && totalOrders > 0) {
        const websitePercent = Math.round((websiteTotal / totalOrders) * 100);
        const whatsappPercent = Math.round((whatsappTotal / totalOrders) * 100);
        
        window.ordersSourceInstance = new Chart(sourceCanvas, {
            type: "doughnut",
            data: {
                labels: ["Website", "WhatsApp"],
                datasets: [{
                    data: [websitePercent, whatsappPercent],
                    backgroundColor: ["#ff4f81", "#22c55e"],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: { position: "bottom" }
                }
            }
        });
    }
}

// =========================================
// GENERATE REPORT
// =========================================

function generateCustomReport() {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    if (!startDate || !endDate) {
        alert("Please select both start and end dates");
        return;
    }

    window.location.href = `/admin/reports/?start=${startDate}&end=${endDate}`;
}

// =========================================
// DOWNLOAD PDF
// =========================================

function downloadProfessionalPDF() {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    let pdfUrl = "/admin/reports/pdf/";
    if (startDate && endDate) pdfUrl += `?start=${startDate}&end=${endDate}`;
    window.open(pdfUrl, "_blank");
}

// =========================================
// EXPORT EXCEL
// =========================================

function exportExcel() {
    const table = document.querySelector(".reports-table");
    if (!table) {
        alert("No table found");
        return;
    }
    const html = table.outerHTML;
    const url = "data:application/vnd.ms-excel," + encodeURIComponent(html);
    const link = document.createElement("a");
    link.href = url;
    link.download = "IK_Delights_Report.xls";
    link.click();
}

// =========================================
// LOAD PAGE
// =========================================

if (typeof loadPage === "undefined") {
    window.loadPage = function(pageName) {
        window.location.href = `/admin/${pageName}/`;
    };
}

// Global exports
window.initReportsCharts = initReportsCharts;
window.generateCustomReport = generateCustomReport;
window.downloadProfessionalPDF = downloadProfessionalPDF;
window.exportExcel = exportExcel;