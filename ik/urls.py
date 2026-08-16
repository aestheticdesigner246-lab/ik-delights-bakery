from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth.views import LoginView, LogoutView, PasswordChangeView, PasswordChangeDoneView
from . import views

urlpatterns = [
    # ========== ADMIN PANEL ==========
    path('admin/dashboard/', views.admin_dashboard, name='admin-dashboard'),
    path('admin/live-dashboard/', views.live_dashboard_data, name='live-dashboard'),
    path('admin/live-notifications/', views.live_notifications, name='live_notifications'),
    path('admin/live-messages/', views.live_messages, name='live_messages'),
    path('admin/live-events/', views.live_events, name='live_events'),
    path('admin/orders/', views.orders_page, name='admin-orders'),
    path('admin/update-order-status/<int:order_id>/', views.update_order_status, name='update_order_status'),
    path('admin/update-payment-status/<int:order_id>/', views.update_payment_status, name='update_payment_status'),
    path('admin/products/', views.products_page, name='admin-products'),
    path('admin/events/', views.events_page, name='admin-events'),
    path('admin/deals/', views.deals_page, name='admin-deals'),
    path('admin/messages/', views.messages_page, name='admin-messages'),
    
    # ========== GALLERY URLs (FIXED) ==========
    path('admin/gallery/', views.gallery_page, name='admin-gallery'),
    path('admin/gallery/add/', views.add_gallery_image, name='add_gallery_image'),
    path('admin/gallery/delete/<int:image_id>/', views.delete_gallery_image, name='delete_gallery_image'),
    path('admin/gallery/edit/<int:image_id>/', views.edit_gallery_image, name='edit_gallery_image'),
    
    # ========== ANNOUNCEMENT URLs (FIXED) ==========
    path('admin/announcements/', views.announcements_page, name='admin-announcements'),
    path('admin/announcements/add/', views.add_announcement, name='add_announcement'),
    path('admin/announcements/update/<int:ann_id>/', views.update_announcement, name='update_announcement'),
    path('admin/announcements/delete/<int:ann_id>/', views.delete_announcement, name='delete_announcement'),
    
    path('admin/customers/', views.customers_page, name='admin-customers'),
    path('admin/whatsapp-orders/', views.whatsapp_orders_page, name='admin-whatsapp-orders'),
    path('admin/convert-whatsapp-order/<int:lead_id>/', views.convert_whatsapp_to_order, name='convert_whatsapp_to_order'),
    path('admin/categories/', views.categories_page, name='admin-categories'),
    path('admin/reports/', views.reports_page, name='admin-reports'),
    path('admin/settings/', views.settings_page, name='admin-settings'),
    path('admin/reports/pdf/', views.reports_pdf, name='reports-pdf'),
    path('admin/reviews/', views.reviews_page, name='admin-reviews'),
    path('admin/customers/delete/<int:customer_id>/', views.delete_customer, name='delete-customer'),
    path('admin/customers/update/<int:customer_id>/', views.update_customer, name='update-customer'),
    path('admin/settings/save/', views.save_settings, name='save_settings'),
    path('admin/', admin.site.urls),
    path('admin/event-orders-json/', views.admin_event_orders_json, name='admin_event_orders_json'),

    # ========== PUBLIC PAGES ==========
    path('', views.home, name='home'),
    path('track/', views.order_tracking_page, name='order_tracking'),
    path('checkout/', views.checkout_page, name='checkout_page'),
    path('customize/', views.customize_order, name='customize_order'),
    path('cart/', views.checkout_page, name='cart'),
    path('event-planner/', views.event_planner_page, name='event_planner'),
    path('deals/', views.deals_view, name='deals'),

    # ========== USER AUTHENTICATION ==========
    path('signup/', views.register, name='signup'),
    path('login/', LoginView.as_view(template_name='login.html'), name='login'),
    path('logout/', LogoutView.as_view(next_page='/'), name='logout'),
    path('profile/', views.profile_view, name='profile'),
    path('profile/update/', views.update_profile, name='update_profile'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('password-change/', PasswordChangeView.as_view(template_name='change_password.html'), name='password_change'),
    path('password-change/done/', PasswordChangeDoneView.as_view(template_name='change_password_done.html'), name='password_change_done'),
    path('ajax-login/', views.ajax_login, name='ajax_login'),
    path('ajax-register/', views.ajax_register, name='ajax_register'),

    # ========== PROFILE & MODALS ==========
    path('api/profile/update/', views.update_profile_ajax, name='update_profile_ajax'),
    path('api/password/change/', views.change_password_ajax, name='change_password_ajax'),
    path('profile/modal-content/', views.profile_modal_content, name='profile_modal_content'),

    # ========== CATEGORY & PRODUCT ==========
    path('category/<slug:category_slug>/', views.category_detail, name='category_detail'),
    path('product/<slug:slug>/', views.product_detail, name='product_detail'),
    path('invoice/<int:order_id>/', views.invoice_page, name='invoice_page'),
    path('invoice/<int:order_id>/pdf/', views.download_invoice_pdf, name='download_invoice_pdf'),

    # ========== PRODUCTS API ==========
    path('api/products/', views.get_products, name='get_products'),
    path('api/products/add/', views.add_product, name='add_product'),
    path('api/products/update/<int:id>/', views.update_product, name='update_product'),
    path('api/products/delete/<int:id>/', views.delete_product, name='delete_product'),

   # ========== DEALS API ==========
path('api/deals/', views.get_deals_api, name='get_deals'),

path(
    'grab-deal/<int:deal_id>/',
    views.grab_deal_whatsapp,
    name='grab_deal_whatsapp'
),

path('api/deals/add/', views.add_deal_api, name='add-deal-api'),
path('api/deals/update/<int:deal_id>/', views.update_deal_api, name='update-deal-api'),
path('api/deals/delete/<int:deal_id>/', views.delete_deal_api, name='delete-deal-api'),
path('api/featured-deal/', views.get_featured_deal_api, name='get_featured_deal'),

   # ========== EVENTS API ==========
path('api/events-management/', views.get_events_management, name='events_management'),
path('api/update-event-status/<int:event_id>/', views.update_event_status, name='update_event_status'),
path('api/delete-event/<int:event_id>/', views.delete_event, name='delete_event'),
path('api/event-planner/', views.event_planner_api, name='event_planner_api'),

path('api/save-event-planner-order/', views.save_event_planner_order, name='save_event_planner_order'),

path('api/submit-event-package/', views.submit_event_package, name='submit_event_package'),
    # ========== CART API ==========
    path('api/cart/', views.cart_api, name='get_cart'),
    path('api/cart/add/', views.add_to_cart, name='add_to_cart'),
    path('api/cart/update/', views.update_cart_item, name='update_cart'),
    path('api/cart/remove/', views.remove_from_cart, name='remove_from_cart'),

    # ========== ORDER API ==========
    path('api/order/place/', views.place_order, name='place_order'),
    path('api/order/confirm/', views.confirm_payment, name='confirm_payment'),
    path('api/order/<str:order_id>/', views.get_order, name='get_order'),
    path('api/order/<int:order_id>/confirm-advance/', views.confirm_advance_payment, name='confirm_advance_payment'),
    path('api/order/<int:order_id>/confirm-remaining/', views.confirm_remaining_payment, name='confirm_remaining_payment'),
    path('api/order/<int:order_id>/payment-details/', views.get_order_payment_details, name='order_payment_details'),
    path('api/order/<int:order_id>/pay-remaining/', views.pay_remaining_amount, name='pay_remaining_amount'),

    # ========== REVIEWS API ==========
    path('api/reviews/', views.get_reviews, name='get_reviews'),
    path('api/reviews/submit/', views.submit_review, name='submit_review'),
    path('api/reviews/delete/<int:review_id>/', views.delete_review, name='delete_review'),
    path('api/reviews/update/<int:review_id>/', views.update_review, name='update_review'),

    # ========== FAVORITES API ==========
    path('api/favorites/', views.get_favorites, name='get_favorites'),
    path('api/favorites/toggle/', views.toggle_favorite, name='toggle_favorite'),

    # ========== CATEGORIES API ==========
    path('api/categories/', views.get_categories, name='get_categories'),
    path('api/categories/add/', views.add_category, name='add_category'),
    path('api/categories/update/<int:category_id>/', views.update_category, name='update_category'),
    path('api/categories/delete/<int:category_id>/', views.delete_category, name='delete_category'),

    # ========== CONTACT & WHATSAPP ==========
    path('contact/submit/', views.contact_submit, name='contact_submit'),
    path('api/delete-message/<int:message_id>/', views.delete_message, name='delete_message'),
    path('api/add-whatsapp/', views.add_whatsapp_number, name='add_whatsapp_number'),

    # ========== SMART BAKING ASSISTANT ==========
    path('api/baking-assistant/', views.baking_assistant, name='baking_assistant'),
    path('api/select-deal/', views.select_deal, name='select_deal'),
]

# STATIC & MEDIA FILES
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)