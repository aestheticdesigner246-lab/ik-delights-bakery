// ==========================================
// CATEGORIES MANAGEMENT JS
// FULLY FIXED FOR AJAX DASHBOARD
// ==========================================

// ==========================================
// GLOBAL VARIABLE
// ==========================================

window.editingCategoryId = null;

// ==========================================
// GET COOKIE FUNCTION
// ==========================================

window.getCookie = function(name) {
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
};

// ==========================================
// ESCAPE HTML FUNCTION
// ==========================================

window.escapeHtml = function(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
};

// ==========================================
// TOAST NOTIFICATION
// ==========================================

window.showToastNotification = function(message, type = "success") {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.custom-toast');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement("div");
    toast.className = "custom-toast";
    
    const bgColor = type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#17a2b8";
    const icon = type === "success" ? "fa-check-circle" : type === "error" ? "fa-exclamation-circle" : "fa-info-circle";
    
    toast.innerHTML = `
        <div style="
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100000;
            animation: slideInRight 0.3s ease;
            font-size: 14px;
            font-family: 'Poppins', sans-serif;
        ">
            <i class="fa-solid ${icon}" style="margin-right: 8px;"></i>
            ${message}
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast && toast.remove) {
            toast.remove();
        }
    }, 3000);
};

// ==========================================
// LOAD CATEGORIES
// ==========================================

window.loadCategories = async function() {
    console.log("🔄 loadCategories() called");
    
    const tbody = document.getElementById("categoriesTableBody");
    if (!tbody) {
        console.error("❌ categoriesTableBody not found");
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align: center; padding: 40px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading Categories...</p>
            </td>
        </tr>
    `;

    try {
        const response = await fetch("/api/categories/");
        const categories = await response.json();
        
        console.log("📁 Categories received:", categories);
        
        if (!categories || categories.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 60px;">
                        <i class="fa-solid fa-folder-open fa-3x text-muted mb-3"></i>
                        <p>No categories found</p>
                        <button class="btn btn-primary btn-sm" onclick="window.showAddCategoryModal()">
                            <i class="fa-solid fa-plus"></i> Add First Category
                        </button>
                    </td>
                </tr>
            `;
            return;
        }
        
        let html = "";
        categories.forEach(category => {
            const statusClass = category.is_active ? "categories-active-status" : "categories-inactive-status";
            const statusText = category.is_active ? "Active" : "Inactive";
            const productCount = category.product_count || 0;
            
            html += `
                <tr>
                    <!-- IMAGE -->
                    <td style="text-align: center;">
                        ${category.image ? 
                            `<img src="${category.image}" class="categories-image" style="width: 55px; height: 55px; object-fit: cover; border-radius: 12px;">` : 
                            `<div style="width: 55px; height: 55px; background: #f5ebe5; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                                <i class="fa-solid fa-folder" style="font-size: 24px; color: #c8b1a3;"></i>
                            </div>`
                        }
                    </td>
                    
                    <!-- NAME -->
                    <td class="categories-name">
                        <strong>${window.escapeHtml(category.name)}</strong>
                    </td>
                    
                    <!-- SLUG -->
                    <td>
                        <span class="categories-slug" style="background: #f0e6e0; padding: 5px 12px; border-radius: 20px; font-size: 12px;">
                            ${window.escapeHtml(category.slug || '-')}
                        </span>
                    </td>
                    
                    <!-- PRODUCTS -->
                    <td style="text-align: center;">
                        <div class="categories-product-count" style="background: #ffe5ef; color: #ff4d8d; width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;">
                            ${productCount}
                        </div>
                    </td>
                    
                    <!-- STATUS -->
                    <td style="text-align: center;">
                        <span class="${statusClass}" style="padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; ${category.is_active ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                            ${statusText}
                        </span>
                    </td>
                    
                    <!-- ACTIONS -->
                    <td style="text-align: center;">
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <button class="categories-edit-btn" onclick="window.editCategory(${category.id})" style="background: #ff4d8d; border: none; width: 36px; height: 36px; border-radius: 10px; color: white; cursor: pointer;">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="categories-delete-btn" onclick="window.deleteCategory(${category.id})" style="background: #dc3545; border: none; width: 36px; height: 36px; border-radius: 10px; color: white; cursor: pointer;">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        console.log("✅ Categories loaded successfully, total:", categories.length);
        
    } catch (error) {
        console.error("❌ Error loading categories:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: red;">
                    <i class="fa-solid fa-circle-exclamation fa-2x mb-2"></i>
                    <p>Error loading categories: ${error.message}</p>
                    <button class="btn btn-primary btn-sm" onclick="window.loadCategories()">
                        <i class="fa-solid fa-refresh"></i> Try Again
                    </button>
                </td>
            </tr>
        `;
    }
};

// ==========================================
// 🆕 SHOW ADD CATEGORY MODAL (FIXED)
// ==========================================

window.showAddCategoryModal = function() {
    console.log("🔄 showAddCategoryModal() called");
    
    window.editingCategoryId = null;
    
    const modalTitle = document.getElementById("categoryModalTitle");
    const nameInput = document.getElementById("categoryName");
    const iconInput = document.getElementById("categoryIcon");
    const imageInput = document.getElementById("categoryImage");
    const modal = document.getElementById("categoryModal");
    
    if (modalTitle) modalTitle.innerText = "Add New Category";
    if (nameInput) nameInput.value = "";
    if (iconInput) iconInput.value = "";
    if (imageInput) imageInput.value = "";
    
    // ✅ FIX: Proper modal display with all styles
    if (modal) {
        modal.style.display = "flex";
        modal.style.visibility = "visible";
        modal.style.opacity = "1";
        modal.style.zIndex = "999999";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        console.log("✅ Add Category Modal opened");
    } else {
        console.error("❌ Category modal element not found!");
    }
};

// ==========================================
// CLOSE CATEGORY MODAL
// ==========================================

window.closeCategoryModal = function() {
    console.log("🔄 closeCategoryModal() called");
    
    const modal = document.getElementById("categoryModal");
    if (modal) {
        modal.style.display = "none";
        console.log("✅ Category Modal closed");
    }
};

// ==========================================
// 🆕 EDIT CATEGORY (FIXED)
// ==========================================

window.editCategory = async function(id) {
    console.log("🔄 editCategory() called for id:", id);
    
    try {
        const response = await fetch("/api/categories/");
        const categories = await response.json();
        const category = categories.find(cat => cat.id == id);
        
        if (!category) {
            window.showToastNotification("Category not found", "error");
            return;
        }
        
        window.editingCategoryId = id;
        
        const modalTitle = document.getElementById("categoryModalTitle");
        const nameInput = document.getElementById("categoryName");
        const iconInput = document.getElementById("categoryIcon");
        const modal = document.getElementById("categoryModal");
        
        if (modalTitle) modalTitle.innerText = "Edit Category";
        if (nameInput) nameInput.value = category.name;
        if (iconInput) iconInput.value = category.icon || "";
        
        // ✅ FIX: Proper modal display with all styles
        if (modal) {
            modal.style.display = "flex";
            modal.style.visibility = "visible";
            modal.style.opacity = "1";
            modal.style.zIndex = "999999";
            modal.style.alignItems = "center";
            modal.style.justifyContent = "center";
            console.log("✅ Edit Category Modal opened for:", category.name);
        }
        
    } catch (error) {
        console.error("❌ Edit Error:", error);
        window.showToastNotification("Error loading category", "error");
    }
};

// ==========================================
// SAVE CATEGORY
// ==========================================

window.saveCategory = async function() {
    console.log("🔄 saveCategory() called");
    
    const nameInput = document.getElementById("categoryName");
    const iconInput = document.getElementById("categoryIcon");
    const imageInput = document.getElementById("categoryImage");
    
    if (!nameInput || !nameInput.value.trim()) {
        window.showToastNotification("Category name is required", "error");
        return;
    }
    
    const formData = new FormData();
    formData.append("name", nameInput.value.trim());
    formData.append("icon", iconInput ? iconInput.value : "");
    
    const imageFile = imageInput ? imageInput.files[0] : null;
    if (imageFile) {
        formData.append("image", imageFile);
    }
    
    let url = "/api/categories/add/";
    if (window.editingCategoryId) {
        url = `/api/categories/update/${window.editingCategoryId}/`;
    }
    
    // Disable save button
    const saveBtn = document.querySelector('.categories-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "X-CSRFToken": window.getCookie("csrftoken")
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (result.status === "ok") {
            window.showToastNotification("✅ Category Saved Successfully!", "success");
            window.closeCategoryModal();
            setTimeout(() => {
                window.loadCategories();
            }, 300);
        } else {
            window.showToastNotification("❌ Error: " + (result.error || "Unknown error"), "error");
        }
    } catch (error) {
        console.error("❌ Save Error:", error);
        window.showToastNotification("❌ Network error! Please try again.", "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save';
        }
    }
};

// ==========================================
// DELETE CATEGORY
// ==========================================

window.deleteCategory = async function(id) {
    console.log("🔄 deleteCategory() called for id:", id);
    
    const confirmDelete = confirm("⚠️ Are you sure you want to delete this category?\n\nThis action cannot be undone!");
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`/api/categories/delete/${id}/`, {
            method: "DELETE",
            headers: {
                "X-CSRFToken": window.getCookie("csrftoken")
            }
        });
        
        const result = await response.json();
        
        if (result.status === "ok") {
            window.showToastNotification("🗑 Category Deleted Successfully!", "success");
            setTimeout(() => {
                window.loadCategories();
            }, 300);
        } else {
            window.showToastNotification("❌ Error: " + (result.error || "Unknown error"), "error");
        }
    } catch (error) {
        console.error("❌ Delete Error:", error);
        window.showToastNotification("❌ Network error! Please try again.", "error");
    }
};

// ==========================================
// CLICK OUTSIDE MODAL TO CLOSE
// ==========================================

document.addEventListener('click', function(event) {
    const modal = document.getElementById('categoryModal');
    if (modal && modal.style.display === 'flex') {
        if (event.target === modal) {
            window.closeCategoryModal();
        }
    }
});

// ==========================================
// ESC KEY TO CLOSE MODAL
// ==========================================

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('categoryModal');
        if (modal && modal.style.display === 'flex') {
            window.closeCategoryModal();
        }
    }
});

// ==========================================
// ADD CSS ANIMATION IF NOT EXISTS
// ==========================================

if (!document.querySelector('#category-toast-animation')) {
    const style = document.createElement('style');
    style.id = 'category-toast-animation';
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// AUTO LOAD CATEGORIES WHEN PAGE READY
// ==========================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            if (document.getElementById('categoriesTableBody') && typeof window.loadCategories === 'function') {
                window.loadCategories();
                console.log("✅ Categories Auto Loaded on DOMContentLoaded");
            }
        }, 500);
    });
} else {
    setTimeout(() => {
        if (document.getElementById('categoriesTableBody') && typeof window.loadCategories === 'function') {
            window.loadCategories();
            console.log("✅ Categories Auto Loaded");
        }
    }, 500);
}

console.log("✅ categories.js loaded successfully");