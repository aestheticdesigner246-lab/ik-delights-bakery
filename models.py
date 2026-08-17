from django.db import models
from django.contrib.auth.models import User
from django.utils.text import slugify
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.utils import timezone
from datetime import timedelta
from .utils import send_whatsapp_message
import re
from decimal import Decimal

# ============================================================
# VALIDATORS
# ============================================================

def validate_payment_screenshot(value):
    """Validate payment screenshot - size, format, basic content"""
    if value.size > 5 * 1024 * 1024:
        raise ValidationError('Screenshot size cannot exceed 5MB')
    
    valid_extensions = ['jpg', 'jpeg', 'png', 'webp']
    ext = value.name.split('.')[-1].lower()
    if ext not in valid_extensions:
        raise ValidationError(f'Only {", ".join(valid_extensions)} formats are allowed')
    
    return value


# ============================================================
# 1. CORE MODELS
# ============================================================

class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(unique=True, blank=True)
    icon = models.CharField(max_length=50, blank=True)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Product(models.Model):
    PRODUCT_TYPES = (
        ('cake', 'Cake'),
        ('cookie', 'Cookie'),
        ('brownie', 'Brownie'),
        ('bento', 'Bento'),
    )

    name = models.CharField(max_length=200)
    slug = models.SlugField(blank=True)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products'
    )
    product_type = models.CharField(
        max_length=20,
        choices=PRODUCT_TYPES,
        default='cake'
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )
    cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Our cost price"
    )
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to='products/',
        blank=True,
        null=True
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    stock = models.PositiveIntegerField(default=0, help_text="Available stock quantity")
    is_featured = models.BooleanField(default=False, help_text="Show on homepage featured section")

    class Meta:
        app_label = 'ik'

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Cart(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        app_label = 'ik'


class Order(models.Model):
    PAYMENT_CHOICES = [
        ('jazzcash', 'JazzCash'),
        ('easypaisa', 'EasyPaisa'),
        ('cod', 'Cash on Delivery'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]

    PAYMENT_STATUS_CHOICES = [
        ('under_review', 'Under Review'),
        ('partial_paid', 'Partial Paid'),
        ('fully_paid', 'Fully Paid'),
        ('rejected', 'Rejected'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    name = models.CharField(max_length=100)
    
    phone = models.CharField(
        max_length=20,
        validators=[
            RegexValidator(
                regex=r'^03\d{9}$',
                message='Phone number must be in format 03XXXXXXXXX'
            )
        ],
        help_text="Enter Pakistani number like 03XXXXXXXXX"
    )
    
    address = models.TextField(default="")
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES)
    
    transaction_id = models.CharField(
        max_length=50,
        unique=False,
        null=True,
        blank=True,
        db_index=True,
        help_text="Unique JazzCash/EasyPaisa transaction ID"
    )
    screenshot_hash = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Unique hash for payment screenshot"
    )
    
    total = models.DecimalField(max_digits=10, decimal_places=2)
    advance_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    received_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Actual amount received from customer"
    )
    
    remaining_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='under_review')
    customization = models.JSONField(default=dict, blank=True)
    invoice_text = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    payment_screenshot = models.ImageField(
        upload_to='payments/',
        validators=[validate_payment_screenshot],
        blank=True,
        null=True,
        help_text="Payment screenshot proof"
    )
    
    payment_verified = models.BooleanField(default=False)
    verification_note = models.TextField(blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    transaction_time = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    is_payment_flagged = models.BooleanField(default=False)
    
    suspicious_attempts = models.PositiveIntegerField(default=0)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, null=True, help_text="Browser/Device info")
    
    updated_at = models.DateTimeField(auto_now=True, help_text="Last updated timestamp")
    city = models.CharField(max_length=100, blank=True, help_text="Customer city")
    
    remaining_transaction_id = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        db_index=True,
        help_text="Transaction ID for remaining payment"
    )
    remaining_payment_screenshot = models.ImageField(
        upload_to='remaining_payments/',
        blank=True,
        null=True,
        validators=[validate_payment_screenshot],
        help_text="Screenshot for remaining payment"
    )
    remaining_screenshot_hash = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        db_index=True,
        help_text="Hash for remaining payment screenshot"
    )
    remaining_payment_verified = models.BooleanField(
        default=False,
        help_text="Whether remaining payment has been verified by admin"
    )
    
    ORDER_TYPE_CHOICES = [
        ('website', 'Website'),
        ('custom', 'Custom'),
        ('deal', 'Deal'),
        ('event', 'Event'),
        ('whatsapp', 'WhatsApp'),
    ]

    order_type = models.CharField(
        max_length=30,
        choices=ORDER_TYPE_CHOICES,
        default='website',
        help_text="Source of order"
    )

    ALLOWED_STATUS_TRANSITIONS = {
        'pending': ['processing', 'cancelled'],
        'processing': ['delivered', 'cancelled'],
        'delivered': [],
        'cancelled': [],
    }

    class Meta:
        app_label = 'ik'

    @property
    def required_advance_amount(self):
        if self.payment_method == 'cod':
            return Decimal('0')
        return self.total * Decimal('0.5')
    
    @property
    def remaining_advance(self):
        return max(Decimal('0'), self.required_advance_amount - self.advance_amount)

    def can_change_status(self, new_status):
        if self.status == new_status:
            return False
        return new_status in self.ALLOWED_STATUS_TRANSITIONS.get(self.status, [])
    
    def update_status(self, new_status):
        if self.can_change_status(new_status):
            old_status = self.status
            self.status = new_status
            if self.payment_method == 'cod' and new_status == 'delivered':
                self.payment_status = 'fully_paid'
                self.remaining_amount = 0
                self.payment_verified = True
                self.received_amount = self.total
            self.save()
            return True, f"Status changed from {old_status} to {new_status}"
        return False, f"Cannot change from {self.status} to {new_status}"

    def clean(self):
        super().clean()
        delivery_date = self.customization.get('delivery_date')
        if delivery_date:
            try:
                delivery_dt = timezone.datetime.fromisoformat(delivery_date)
                if timezone.is_naive(delivery_dt):
                    delivery_dt = timezone.make_aware(delivery_dt)
                current_time = timezone.now()
                if delivery_dt < current_time + timedelta(hours=6):
                    raise ValidationError('Orders must be placed at least 6 hours before delivery time.')
            except Exception:
                raise ValidationError('Invalid delivery date format.')

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.full_clean()
        else:
            if self.payment_method in ['jazzcash', 'easypaisa'] and not self.payment_screenshot and self._state.adding:
                raise ValidationError("Payment screenshot is required for online payments")
            if self.suspicious_attempts >= 3:
                self.is_payment_flagged = True
            if self.status == 'processing' and self.payment_status not in ['partial_paid', 'fully_paid']:
                raise ValidationError("Cannot process order until payment is verified")
        
        if self.received_amount == 0 and self.advance_amount > 0:
            self.received_amount = self.advance_amount
        
        required_adv = self.required_advance_amount
        
        if self.payment_method == 'cod':
            if self.status != 'delivered':
                self.payment_status = 'under_review'
                self.payment_verified = False
            self.remaining_amount = self.total - self.received_amount
        else:
            if self.received_amount >= self.total:
                self.payment_status = 'fully_paid'
                self.remaining_amount = 0
            elif self.received_amount >= required_adv:
                self.payment_status = 'partial_paid'
                self.remaining_amount = self.total - self.received_amount
            elif self.received_amount > 0:
                self.payment_status = 'under_review'
                self.remaining_amount = self.total - self.received_amount
            else:
                self.payment_status = 'under_review'
                self.remaining_amount = self.total
        
        self.advance_amount = self.received_amount
        
        if self.status == 'pending' and self.payment_method != 'cod':
            if self.received_amount >= required_adv and self.payment_verified:
                self.status = 'processing'
        
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order {self.id} - {self.name} - {self.payment_status}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product_name = models.CharField(max_length=200)
    product_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()

    class Meta:
        app_label = 'ik'


# ============================================================
# 2. CUSTOMER ENGAGEMENT
# ============================================================

class Review(models.Model):
    name = models.CharField(max_length=100)
    city = models.CharField(max_length=100)
    rating = models.IntegerField()
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return f"{self.name} - {self.rating}★"


class EventBooking(models.Model):
    EVENT_TYPES = [
        ('Birthday', 'Birthday'),
        ('Wedding', 'Wedding'),
        ('Anniversary', 'Anniversary'),
        ('Baby Shower', 'Baby Shower'),
        ('Graduation', 'Graduation'),
        ('Corporate', 'Corporate'),
    ]

    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
        ('Preparing', 'Preparing'),
        ('Delivered', 'Delivered'),
    ]

    customer_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    event_type = models.CharField(max_length=50, choices=EVENT_TYPES)
    guests = models.IntegerField(default=25)
    budget = models.IntegerField(default=5000)

    cake_size = models.CharField(max_length=50, blank=True)
    cake_flavor = models.CharField(max_length=100, blank=True)

    extras = models.TextField(blank=True)

    selected_deal = models.CharField(max_length=255, blank=True)

    deal_items = models.JSONField(default=list, blank=True)

    planner_answers = models.JSONField(default=dict, blank=True)

    total_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='Pending'
    )

    whatsapp_sent = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    event_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of the event"
    )

    event_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Time of the event"
    )

    event_image = models.ImageField(
        upload_to='events/',
        blank=True,
        null=True,
        help_text="Event reference image"
    )

    relation_name = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )

    pickup_time = models.TimeField(
        null=True,
        blank=True
    )

    advance_payment = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Advance payment received"
    )
    remaining_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Remaining amount after advance"
    )
    payment_status = models.CharField(
        max_length=30,
        default='pending',
        choices=[
            ('pending', 'Pending'),
            ('partial_paid', 'Partial Paid'),
            ('fully_paid', 'Fully Paid'),
            ('rejected', 'Rejected'),
        ],
        help_text="Payment status"
    )
    payment_verified = models.BooleanField(
        default=False,
        help_text="Admin verified payment"
    )
    selected_package = models.CharField(
        max_length=255,
        blank=True,
        help_text="Selected package name (Silver/Gold/Premium)"
    )
    order_summary = models.JSONField(
        default=dict,
        blank=True,
        help_text="Full order details (items, prices, etc.)"
    )
    delivery_type = models.CharField(
        max_length=50,
        blank=True,
        default='Pickup',
        help_text="Pickup or Delivery"
    )
    special_instructions = models.TextField(
        blank=True,
        help_text="Any special requests"
    )

    class Meta:
        app_label = 'ik'

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        old_status = None

        if not is_new:
            try:
                old = EventBooking.objects.get(pk=self.pk)
                old_status = old.status
            except EventBooking.DoesNotExist:
                old_status = None

        self.remaining_amount = max(0, self.total_price - self.advance_payment)

        if self.advance_payment >= self.total_price:
            self.payment_status = 'fully_paid'
        elif self.advance_payment > 0:
            self.payment_status = 'partial_paid'
        else:
            self.payment_status = 'pending'

        super().save(*args, **kwargs)

        if not is_new and old_status != self.status and not self.whatsapp_sent:
            self._send_status_whatsapp()

    def _send_status_whatsapp(self):
        message = self._get_status_message()
        if message:
            wa_url = send_whatsapp_message(self.phone, message)
            if wa_url:
                EventBooking.objects.filter(pk=self.pk).update(whatsapp_sent=True)

    def _get_status_message(self):
        base = f"Assalam-o-Alaikum {self.customer_name}\n\n"
        details = f"Event: {self.event_type}\nGuests: {self.guests}\nBudget: Rs.{self.budget:,}"
        status_msgs = {
            'Pending': f"{base}We have received your request and will review it shortly.\n\n{details}\n\nThank you for choosing IK Delights! 🎂",
            'Approved': f"{base}Congratulations! Your event has been APPROVED. Our team will contact you soon.\n\n{details}\n\nIK Delights ❤️",
            'Rejected': f"{base}We regret to inform you that your request could not be approved at this time. Please contact support.\n\n{details}",
            'Preparing': f"{base}Good news! Your order is now being PREPARED.\n\n{details}",
            'Delivered': f"{base}Your order has been DELIVERED! Thank you for trusting IK Delights. ❤️\n\n{details}",
        }
        return status_msgs.get(self.status, f"{base}Your status has been updated to: {self.status}")

    def __str__(self):
        return f"{self.customer_name} - {self.event_type} - {self.status}"


class Favorite(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=40, null=True, blank=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'
        unique_together = ('user', 'product')


# ============================================================
# 3. MEDIA & MARKETING
# ============================================================

class Gallery(models.Model):
    CATEGORY_CHOICES = [
        ('cake', 'All Cakes'),
        ('birthday', 'Birthday Cakes'),
        ('bento', 'Bento'),
        ('brownie', 'Brownies'),
        ('dessert', 'Desserts'),
    ]
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    price = models.CharField(max_length=50, blank=True)
    image = models.ImageField(upload_to='gallery/')
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = 'ik'
        ordering = ['sort_order', 'name']
        verbose_name_plural = "Gallery"

    def __str__(self):
        return self.name


class FlashSale(models.Model):
    ANIMATION_CHOICES = [
        ('flick', 'Flick'),
        ('slide', 'Slide'),
        ('zoom', 'Zoom'),
        ('bounce', 'Bounce'),
        ('pulse', 'Pulse'),
    ]
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=300, blank=True)
    image = models.ImageField(upload_to='flash_sale/')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    discount_percent = models.PositiveIntegerField(default=0)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    custom_whatsapp_text = models.TextField(blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    popup_delay = models.PositiveIntegerField(default=3)
    animation_type = models.CharField(max_length=20, choices=ANIMATION_CHOICES, default='flick')
    show_add_to_cart = models.BooleanField(default=True)
    show_whatsapp = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return self.title


class Deal(models.Model):
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=300, blank=True)
    image = models.ImageField(upload_to='deals/')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    expiry = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'
        ordering = ['sort_order', '-created_at']
        verbose_name = "Deal"
        verbose_name_plural = "Deals"

    def __str__(self):
        return self.title
    
    @property
    def is_expired(self):
        if self.expiry:
            return self.expiry <= timezone.now()
        return False
    
    @property
    def time_remaining(self):
        if not self.expiry:
            return None
        now = timezone.now()
        if self.expiry <= now:
            return {'expired': True}
        delta = self.expiry - now
        return {
            'expired': False,
            'days': delta.days,
            'hours': delta.seconds // 3600,
            'minutes': (delta.seconds % 3600) // 60,
            'seconds': delta.seconds % 60,
            'total_seconds': delta.total_seconds()
        }


# ============================================================
# 4. ADMIN & UTILITIES
# ============================================================

class UsedTransaction(models.Model):
    txn_id = models.CharField(max_length=50, unique=True)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return self.txn_id


class ContactMessage(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('read', 'Read'),
        ('replied', 'Replied'),
        ('resolved', 'Resolved'),
    ]
    name = models.CharField(max_length=100)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    message = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    
    subject = models.CharField(max_length=200, blank=True)
    priority = models.CharField(
        max_length=20,
        choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')],
        default='medium',
    )

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return f"Message from {self.name} - {self.created_at.strftime('%Y-%m-%d')}"


class Announcement(models.Model):
    text = models.CharField(max_length=300)
    link = models.URLField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'ik'
        ordering = ['order', '-created_at']
        verbose_name = "Announcement"
        verbose_name_plural = "Announcements"

    def __str__(self):
        return self.text[:50]


# ============================================================
# 5. PROFILE MODEL
# ============================================================

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    phone = models.CharField(max_length=20, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    bio = models.TextField(blank=True, null=True)
    whatsapp_number = models.CharField(max_length=20, blank=True, null=True)
    delivery_notes = models.TextField(blank=True, null=True)
    default_delivery_address = models.TextField(blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return f"Profile of {self.user.username}"


# ============================================================
# 6. HOMEPAGE SETTINGS
# ============================================================

class HomepageSettings(models.Model):
    sweet_creations_title = models.CharField(
        max_length=200,
        default="Our Sweet <em>Creations</em>",
        help_text="HTML allowed"
    )
    sweet_creations_subtitle = models.CharField(
        max_length=300,
        default="Explore our wide range of delicious cakes and pastries — click to discover more!"
    )
    show_section = models.BooleanField(default=True)

    class Meta:
        app_label = 'ik'
        verbose_name = "Homepage Setting"
        verbose_name_plural = "Homepage Settings"

    def __str__(self):
        return "Homepage Settings"

    @classmethod
    def get_settings(cls):
        settings, _ = cls.objects.get_or_create(id=1)
        return settings


# ============================================================
# 7. CHATBOT SESSIONS
# ============================================================

class EventChatSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    session_key = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed = models.BooleanField(default=False)
    answers = models.JSONField(default=dict, blank=True)

    class Meta:
        app_label = 'ik'
        ordering = ['-created_at']

    def __str__(self):
        user_info = self.user.username if self.user else f"Guest {self.session_key[:10] if self.session_key else 'No key'}"
        return f"{user_info} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"


# ============================================================
# 8. SMART BAKING ASSISTANT
# ============================================================

class BakingInquiry(models.Model):
    session_key = models.CharField(max_length=100, blank=True, null=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed = models.BooleanField(default=False)
    answers = models.JSONField(default=dict)
    reference_image = models.ImageField(upload_to='inquiry_images/', blank=True, null=True)
    chosen_package = models.CharField(max_length=50, blank=True, null=True)
    total_estimated_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    selected_deal = models.JSONField(null=True, blank=True)
    transaction_id = models.CharField(max_length=50, blank=True, null=True)
    payment_status = models.CharField(max_length=20, default='pending')
    order_id = models.IntegerField(null=True, blank=True)

    class Meta:
        app_label = 'ik'
        ordering = ['-created_at']

    def __str__(self):
        return f"Inquiry {self.id} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"


# ============================================================
# 9. DEAL PRODUCTS
# ============================================================

class DealProduct(models.Model):
    deal = models.ForeignKey('Deal', on_delete=models.CASCADE, related_name='deal_products')
    product_name = models.CharField(max_length=100)
    quantity = models.CharField(max_length=50)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Our cost")
    selling_price = models.DecimalField(max_digits=10, decimal_places=2, help_text="Price charged to customer")

    class Meta:
        app_label = 'ik'

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"


# ============================================================
# 10. WHATSAPP NUMBERS (CRM)
# ============================================================

class WhatsAppNumber(models.Model):
    STATUS_CHOICES = [
        ('lead', 'New Lead'),
        ('followup', 'Follow Up'),
        ('working', 'Working'),
        ('converted', 'Converted'),
        ('rejected', 'Rejected'),
    ]
    
    LEAD_SOURCE = [
        ('website', 'Website Order'),
        ('contact_form', 'Contact Form'),
        ('chat', 'Live Chat'),
        ('event_planner', 'Event Planner'),
        ('baking_assistant', 'Baking Assistant'),
        ('manual', 'Manual Entry'),
        ('whatsapp', 'WhatsApp Direct'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=100, null=True, blank=True)
    phone_number = models.CharField(max_length=20)
    verified = models.BooleanField(default=False)
    customer_name = models.CharField(max_length=100, blank=True, null=True)
    product_name = models.CharField(max_length=255, blank=True, null=True)
    message = models.TextField(blank=True, null=True)
    order_id = models.IntegerField(null=True, blank=True)
    event_booking_id = models.IntegerField(null=True, blank=True)
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='lead',
        db_index=True,
        help_text="Lead status in CRM pipeline"
    )
    
    lead_source = models.CharField(max_length=20, choices=LEAD_SOURCE, default='manual')
    last_contacted = models.DateTimeField(blank=True, null=True)
    follow_up_count = models.PositiveIntegerField(default=0)
    follow_up_date = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    
    total_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Total order amount"
    )
    advance_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Advance payment received"
    )
    remaining_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Remaining payment amount"
    )
    payment_verified = models.BooleanField(
        default=False,
        help_text="Whether payment has been verified by admin"
    )
    transaction_id = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Transaction ID for the payment"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'ik'
        unique_together = ('session_key', 'phone_number')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.phone_number} ({self.customer_name or 'No name'})"
