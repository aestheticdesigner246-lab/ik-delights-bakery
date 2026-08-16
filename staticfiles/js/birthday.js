// Remove duplicate WhatsApp button from product cards
function removeWhatsappFromCards() {
    document.querySelectorAll('.product-card .product-info').forEach(info => {
        const allButtons = info.querySelectorAll('button, a');
        allButtons.forEach(btn => {
            if (btn.classList && btn.classList.contains('add-to-cart-btn')) return;
            const hasWhatsappIcon = btn.querySelector('.fa-whatsapp');
            const hasWhatsappText = btn.textContent.toLowerCase().includes('whatsapp');
            const isWhatsappLink = btn.href && btn.href.includes('wa.me');
            if (hasWhatsappIcon || hasWhatsappText || isWhatsappLink) {
                btn.remove();
            }
        });
    });
}

// Render birthday products (fallback if ik.js renderCategoryProducts missing)
function renderBirthdayProductsFallback() {
    const container = document.getElementById('category-products');
    if (!container) return;

    const allProducts = JSON.parse(localStorage.getItem('ik_admin_products') || '[]');
    const birthdayProducts = allProducts.filter(p => p.category === 'birthday');

    if (birthdayProducts.length === 0) {
        const defaultProducts = [
            { id: 1, name: 'Classic Chocolate Cake', price: 1200, description: 'Rich chocolate layers with chocolate ganache.', image: 'https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?w=400&q=80', category: 'birthday' },
            { id: 2, name: 'Red Velvet Elegance', price: 1350, description: 'Velvety red cake with cream cheese frosting.', image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=400&q=80', category: 'birthday' },
            { id: 3, name: 'Vanilla Dream', price: 1100, description: 'Classic vanilla sponge with buttercream.', image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&q=80', category: 'birthday' }
        ];
        container.innerHTML = defaultProducts.map(p => `
            <div class="product-card">
                <div class="product-img">
                    <img src="${p.image}" alt="${p.name}">
                    <div class="action-buttons">
                        <button class="action-btn favorite" onclick="event.stopPropagation(); handleFavoriteClick(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.image}')">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="action-btn share" onclick="event.stopPropagation(); openShareModal({id:${p.id}, name:'${p.name.replace(/'/g, "\\'")}', image:'${p.image}'})">
                            <i class="fas fa-share-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">Rs ${p.price}</div>
                    <div class="product-description">${p.description}</div>
                    <button class="add-to-cart-btn" onclick="addToCart({id:${p.id}, name:'${p.name.replace(/'/g, "\\'")}', price:${p.price}})">Add to Cart</button>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = birthdayProducts.map(p => `
            <div class="product-card">
                <div class="product-img">
                    <img src="${p.image}" alt="${p.name}">
                    <div class="action-buttons">
                        <button class="action-btn favorite" onclick="event.stopPropagation(); handleFavoriteClick(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${p.image}')">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="action-btn share" onclick="event.stopPropagation(); openShareModal({id:${p.id}, name:'${p.name.replace(/'/g, "\\'")}', image:'${p.image}'})">
                            <i class="fas fa-share-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="product-info">
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">Rs ${p.price}</div>
                    <div class="product-description">${p.description || 'Delicious birthday cake'}</div>
                    <button class="add-to-cart-btn" onclick="addToCart({id:${p.id}, name:'${p.name.replace(/'/g, "\\'")}', price:${p.price}})">Add to Cart</button>
                </div>
            </div>
        `).join('');
    }
    removeWhatsappFromCards();
}

// Announcement strip messages
const annMsgs = ['🎂 Baked with love — IK Delights', '✨ Freshly baked every morning', '🚚 Free delivery above Rs 2,000'];
const track = document.getElementById('ann-track');
if (track) track.innerHTML = [...annMsgs, ...annMsgs].map(m => `<span>${m}</span>`).join('');

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
    if (typeof renderCategoryProducts === 'function') {
        const originalRender = renderCategoryProducts;
        window.renderCategoryProducts = function(cat) {
            originalRender(cat);
            setTimeout(removeWhatsappFromCards, 50);
        };
        renderCategoryProducts('birthday');
    } else {
        renderBirthdayProductsFallback();
    }

    // Re-run when admin updates products via localStorage
    window.addEventListener('storage', function(e) {
        if (e.key === 'ik_admin_products') {
            if (typeof renderCategoryProducts === 'function') {
                renderCategoryProducts('birthday');
                setTimeout(removeWhatsappFromCards, 100);
            } else {
                renderBirthdayProductsFallback();
            }
        }
    });

    setTimeout(removeWhatsappFromCards, 200);
});