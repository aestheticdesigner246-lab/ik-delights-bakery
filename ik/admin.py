from django.contrib import admin
from django.utils.html import format_html
from urllib.parse import quote
from django.utils.safestring import mark_safe

from .models import (
    Category, Product, Order, Review, Gallery, FlashSale,
    Deal, ContactMessage, Announcement, Profile, HomepageSettings,
    EventChatSession, BakingInquiry, DealProduct, WhatsAppNumber,
    EventBooking,
    EventInquiry,
    EventOrder,
)

# ========== BASIC REGISTRATIONS ==========
admin.site.register(Category)
admin.site.register(Review)
admin.site.register(Gallery)
admin.site.register(FlashSale)


# ========== PRODUCT ADMIN ==========
@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'product_type', 'price', 'slug', 'is_active')
    list_filter = ('category', 'product_type', 'is_active')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    fields = ('name', 'slug', 'category', 'product_type', 'price', 'description', 'image', 'is_active')


# ========== EVENT BOOKING ADMIN ==========
@admin.register(EventBooking)
class EventBookingAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'customer_name', 'event_type', 'guests', 'budget_display',
        'total_price_display', 'status', 'created_date', 'whatsapp_btn'
    )
    list_filter = ('status', 'event_type', 'created_at')
    search_fields = ('customer_name', 'phone', 'address')
    list_editable = ('status',)
    readonly_fields = ('created_at', 'total_price', 'selected_deal_preview')
    
    fieldsets = (
        ('Customer Information', {'fields': ('customer_name', 'phone', 'address')}),
        ('Event Details', {'fields': ('event_type', 'guests', 'budget', 'total_price', 'status')}),
        ('Cake Customization', {'fields': ('cake_size', 'cake_flavor', 'extras'), 'classes': ('collapse',)}),
        ('Selected Package', {'fields': ('selected_deal_preview',), 'classes': ('wide',)}),
        ('System Info', {'fields': ('created_at',), 'classes': ('collapse',)}),
    )
    
    def budget_display(self, obj):
        return f"Rs {obj.budget:,.0f}" if obj.budget else "-"
    budget_display.short_description = "Budget"
    
    def total_price_display(self, obj):
        return f"Rs {float(obj.total_price):,.0f}" if obj.total_price else "-"
    total_price_display.short_description = "Total Price"
    
    def created_date(self, obj):
        return obj.created_at.strftime("%d %b %Y")
    created_date.short_description = "Date"
    
    def selected_deal_preview(self, obj):
        if not obj.selected_deal:
            return "No package selected"
        try:
            import json
            deal = json.loads(obj.selected_deal) if isinstance(obj.selected_deal, str) else obj.selected_deal
            html = '<div style="background:#f5f5f5; padding:12px; border-radius:8px;">'
            html += f'<h4 style="margin:0 0 10px 0;">📦 {deal.get("name", "Package")}</h4>'
            html += f'<p><strong>💰 Total:</strong> Rs {deal.get("total_selling", 0):,.0f}</p>'
            items = deal.get('items', [])
            if items:
                html += '<table style="width:100%; border-collapse:collapse;">'
                html += '<tr style="background:#e0e0e0;"><th>Product</th><th>Qty</th><th>Price</th></tr>'
                for item in items:
                    html += f'<tr><td style="padding:5px;">{item.get("product", "-")}</td>'
                    html += f'<td style="padding:5px;">{item.get("quantity", "-")}</td>'
                    html += f'<td style="padding:5px;">Rs {item.get("customer_price", 0):,.0f}</td></tr>'
                html += '</table>'
            html += '</div>'
            return mark_safe(html)
        except Exception:
            return "Package details unavailable"
    selected_deal_preview.short_description = "Package Details"
    
    def _format_phone(self, phone):
        if not phone:
            return None
        import re
        digits = re.sub(r"\D", "", str(phone))
        if len(digits) < 10:
            return None
        if digits.startswith("0"):
            digits = "92" + digits[1:]
        if not digits.startswith("92"):
            digits = "92" + digits
        return digits
    
    def whatsapp_btn(self, obj):
        phone = self._format_phone(obj.phone)
        if not phone:
            return format_html('<span style="color:red;">❌ No phone</span>')
        message = f"""🎉 *IK Delights - Event Booking Confirmation* 🎉

👤 *Customer:* {obj.customer_name}
📋 *Event:* {obj.event_type}
👥 *Guests:* {obj.guests}
💰 *Budget:* Rs {obj.budget:,.0f}
🍰 *Cake:* {obj.cake_size} - {obj.cake_flavor}

📦 *Selected Package:* Selected Package
💵 *Total Price:* Rs {float(obj.total_price):,.0f}

📍 *Address:* {obj.address}

Thank you for choosing IK Delights! 🎂
For any query, reply here."""
        wa_link = f"https://wa.me/{phone}?text={quote(message)}"
        return format_html(
            '<a href="{}" target="_blank" style="background:#25D366; color:white; padding:5px 12px; border-radius:5px; text-decoration:none; display:inline-block;">💬 WhatsApp Customer</a>',
            wa_link
        )
    whatsapp_btn.short_description = "WhatsApp"
    
    actions = ['mark_as_confirmed', 'mark_as_completed', 'send_whatsapp_bulk']
    
    def mark_as_confirmed(self, request, queryset):
        updated = queryset.update(status='Confirmed')
        self.message_user(request, f'✅ {updated} event(s) marked as Confirmed.')
    mark_as_confirmed.short_description = "Mark selected as Confirmed"
    
    def mark_as_completed(self, request, queryset):
        updated = queryset.update(status='Completed')
        self.message_user(request, f'✅ {updated} event(s) marked as Completed.')
    mark_as_completed.short_description = "Mark selected as Completed"
    
    def send_whatsapp_bulk(self, request, queryset):
        for obj in queryset:
            phone = self._format_phone(obj.phone)
            if phone:
                msg = f"Hi {obj.customer_name}, your event booking for {obj.event_type} is {obj.status}. Total: Rs {float(obj.total_price):,.0f}"
                wa_link = f"https://wa.me/{phone}?text={quote(msg)}"
                self.message_user(request, f'<a href="{wa_link}" target="_blank">📲 WhatsApp {obj.customer_name}</a>', extra_tags='safe')
    send_whatsapp_bulk.short_description = "Generate WhatsApp links for selected events"


# ========== ORDER ADMIN (website orders) ==========
@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'phone', 'event_type_display', 'total', 'status', 'payment_status', 'payment_verified_badge', 'created_at', 'whatsapp_button', 'invoice_preview')
    list_filter = ('status', 'payment_status', 'payment_verified', 'created_at')
    search_fields = ('name', 'phone', 'id', 'transaction_id')
    readonly_fields = ('created_at', 'payment_screenshot_preview', 'ip_address', 'user_agent', 'verified_at')
    list_editable = ('status', 'payment_status')

    def payment_screenshot_preview(self, obj):
        if obj.payment_screenshot:
            return format_html('<a href="{0}" target="_blank"><img src="{0}" style="max-height:300px; border-radius:10px; border:2px solid #ddd;" /></a>', obj.payment_screenshot.url)
        return "No Screenshot"
    payment_screenshot_preview.short_description = "Payment Screenshot"

    def payment_verified_badge(self, obj):
        if obj.payment_verified:
            return format_html('<span style="color:green; font-weight:bold;">✅ Verified</span>')
        return format_html('<span style="color:red; font-weight:bold;">❌ Pending</span>')
    payment_verified_badge.short_description = "Verification"
    
    def event_type_display(self, obj):
        if obj.customization and isinstance(obj.customization, dict):
            return obj.customization.get('event_type', '-')
        return '-'
    event_type_display.short_description = "Event Type"
    
    def _format_phone(self, phone):
        if not phone:
            return None
        import re
        digits = re.sub(r"\D", "", str(phone))
        if len(digits) < 10:
            return None
        if digits.startswith("0"):
            digits = "92" + digits[1:]
        if not digits.startswith("92"):
            digits = "92" + digits
        return digits
    
    def whatsapp_button(self, obj):
        phone = self._format_phone(obj.phone)
        if not phone:
            return format_html('<span style="color:red;">Invalid number</span>')
        from .views import generate_invoice_text
        try:
            invoice_text = generate_invoice_text(obj)
            wa_link = f"https://wa.me/{phone}?text={quote(invoice_text)}"
        except Exception:
            lines = [f"🎂 *IK Delights Order #{obj.id}*", f"👤 Name: {obj.name}", f"📞 Phone: {obj.phone}", f"📍 Address: {(obj.address or '')[:80]}", "", "*Items:*"]
            for item in obj.items.all():
                lines.append(f"• {item.product_name} x{item.quantity} = Rs {item.product_price * item.quantity:.2f}")
            lines.extend(["", f"💰 *Total: Rs {obj.total:.2f}*", f"💳 Payment: {obj.payment_method}", f"📦 Status: {obj.status}", "", "Thank you for choosing IK Delights! ❤️"])
            message = "\n".join(lines)
            wa_link = f"https://wa.me/{phone}?text={quote(message)}"
        return format_html('<a href="{}" target="_blank" style="background:#25D366; color:white; padding:6px 12px; border-radius:5px; text-decoration:none;">💬 WhatsApp</a>', wa_link)
    whatsapp_button.short_description = "WhatsApp"
    
    def invoice_preview(self, obj):
        from .views import generate_invoice_text
        try:
            invoice_text = generate_invoice_text(obj)
            return format_html('<details style="cursor:pointer;"><summary>📄 Preview Invoice</summary><pre style="background:#f5f5f5; padding:5px; margin:0; white-space:pre-wrap; font-size:11px;">{}</pre></details>', invoice_text)
        except Exception as e:
            return format_html('<span style="color:red;">Error: {}</span>', str(e))
    invoice_preview.short_description = "Invoice"
    
    actions = ['send_whatsapp_selected']
    def send_whatsapp_selected(self, request, queryset):
        for order in queryset:
            phone = self._format_phone(order.phone)
            if phone:
                msg = f"Order #{order.id} total: Rs {order.total}. Status: {order.status}"
                wa_link = f"https://wa.me/{phone}?text={quote(msg)}"
                self.message_user(request, f'<a href="{wa_link}" target="_blank">📲 WhatsApp {order.name}</a>', extra_tags='safe')
    send_whatsapp_selected.short_description = "Generate WhatsApp links for selected orders"


# ========== PROFILE ADMIN ==========
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'phone', 'city', 'address', 'created_at', 'order_count')
    list_filter = ('city', 'created_at')
    search_fields = ('user__username', 'user__email', 'phone', 'city', 'address')
    readonly_fields = ('created_at', 'updated_at')
    
    def order_count(self, obj):
        return obj.user.order_set.count() if hasattr(obj.user, 'order_set') else 0
    order_count.short_description = "Total Orders"
    
    fieldsets = (
        ('User Information', {'fields': ('user',)}),
        ('Contact Details', {'fields': ('phone', 'city', 'address')}),
        ('Metadata', {'fields': ('created_at', 'updated_at')}),
    )


# ========== DEAL PRODUCT INLINE ==========
class DealProductInline(admin.TabularInline):
    model = DealProduct
    extra = 1
    fields = ('product_name', 'quantity', 'cost_price', 'selling_price')
    readonly_fields = ('profit_on_item',)
    
    def profit_on_item(self, obj):
        if obj.selling_price and obj.cost_price:
            profit = obj.selling_price - obj.cost_price
            return format_html('<span style="color:green;">+{}</span>', profit)
        return '-'
    profit_on_item.short_description = "Profit (Rs)"


# ========== DEAL ADMIN ==========
@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display = ('title', 'total_selling_price', 'total_cost_price', 'is_active', 'sort_order', 'expiry')
    list_filter = ('is_active', 'sort_order')
    search_fields = ('title',)
    list_editable = ('sort_order', 'is_active')
    inlines = [DealProductInline]
    fieldsets = (
        ('Basic Info', {'fields': ('title', 'subtitle', 'image', 'is_active', 'sort_order', 'expiry')}),
        ('Pricing (Manual Override)', {'fields': ('original_price', 'deal_price'), 'classes': ('collapse',)}),
    )
    readonly_fields = ('total_selling_price', 'total_cost_price')
    
    def total_selling_price(self, obj):
        total = sum(dp.selling_price for dp in obj.deal_products.all())
        return f"Rs {total:.2f}" if total else "-"
    total_selling_price.short_description = "Total Selling Price"
    
    def total_cost_price(self, obj):
        total = sum(dp.cost_price for dp in obj.deal_products.all())
        return f"Rs {total:.2f}" if total else "-"
    total_cost_price.short_description = "Total Cost Price"


# ========== WHATSAPP NUMBER ADMIN ==========
@admin.register(WhatsAppNumber)
class WhatsAppNumberAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'phone_number', 'verified', 'created_at')
    list_filter = ('verified', 'created_at')
    search_fields = ('phone_number', 'user__username', 'session_key')
    readonly_fields = ('created_at',)
    
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)


# ========== ANNOUNCEMENT ADMIN ==========
@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ('text', 'is_active', 'order', 'created_at')
    list_editable = ('is_active', 'order')
    list_filter = ('is_active', 'created_at')
    search_fields = ('text',)
    ordering = ('order', '-created_at')
    fieldsets = ((None, {'fields': ('text', 'link', 'is_active', 'order')}),)


# ========== CONTACT MESSAGE ADMIN ==========
@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'phone', 'status', 'created_at', 'is_read', 'whatsapp_button', 'notification_button')
    list_filter = ('status', 'is_read', 'created_at')
    search_fields = ('name', 'email', 'phone', 'message')
    ordering = ('-created_at',)
    list_editable = ('status', 'is_read')
    actions = ['mark_as_read', 'mark_as_replied', 'mark_as_resolved']
    fieldsets = (
        ('Customer Info', {'fields': ('name', 'email', 'phone')}),
        ('Message', {'fields': ('message',)}),
        ('Admin Notes', {'fields': ('status', 'is_read')}),
    )
    readonly_fields = ('created_at',)
    
    def _clean_phone(self, phone):
        if not phone: return None
        import re
        digits = re.sub(r"\D", "", str(phone))
        if len(digits) < 10: return None
        if digits.startswith('0'): digits = '92' + digits[1:]
        if not digits.startswith('92'): digits = '92' + digits
        return digits
    
    def whatsapp_button(self, obj):
        phone = self._clean_phone(obj.phone)
        if not phone:
            return format_html('<span style="color:red;">Invalid number</span>')
        changed = False
        if not obj.is_read:
            obj.is_read = True
            changed = True
        if obj.status == 'pending':
            obj.status = 'replied'
            changed = True
        if changed:
            obj.save(update_fields=['is_read', 'status'])
        wa_text = f"Hi {obj.name}, I received your message: {obj.message[:80]}... How can I help you?"
        wa_link = f"https://wa.me/{phone}?text={quote(wa_text)}"
        return format_html('<a href="{}" target="_blank" style="background:#25D366; color:white; padding:5px 10px; border-radius:5px;">💬 WhatsApp Chat</a>', wa_link)
    whatsapp_button.short_description = "WhatsApp"
    
    def notification_button(self, obj):
        phone = self._clean_phone(obj.phone)
        if not phone:
            return format_html('<span style="color:red;">Invalid</span>')
        if obj.status == 'replied':
            msg = f"Hi {obj.name}, we have replied to your query."
        elif obj.status == 'resolved':
            msg = f"Hi {obj.name}, your issue has been resolved. Thank you!"
        else:
            msg = f"Hi {obj.name}, your message has been received. We will get back soon."
        wa_link = f"https://wa.me/{phone}?text={quote(msg)}"
        return format_html('<a href="{}" target="_blank" style="background:#128C7E; color:white; padding:3px 8px; border-radius:5px;">📩 Notify</a>', wa_link)
    notification_button.short_description = "Notify"
    
    def mark_as_read(self, request, queryset):
        updated = queryset.update(is_read=True)
        self.message_user(request, f'{updated} message(s) marked as read.')
    mark_as_read.short_description = "Mark selected as read"
    
    def mark_as_replied(self, request, queryset):
        updated = queryset.update(status='replied')
        self.message_user(request, f'{updated} message(s) marked as replied.')
    mark_as_replied.short_description = "Mark as Replied"
    
    def mark_as_resolved(self, request, queryset):
        updated = queryset.update(status='resolved')
        self.message_user(request, f'{updated} message(s) marked as resolved.')
    mark_as_resolved.short_description = "Mark as Resolved"


# ========== HOMEPAGE SETTINGS ADMIN ==========
@admin.register(HomepageSettings)
class HomepageSettingsAdmin(admin.ModelAdmin):
    fieldsets = (('Sweet Creations Section', {'fields': ('sweet_creations_title', 'sweet_creations_subtitle', 'show_section')}),)
    def has_add_permission(self, request):
        return not self.model.objects.exists()
    def has_delete_permission(self, request, obj=None):
        return False


# ========== EVENT CHATBOT SESSION ADMIN ==========
@admin.register(EventChatSession)
class EventChatSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'session_key', 'created_at', 'updated_at', 'completed', 'answer_count')
    list_filter = ('completed', 'created_at')
    search_fields = ('user__username', 'session_key')
    readonly_fields = ('created_at', 'updated_at', 'answers_display')
    fieldsets = (
        ('Session Info', {'fields': ('user', 'session_key', 'completed', 'created_at', 'updated_at')}),
        ('Answers', {'fields': ('answers_display',)}),
    )
    def answer_count(self, obj):
        return len(obj.answers) if obj.answers else 0
    answer_count.short_description = "Answers Count"
    def answers_display(self, obj):
        if not obj.answers:
            return "No answers yet."
        html = "<table style='border-collapse: collapse; width: 100%;'>"
        for qid, ans in obj.answers.items():
            html += f"<tr><td style='border:1px solid #ddd; padding:6px;'><strong>{qid}</strong><tr><td style='border:1px solid #ddd; padding:6px;'>{ans}</td></tr>"
        html += "</table>"
        return format_html(html)
    answers_display.short_description = "Conversation Answers"


# ========== BAKING INQUIRY ADMIN ==========
@admin.register(BakingInquiry)
class BakingInquiryAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'session_key', 'created_at', 'completed', 'deal_summary', 'payment_status', 'order_link')
    list_filter = ('completed', 'payment_status', 'created_at')
    search_fields = ('user__username', 'session_key', 'transaction_id')
    readonly_fields = ('created_at', 'answers', 'reference_image', 'selected_deal_display', 'transaction_id', 'payment_status', 'order_link')
    fieldsets = (
        ('Inquiry Info', {'fields': ('user', 'session_key', 'created_at', 'completed')}),
        ('Customer Answers', {'fields': ('answers',)}),
        ('Selected Deal', {'fields': ('selected_deal_display',)}),
        ('Payment & Order', {'fields': ('transaction_id', 'payment_status', 'order_link')}),
        ('Reference Image', {'fields': ('reference_image',)}),
    )
    def deal_summary(self, obj):
        if not obj.selected_deal:
            return '-'
        name = obj.selected_deal.get('name', 'Deal')
        price = obj.selected_deal.get('total_selling', obj.selected_deal.get('price', 0))
        return f"{name} - PKR {price}"
    deal_summary.short_description = "Selected Deal"
    def selected_deal_display(self, obj):
        if not obj.selected_deal:
            return "No deal selected yet."
        deal = obj.selected_deal
        name = deal.get('name', 'Deal')
        total_selling = deal.get('total_selling', deal.get('price', 0))
        total_cost = deal.get('total_cost', 0)
        profit_margin = deal.get('profit_margin', 0)
        items = deal.get('items', [])
        items_html = "<ul>"
        for item in items:
            items_html += f"<li>{item.get('product')}: {item.get('quantity')} - Rs {item.get('customer_price')} (cost: Rs {item.get('cost_price')})</li>"
        items_html += "</ul>"
        return format_html('<div><strong>{}</strong><br>Total Selling: PKR {}<br>Total Cost: PKR {}<br>Profit Margin: {}%<br>Items: {}</div>', name, total_selling, total_cost, profit_margin, items_html)
    selected_deal_display.short_description = "Deal Details"
    def order_link(self, obj):
        if obj.order_id:
            return format_html('<a href="/admin/ik/order/{}/">View Order #{}</a>', obj.order_id, obj.order_id)
        return '-'
    order_link.short_description = "Order"
    def has_add_permission(self, request):
        return False


# ========== ✅ EVENT INQUIRY ADMIN ==========
@admin.register(EventInquiry)
class EventInquiryAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'phone', 'event_type', 'guests', 'budget', 'status', 'created_at')
    list_filter = ('status', 'event_type', 'created_at')
    search_fields = ('name', 'phone', 'email', 'message')
    readonly_fields = ('created_at', 'updated_at')
    list_editable = ('status',)
    fieldsets = (
        ('Customer Information', {'fields': ('name', 'email', 'phone')}),
        ('Event Details', {'fields': ('event_type', 'guests', 'budget', 'preferred_date')}),
        ('Message', {'fields': ('message',)}),
        ('Admin Status', {'fields': ('status',)}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )


# ========== ✅ EVENT ORDER ADMIN ==========
@admin.register(EventOrder)
class EventOrderAdmin(admin.ModelAdmin):
    list_display = ('order_number', 'customer_name', 'phone', 'event_type_display', 'total_amount', 'payment_status', 'status', 'created_at')
    list_filter = ('status', 'payment_status', 'created_at')
    search_fields = ('order_number', 'customer_name', 'phone', 'transaction_id')
    readonly_fields = ('order_number', 'created_at', 'updated_at')
    list_editable = ('status', 'payment_status')
    fieldsets = (
        ('Order Information', {'fields': ('order_number', 'inquiry', 'package')}),
        ('Customer Details', {'fields': ('customer_name', 'email', 'phone', 'address')}),
        ('Event Details', {'fields': ('event_date',)}),
        ('Financials', {'fields': ('total_amount', 'advance_paid', 'remaining', 'payment_status')}),
        ('Order Status & Payment', {'fields': ('status', 'transaction_id', 'notes')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )

    def event_type_display(self, obj):
        if obj.package:
            return obj.package.get_event_type_display()
        if obj.inquiry and obj.inquiry.event_type:
            return obj.inquiry.get_event_type_display()
        return '-'
    event_type_display.short_description = "Event Type"