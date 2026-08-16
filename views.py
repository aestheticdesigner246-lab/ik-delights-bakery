import json
import re
import logging
from decimal import Decimal
import os
import io
from urllib.parse import quote
from datetime import datetime, timedelta
import random
import string
import hashlib
import tempfile
import time

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.paginator import Paginator
from django.db.models import Count, Q, Sum, Value, DecimalField, F
from django.db import transaction
from django.db import OperationalError
from django.db.models.functions import TruncMonth, Coalesce
from django.http import JsonResponse, FileResponse, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.views.decorators.cache import cache_page
from django.utils.timezone import make_aware
from django.utils.dateparse import parse_datetime
from django.core.files.images import get_image_dimensions
from django.utils.html import escape
from django.core.exceptions import ValidationError
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.views.decorators.http import require_POST

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from .models import (
    Announcement, BakingInquiry, Cart, CartItem, Category, ContactMessage, Deal,
    DealProduct, EventBooking, EventChatSession,
    EventInquiry, EventOrder,
    Favorite, FlashSale, Gallery, Order,
    OrderItem, Product, Profile, Review,
    WhatsAppNumber, SiteSettings
)

logger = logging.getLogger(__name__)

try:
    from django_ratelimit.decorators import ratelimit
    RATELIMIT_AVAILABLE = True
except ImportError:
    RATELIMIT_AVAILABLE = False
    def ratelimit(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

CACHE_TIMEOUT = 300
MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 4000
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']


# ============================================================
# RETRY DECORATOR FOR DATABASE LOCK
# ============================================================
def retry_on_lock(max_retries=5, delay=0.2):
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except OperationalError as e:
                    if 'database is locked' in str(e) and attempt < max_retries - 1:
                        time.sleep(delay * (attempt + 1))
                        continue
                    raise
            return None
        return wrapper
    return decorator


# ============================================================
# SECURITY HELPER FUNCTIONS
# ============================================================

def get_file_hash(file_obj):
    hasher = hashlib.sha256()
    for chunk in file_obj.chunks():
        hasher.update(chunk)
    file_obj.seek(0)
    return hasher.hexdigest()


def extract_text_from_image(image_path):
    try:
        from PIL import Image as PILImage, ImageEnhance, ImageFilter
        import pytesseract
        import cv2
        import numpy as np
        
        img = PILImage.open(image_path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        gray = img.convert('L')
        enhancer = ImageEnhance.Contrast(gray)
        gray = enhancer.enhance(2.5)
        gray = gray.filter(ImageFilter.SHARPEN)
        new_size = (gray.width * 2, gray.height * 2)
        gray = gray.resize(new_size, PILImage.Resampling.LANCZOS)
        img_np = np.array(gray)
        img_np = cv2.GaussianBlur(img_np, (3, 3), 0)
        _, img_np = cv2.threshold(img_np, 127, 255, cv2.THRESH_BINARY)
        kernel = np.ones((1, 1), np.uint8)
        img_np = cv2.morphologyEx(img_np, cv2.MORPH_CLOSE, kernel)
        processed_img = PILImage.fromarray(img_np)
        custom_config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#'
        text = pytesseract.image_to_string(processed_img, config=custom_config)
        if not text.strip():
            text = pytesseract.image_to_string(processed_img)
        logger.info(f"OCR Extracted Text: {text[:200]}")
        return text.lower()
    except Exception as e:
        logger.error(f"OCR Error: {e}")
        return ""


def save_screenshot_temp(screenshot):
    try:
        from PIL import Image as PILImage
        import io
        img_data = b''
        for chunk in screenshot.chunks():
            img_data += chunk
        img = PILImage.open(io.BytesIO(img_data))
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
            img.save(temp_file, format='PNG', quality=95)
            return temp_file.name
    except Exception as e:
        logger.error(f"Temp file save error: {e}")
        return None


def clean_ocr_text(text):
    return re.sub(r'\D', '', text)


def detect_amount_from_screenshot(screenshot_path, expected_amount=None):
    warnings = []
    detected_amount = Decimal('0')
    if not screenshot_path or not os.path.exists(screenshot_path):
        warnings.append("Screenshot file not found")
        return detected_amount, warnings
    try:
        extracted_text = extract_text_from_image(screenshot_path)
        if extracted_text:
            clean_ocr = clean_ocr_text(extracted_text)
            amount_match = re.findall(r'\d{3,6}', clean_ocr)
            if amount_match:
                try:
                    detected_amount = max([Decimal(x) for x in amount_match])
                except:
                    detected_amount = Decimal('0')
                logger.info(f"✅ OCR detected amount: {detected_amount}")
            else:
                warnings.append("No amount detected in screenshot")
        else:
            warnings.append("OCR returned empty text")
    except Exception as ocr_e:
        warnings.append(f"OCR error: {str(ocr_e)[:50]}")
        logger.error(f"OCR processing error: {ocr_e}")
    return detected_amount, warnings


def increment_suspicious_attempts(user):
    if user and user.is_authenticated:
        try:
            profile = user.profile
            profile.suspicious_attempts = getattr(profile, 'suspicious_attempts', 0) + 1
            profile.save(update_fields=['suspicious_attempts'])
            logger.warning(f"Suspicious attempt detected for user: {user.username}")
        except Exception as e:
            logger.error(f"Failed to update suspicious attempts: {e}")


def generate_unique_transaction_id(payment_method):
    max_attempts = 5
    for attempt in range(max_attempts):
        prefix = 'JC' if payment_method == 'jazzcash' else 'EP'
        timestamp = datetime.now().strftime('%y%m%d%H%M%S')
        random_str = ''.join(random.choices(string.digits, k=6))
        transaction_id = f"{prefix}{timestamp}{random_str}"
        if not Order.objects.filter(transaction_id=transaction_id).exists():
            return transaction_id
        logger.warning(f"Transaction ID collision detected: {transaction_id}, retry {attempt + 1}")
    prefix = 'JC' if payment_method == 'jazzcash' else 'EP'
    timestamp = datetime.now().strftime('%y%m%d%H%M%S%f')
    random_str = ''.join(random.choices(string.digits, k=4))
    return f"{prefix}{timestamp}{random_str}"


def safe_error_response(message="Something went wrong. Please try again.", status=500):
    return JsonResponse({"error": message}, status=status)


# ============================================================
# PAYMENT HELPER FUNCTIONS
# ============================================================

def calculate_payment_status(total, received_amount, payment_method):
    if payment_method == 'cod':
        return 'under_review', False, total
    if received_amount <= 0:
        return 'under_review', False, total
    elif received_amount >= total:
        return 'fully_paid', False, Decimal('0')
    else:
        required_advance = total * Decimal('0.5')
        if received_amount >= required_advance:
            return 'partial_paid', False, total - received_amount
        else:
            return 'under_review', False, total - received_amount


def update_order_payment_status(order, received_amount=None, payment_status=None, verify_remaining=False):
    if received_amount is not None:
        order.received_amount = received_amount
        order.remaining_amount = order.total - received_amount
        new_status, _, remaining = calculate_payment_status(
            order.total, received_amount, order.payment_method
        )
        order.payment_status = new_status
        order.remaining_amount = remaining
    elif payment_status is not None:
        order.payment_status = payment_status
        if payment_status == 'fully_paid':
            order.received_amount = order.total
            order.remaining_amount = 0
        elif payment_status == 'partial_paid':
            if order.received_amount == 0:
                order.received_amount = order.total * Decimal('0.5')
                order.remaining_amount = order.total - order.received_amount
        elif payment_status == 'rejected':
            order.payment_verified = False
            order.status = 'cancelled'
    elif verify_remaining and order.payment_status == 'partial_paid':
        order.payment_status = 'fully_paid'
        order.payment_verified = True
        order.remaining_payment_verified = True
        order.received_amount = order.total
        order.remaining_amount = 0
        if order.status != 'delivered':
            order.status = 'delivered'

    if order.status == 'processing' and order.payment_status not in ['partial_paid', 'fully_paid']:
        order.status = 'pending'

    order.save()
    clear_dashboard_cache()
    return order


def update_whatsapp_payment_status(whatsapp_obj, received_amount=None, payment_status=None):
    if received_amount is not None:
        whatsapp_obj.advance_amount = received_amount
        whatsapp_obj.remaining_amount = whatsapp_obj.total_amount - received_amount
        if received_amount <= 0:
            whatsapp_obj.payment_status = 'under_review'
            whatsapp_obj.payment_verified = False
        elif received_amount >= whatsapp_obj.total_amount:
            whatsapp_obj.payment_status = 'fully_paid'
            whatsapp_obj.payment_verified = False
            whatsapp_obj.remaining_amount = 0
        else:
            whatsapp_obj.payment_status = 'partial_paid'
            whatsapp_obj.payment_verified = False
    elif payment_status is not None:
        whatsapp_obj.payment_status = payment_status
        whatsapp_obj.payment_verified = False
        if payment_status == 'fully_paid':
            whatsapp_obj.advance_amount = whatsapp_obj.total_amount
            whatsapp_obj.remaining_amount = 0
    whatsapp_obj.save()
    clear_dashboard_cache()
    return whatsapp_obj


def update_event_payment_status(event_obj, received_amount=None, payment_status=None):
    if received_amount is not None:
        event_obj.advance_paid = received_amount
        remaining = (event_obj.total_price or 0) - received_amount
        event_obj.remaining = remaining
        if received_amount <= 0:
            event_obj.payment_status = 'under_review'
            event_obj.payment_verified = False
        elif received_amount >= (event_obj.total_price or 0):
            event_obj.payment_status = 'fully_paid'
            event_obj.payment_verified = False
            event_obj.remaining = 0
        else:
            required_advance = (event_obj.total_price or 0) * Decimal('0.5')
            if received_amount >= required_advance:
                event_obj.payment_status = 'partial_paid'
            else:
                event_obj.payment_status = 'under_review'
            event_obj.payment_verified = False
    elif payment_status is not None:
        event_obj.payment_status = payment_status
        event_obj.payment_verified = False
        if payment_status == 'fully_paid':
            event_obj.advance_paid = event_obj.total_price or 0
            event_obj.remaining = 0
    event_obj.save()
    clear_dashboard_cache()
    return event_obj


def generate_invoice_text(order):
    if not order:
        return "Order not found"
    received_amount = order.received_amount if order.received_amount else 0
    remaining_amount = order.total - received_amount if received_amount < order.total else 0
    lines = [
        "🎂 *IK DELIGHTS - INVOICE* 🎂",
        "=" * 35,
        "",
        f"📋 *Order:* #{order.id}",
        f"📅 *Date:* {order.created_at.strftime('%d %b %Y, %I:%M %p')}",
        f"💰 *Total:* Rs {order.total:.2f}",
        f"💳 *Received Amount:* Rs {received_amount:.2f}",
        f"💰 *Remaining:* Rs {remaining_amount:.2f}",
        f"📦 *Status:* {order.get_status_display()}",
        f"💳 *Payment Status:* {order.get_payment_status_display()}",
        "",
        "👤 *Customer*",
        f"   Name: {order.name}",
        f"   Phone: {order.phone}",
        f"   Address: {order.address}",
        "",
        "🛍️ *Items*",
        "-" * 30,
    ]
    for i, item in enumerate(order.items.all(), 1):
        lines.append(f"{i}. {item.product_name} x {item.quantity} = Rs {item.product_price * item.quantity:.2f}")
    lines.extend(["-" * 30, f"💰 *Total: Rs {order.total:.2f}*", ""])
    lines.append("💬 *Payment Confirmation:* Admin will manually verify your payment and send a WhatsApp message.")
    lines.extend(["", "✨ Thank you! ✨", "💬 Reply for support"])
    return "\n".join(lines)


# ============================================================
# SIGNALS
# ============================================================

def safe_delete_file(file_field):
    if file_field and hasattr(file_field, 'path') and os.path.isfile(file_field.path):
        try:
            os.remove(file_field.path)
        except Exception as e:
            logger.error(f"Failed to delete file: {e}")

@receiver(post_delete, sender=Product)
def delete_product_image(sender, instance, **kwargs):
    safe_delete_file(instance.image)

@receiver(post_delete, sender=Category)
def delete_category_image(sender, instance, **kwargs):
    safe_delete_file(instance.image)

@receiver(post_delete, sender=Gallery)
def delete_gallery_image(sender, instance, **kwargs):
    safe_delete_file(instance.image)

@receiver(post_delete, sender=Deal)
def delete_deal_image(sender, instance, **kwargs):
    safe_delete_file(instance.image)

@receiver(post_delete, sender=Order)
def delete_payment_screenshot(sender, instance, **kwargs):
    safe_delete_file(instance.payment_screenshot)
    safe_delete_file(instance.remaining_payment_screenshot)


# ============================================================
# HELPERS
# ============================================================

def clear_dashboard_cache():
    for key in ["live_dashboard_stats", "dashboard_stats", "monthly_sales", "order_status", "event_stats"]:
        cache.delete(key)


def get_or_create_cart(request):
    if not request.user.is_authenticated:
        return None
    cart, _ = Cart.objects.get_or_create(user=request.user)
    return cart


def format_phone(phone):
    if not phone:
        return None
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) < 10:
        return None
    if digits.startswith("0"):
        digits = "92" + digits[1:]
    if not digits.startswith("92"):
        digits = "92" + digits
    return digits


def safe_json_parse(request):
    try:
        return json.loads(request.body)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return None


def validate_custom_password(password):
    try:
        validate_password(password)
        return None
    except ValidationError as e:
        return e.messages


def validate_image_file(file):
    if not file:
        return None
    if file.size > MAX_FILE_SIZE:
        return f"File size exceeds {MAX_FILE_SIZE // (1024*1024)}MB"
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return "Invalid file type"
    try:
        from PIL import Image
        img = Image.open(file)
        img.verify()
        file.seek(0)
        w, h = get_image_dimensions(file)
        file.seek(0)
        if w and h and (w > MAX_IMAGE_DIMENSION or h > MAX_IMAGE_DIMENSION):
            return "Image too large"
    except Exception as e:
        logger.error(f"Image validation error: {e}")
        return "Invalid image file"
    return None


def get_unique_slug(model, name, exclude_id=None):
    base = slugify(name)
    slug = base
    counter = 1
    qs = model.objects.filter(slug=slug)
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    while qs.exists():
        slug = f"{base}-{counter}"
        qs = model.objects.filter(slug=slug)
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        counter += 1
    return slug


def validate_pakistani_phone(phone):
    return bool(re.match(r'^03\d{9}$', phone))


def check_order_ownership(request, order):
    if request.user.is_authenticated:
        return request.user == order.user or request.user.is_staff
    return False


# ============================================================
# PAGE VIEWS
# ============================================================

@ensure_csrf_cookie
def home(request):
    try:
        return render(request, "test.html", {
            "categories": Category.objects.filter(is_active=True),
            "products": Product.objects.filter(is_active=True).select_related('category')[:8],
            "gallery_images": Gallery.objects.all()[:8],
            "flash_sales": FlashSale.objects.filter(is_active=True, end_time__gt=timezone.now()),
            "deals": Deal.objects.filter(is_active=True).filter(Q(expiry__gt=timezone.now()) | Q(expiry__isnull=True))[:3],
            "announcements": Announcement.objects.filter(is_active=True),
        })
    except Exception as e:
        logger.exception("Home page error")
        return render(request, "test.html", {"error": "Something went wrong"})


def order_tracking_page(request):
    return render(request, "track.html")


def category_detail(request, category_slug):
    category = get_object_or_404(Category, slug=category_slug)
    return render(request, "category.html", {
        "category": category,
        "products": Product.objects.filter(category=category, is_active=True).select_related('category'),
        "announcements": Announcement.objects.filter(is_active=True),
        "categories": Category.objects.filter(is_active=True),
    })


def product_detail(request, slug):
    product = get_object_or_404(Product, slug=slug, is_active=True)
    return render(request, "product_detail.html", {
        "product": product,
        "related_products": Product.objects.filter(category=product.category, is_active=True).exclude(id=product.id)[:4],
    })


def all_categories(request):
    return redirect('home')


def checkout_page(request):
    cart = get_or_create_cart(request)
    if not cart:
        return redirect('/')
    items = cart.items.select_related("product")
    total = sum(i.product.price * i.quantity for i in items)
    return render(request, "checkout.html", {"cart_items": items, "total": total})


def customize_order(request):
    return render(request, "customize.html")


@login_required
def invoice_page(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    if not check_order_ownership(request, order):
        messages.error(request, "Unauthorized")
        return redirect('home')
    return render(request, "invoice.html", {"order": order, "business_number": settings.BUSINESS_NUMBER})


@login_required
def download_invoice_pdf(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    if not check_order_ownership(request, order):
        return JsonResponse({"error": "Unauthorized"}, status=403)

    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    logo = os.path.join(settings.BASE_DIR, 'static/images/logo.png')
    if os.path.exists(logo):
        elements.append(Image(logo, width=2.2 * inch, height=1 * inch))

    elements.append(Spacer(1, 15))
    elements.append(Paragraph("<font size='22'><b>IK Delights Invoice</b></font>", styles['Title']))
    elements.append(Spacer(1, 20))

    received_amount = order.received_amount if order.received_amount else 0
    remaining_amount = order.total - received_amount

    customer_info = f"""
    <b>Order ID:</b> {order.id}<br/>
    <b>Customer:</b> {order.name}<br/>
    <b>Phone:</b> {order.phone}<br/>
    <b>Address:</b> {order.address}<br/>
    <b>Payment:</b> {order.payment_method}<br/>
    <b>Received Amount:</b> Rs {received_amount:.2f}<br/>
    <b>Remaining:</b> Rs {remaining_amount:.2f}<br/>
    """
    elements.append(Paragraph(customer_info, styles['BodyText']))
    elements.append(Spacer(1, 20))

    data = [['Product', 'Qty', 'Price']]
    for item in order.items.all():
        data.append([item.product_name, str(item.quantity), f"Rs {item.product_price}"])
    data.append(['', 'Total', f"Rs {order.total}"])

    table = Table(data, colWidths=[250, 80, 120])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d88ca0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 25))

    elements.append(Paragraph(f"<b>Remaining Payment:</b> Send Rs {remaining_amount:.2f} to JazzCash: {settings.BUSINESS_NUMBER}", styles['BodyText']))
    elements.append(Spacer(1, 20))
    elements.append(Paragraph("<font color='#d88ca0'><b>Thank you for choosing IK Delights!</b></font>", styles['BodyText']))

    pdf.build(elements)
    buffer.seek(0)
    return FileResponse(buffer, as_attachment=True, filename=f"invoice_{order.id}.pdf")


def event_planner_page(request):
    return render(request, "event_planner.html")


# ============================================================
# LIVE DASHBOARD API
# ============================================================

@staff_member_required
def live_dashboard_data(request):
    data = cache.get("live_dashboard_stats")
    if not data:
        try:
            total_revenue = Order.objects.filter(
                payment_status__in=['partial_paid', 'fully_paid']
            ).aggregate(
                total=Coalesce(Sum('received_amount'), Value(0), output_field=DecimalField())
            )['total'] or 0

            data = {
                "total_orders": Order.objects.count(),
                "total_revenue": float(total_revenue),
                "pending_orders": Order.objects.filter(status='pending').count(),
                "unread_messages": ContactMessage.objects.filter(is_read=False).count(),
                "notifications": Order.objects.filter(status='pending', created_at__gte=timezone.now() - timedelta(hours=24)).count(),
                "messages": ContactMessage.objects.filter(is_read=False).count(),
                "events": [
                    {
                        "customer": e.customer_name,
                        "event_type": e.event_type,
                        "status": e.status,
                        "time": e.created_at.strftime("%I:%M %p"),
                        "total": float(e.total_price or 0),
                        "phone": e.phone,
                        "guests": e.guests
                    }
                    for e in EventBooking.objects.filter(status__in=['Pending', 'Preparing']).order_by('-created_at')[:3]
                ],
            }
            cache.set("live_dashboard_stats", data, CACHE_TIMEOUT)
        except Exception as e:
            logger.exception("Live dashboard error")
            data = {"error": "Failed"}
    return JsonResponse(data)


@staff_member_required
def live_notifications(request):
    notifications = []
    for order in Order.objects.order_by('-created_at')[:5]:
        notifications.append({
            "customer": order.name,
            "total": float(order.total),
            "status": order.status,
            "time": order.created_at.strftime("%I:%M %p")
        })
    return JsonResponse({"notifications": notifications})


@staff_member_required
def live_messages(request):
    messages_list = []
    for msg in ContactMessage.objects.order_by('-created_at')[:5]:
        messages_list.append({
            "name": msg.name,
            "message": msg.message[:40],
            "time": msg.created_at.strftime("%I:%M %p")
        })
    return JsonResponse({"messages": messages_list})


@staff_member_required
def live_events(request):
    events_list = []
    for event in EventBooking.objects.filter(status__in=['Preparing', 'Pending']).order_by('-created_at')[:3]:
        events_list.append({
            "event_type": event.event_type,
            "customer": event.customer_name,
            "time": event.created_at.strftime("%I:%M %p"),
            "guests": event.guests,
            "phone": event.phone,
            "total": float(event.total_price or 0),
            "status": event.status,
        })
    return JsonResponse({"events": events_list})


# ============================================================
# USER AUTH & PROFILE
# ============================================================

@ratelimit(key='ip', rate='10/m', block=True)
def register(request):
    if request.method == "POST":
        from django.contrib.auth.models import User
        try:
            full_name = request.POST.get("full_name")
            username = request.POST.get("username")
            email = request.POST.get("email")
            password = request.POST.get("password")
            confirm = request.POST.get("confirm_password")

            if password != confirm:
                messages.error(request, "Passwords do not match")
                return redirect("signup")

            pwd_err = validate_custom_password(password)
            if pwd_err:
                for e in pwd_err:
                    messages.error(request, e)
                return redirect("signup")

            if User.objects.filter(username=username).exists():
                messages.error(request, "Username already exists")
                return redirect("signup")

            if User.objects.filter(email=email).exists():
                messages.error(request, "Email already exists")
                return redirect("signup")

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                first_name=full_name
            )
            login(request, user)
            messages.success(request, "Account created successfully")
            return redirect("home")
        except Exception as e:
            logger.exception("Register error")
            messages.error(request, "Registration failed")
            return redirect("signup")
    return render(request, "signup.html")


@login_required
def profile_view(request):
    return render(request, "profile.html")


@login_required
def update_profile(request):
    if request.method == "POST":
        p = request.user.profile
        p.phone = request.POST.get("phone")
        p.address = request.POST.get("address")
        p.city = request.POST.get("city")
        p.save()
        messages.success(request, "Profile updated")
    return redirect("profile")


@login_required
def dashboard(request):
    orders = Order.objects.filter(user=request.user).order_by("-created_at")
    return render(request, "dashboard.html", {"orders": orders})

def update_profile_ajax(request):
    if not request.user.is_authenticated:
        return safe_error_response("Not logged in", 401)

    if request.method == "POST":
        try:
            p = request.user.profile

            p.phone = request.POST.get("phone", "")
            p.address = request.POST.get("address", "")
            p.city = request.POST.get("city", "")

            p.save()

            return JsonResponse({
                "status": "ok",
                "message": "Profile updated successfully"
            })

        except Exception as e:
            return JsonResponse({
                "status": "error",
                "message": str(e)
            }, status=500)

    return safe_error_response("Invalid method", 405)
def change_password_ajax(request):
    if not request.user.is_authenticated:
        return safe_error_response("Not logged in", 401)
    if request.method == "POST":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)

        old = data.get("old_password")
        new1 = data.get("new_password1")
        new2 = data.get("new_password2")

        if not request.user.check_password(old):
            return JsonResponse({"error": "Old password incorrect"}, status=400)
        if new1 != new2:
            return JsonResponse({"error": "New passwords do not match"}, status=400)

        pwd_err = validate_custom_password(new1)
        if pwd_err:
            return JsonResponse({"error": pwd_err[0]}, status=400)

        request.user.set_password(new1)
        request.user.save()
        user = authenticate(username=request.user.username, password=new1)
        if user:
            login(request, user)
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid method", 405)


@login_required
def profile_modal_content(request):
    profile, created = Profile.objects.get_or_create(user=request.user)
    user_orders = Order.objects.filter(user=request.user).order_by("-created_at")
    wishlist_items = Favorite.objects.filter(user=request.user).select_related("product")
    return render(request, "profile_modal.html", {
        "user_orders": user_orders,
        "wishlist_items": wishlist_items,
        "profile": profile,
    })


# ============================================================
# AJAX LOGIN
# ============================================================

@ratelimit(key='ip', rate='10/m', block=True)
def ajax_login(request):
    if request.method != "POST":
        return safe_error_response("Invalid method", 405)
    
    if request.content_type == 'application/json':
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)
    else:
        data = request.POST
    
    username = data.get("username")
    password = data.get("password")
    
    if not username or not password:
        return JsonResponse({"status": "error", "message": "Username and password required"}, status=400)
    
    user = authenticate(request, username=username, password=password)
    
    if user:
        login(request, user)
        request.session.save()
        return JsonResponse({
            "status": "ok",
            "message": "Login successful",
            "redirect_url": "/",
            "user": {
                "username": user.username,
                "email": user.email,
                "is_authenticated": True
            }
        })
    return JsonResponse({"status": "error", "message": "Invalid username or password"}, status=401)


# ==================== UPDATED ajax_register (with letters-only validation) ====================
@ratelimit(key='ip', rate='5/m', block=True)
def ajax_register(request):
    if request.method == "POST":
        from django.contrib.auth.models import User
        import re
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError

        if request.content_type == 'application/json':
            data = safe_json_parse(request)
            if not data:
                return safe_error_response("Invalid JSON", 400)
        else:
            data = request.POST

        full_name = data.get("full_name", "").strip()
        username = data.get("username", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password", "")
        confirm = data.get("confirm_password", "")
        whatsapp_number = data.get("whatsapp_number", "")
        city = data.get("city", "").strip()
        address = data.get("address", "").strip()

        # Required fields
        if not full_name:
            return JsonResponse({"status": "error", "message": "Full name is required"}, status=400)
        if not username:
            return JsonResponse({"status": "error", "message": "Username is required"}, status=400)
        if not email:
            return JsonResponse({"status": "error", "message": "Email is required"}, status=400)
        if not password:
            return JsonResponse({"status": "error", "message": "Password is required"}, status=400)
        if password != confirm:
            return JsonResponse({"status": "error", "message": "Passwords do not match"}, status=400)

        # Full name: only letters and spaces, min length 3
        if len(full_name) < 3:
            return JsonResponse({"status": "error", "message": "Full name must be at least 3 characters"}, status=400)
        if not re.fullmatch(r'^[A-Za-z\s]+$', full_name):
            return JsonResponse({"status": "error", "message": "Full name can only contain letters and spaces"}, status=400)

              # Username validation
        if len(username) < 4:
            return JsonResponse({
             "status": "error",
             "message": "Username must be at least 4 characters"
            }, status=400)

        if not re.fullmatch(r'^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]+$', username):
            return JsonResponse({
            "status": "error",
            "message": "Username must contain both letters"
            }, status=400)
        # Email validation
        try:
            validate_email(email)
        except ValidationError:
            return JsonResponse({"status": "error", "message": "Enter a valid email address"}, status=400)

        # WhatsApp validation
        if not whatsapp_number:
            return JsonResponse({"status": "error", "message": "WhatsApp number is required"}, status=400)
        if not re.fullmatch(r'03\d{9}', whatsapp_number):
            return JsonResponse({"status": "error", "message": "Enter valid WhatsApp number (03XXXXXXXXX)"}, status=400)

        # City: only letters and spaces, min length 3
        if len(city) < 3:
            return JsonResponse({"status": "error", "message": "City name must be at least 3 characters"}, status=400)
        if not re.fullmatch(r'^[A-Za-z\s]+$', city):
            return JsonResponse({"status": "error", "message": "City name can only contain letters and spaces"}, status=400)

        # Address validation
        if len(address) < 10:
            return JsonResponse({"status": "error", "message": "Please enter complete address (minimum 10 characters)"}, status=400)

        # Django password validation
        pwd_err = validate_custom_password(password)
        if pwd_err:
            return JsonResponse({"status": "error", "message": pwd_err[0]}, status=400)

        # Uniqueness checks
        if User.objects.filter(username=username).exists():
            return JsonResponse({"status": "error", "message": "Username already exists"}, status=400)
        if User.objects.filter(email=email).exists():
            return JsonResponse({"status": "error", "message": "Email already exists"}, status=400)

        # Create user
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=full_name
        )

        # Update profile (signal already created one)
        profile = user.profile
        profile.whatsapp_number = whatsapp_number
        profile.city = city
        profile.address = address
        profile.save()

        login(request, user)
        request.session.save()

        return JsonResponse({
            "status": "ok",
            "message": "Account created successfully",
            "redirect_url": "/"
        })
    return safe_error_response("Invalid method", 405)


# ============================================================
# PRODUCTS & CATEGORIES API
# ============================================================

@cache_page(60 * 15)
def get_products(request):
    category_slug = request.GET.get('category')
    products = Product.objects.filter(is_active=True).select_related('category')
    if category_slug:
        products = products.filter(category__slug=category_slug)

    data = []
    for p in products:
        data.append({
            "id": p.id,
            "name": p.name,
            "price": float(p.price),
            "image": p.image.url if p.image else "",
            "category": p.category.name if p.category else "",
            "category_slug": p.category.slug if p.category else "",
            "category_id": p.category.id if p.category else "",
            "is_active": p.is_active,
        })
    return JsonResponse(data, safe=False)


@staff_member_required
def add_product(request):
    if request.method == "POST":
        try:
            name = request.POST.get("name")
            price = request.POST.get("price")
            category_id = request.POST.get("category")
            is_active = request.POST.get("is_active") == "true"
            image = request.FILES.get("image")

            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"error": err}, status=400)

            category = None
            if category_id:
                category = Category.objects.get(id=category_id)

            product = Product.objects.create(
                name=name,
                slug=get_unique_slug(Product, name),
                price=price,
                image=image,
                category=category,
                is_active=is_active
            )
            return JsonResponse({"status": "ok", "id": product.id})
        except Exception as e:
            logger.exception("Add product error")
            return safe_error_response()
    return safe_error_response("Method not allowed", 405)


@staff_member_required
def update_product(request, id):
    if request.method == "POST":
        try:
            product = Product.objects.get(id=id)
            product.name = request.POST.get("name", product.name)
            product.slug = get_unique_slug(Product, product.name, id)
            product.price = request.POST.get("price", product.price)

            if request.POST.get("category"):
                product.category = Category.objects.get(id=request.POST.get("category"))

            image = request.FILES.get("image")
            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"error": err}, status=400)
                if product.image and hasattr(product.image, 'path'):
                    product.image.delete(save=False)
                product.image = image

            product.is_active = request.POST.get("is_active") == "true"
            product.save()
            return JsonResponse({"status": "ok"})
        except Exception as e:
            logger.exception("Update product error")
            return safe_error_response()
    return safe_error_response("Method not allowed", 405)


@staff_member_required
def delete_product(request, id):
    if request.method == "DELETE":
        try:
            product = Product.objects.get(id=id)
            if product.image and hasattr(product.image, 'path'):
                product.image.delete(save=False)
            product.delete()
            return JsonResponse({"status": "ok"})
        except Exception as e:
            logger.exception("Delete product error")
            return safe_error_response()
    return safe_error_response("Method not allowed", 405)


def get_categories(request):
    cats = Category.objects.filter(is_active=True)
    data = []
    for c in cats:
        data.append({
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "icon": c.icon,
            "image": c.image.url if c.image else "",
            "is_active": c.is_active,
        })
    return JsonResponse(data, safe=False)


@staff_member_required
def add_category(request):
    if request.method == "POST":
        try:
            name = request.POST.get("name")
            icon = request.POST.get("icon")
            image = request.FILES.get("image")

            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"error": err}, status=400)

            cat = Category.objects.create(
                name=name,
                slug=get_unique_slug(Category, name),
                icon=icon,
                image=image
            )
            return JsonResponse({"status": "ok", "id": cat.id, "slug": cat.slug})
        except Exception as e:
            logger.exception("Add category error")
            return safe_error_response()
    return safe_error_response("Invalid", 405)


@staff_member_required
def update_category(request, category_id):
    cat = get_object_or_404(Category, id=category_id)
    if request.method == "POST":
        try:
            cat.name = request.POST.get("name", cat.name)
            cat.slug = get_unique_slug(Category, cat.name, category_id)
            cat.icon = request.POST.get("icon", cat.icon)
            image = request.FILES.get("image")
            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"error": err}, status=400)
                if cat.image and hasattr(cat.image, 'path'):
                    cat.image.delete(save=False)
                cat.image = image
            cat.save()
            return JsonResponse({"status": "ok"})
        except Exception as e:
            logger.exception("Update category error")
            return safe_error_response()
    return safe_error_response("Invalid", 405)


@staff_member_required
def delete_category(request, category_id):
    cat = get_object_or_404(Category, id=category_id)
    if cat.image and hasattr(cat.image, 'path'):
        cat.image.delete(save=False)
    cat.delete()
    return JsonResponse({"status": "ok"})


# ============================================================
# CART API
# ============================================================
def cart_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({"cart": [], "total": 0, "count": 0})

    try:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        items = CartItem.objects.filter(cart=cart).select_related('product')

        cart_items = []
        total = 0
        count = 0

        for item in items:
            if item.product:
                price = float(item.product.price)
                quantity = item.quantity

                cart_items.append({
                    "id": item.product.id,
                    "name": item.product.name,
                    "price": price,
                    "quantity": quantity,
                    "image": item.product.image.url if item.product.image else "",
                    "product_type": item.product.product_type,
                })

                total += price * quantity
                count += quantity

        return JsonResponse({
            "cart": cart_items,
            "total": round(total, 2),
            "count": count
        })

    except Exception as e:
        logger.error(f"Cart API error: {e}")
        return JsonResponse({
            "cart": [],
            "total": 0,
            "count": 0
        })

def add_to_cart(request):
    if not request.user.is_authenticated:
        return safe_error_response("Login required", 401)
    
    if request.method != "POST":
        return safe_error_response("POST required", 405)
    
    try:
        data = json.loads(request.body) if request.body else {}
    except Exception as e:
        logger.error(f"JSON parse error: {e}")
        return safe_error_response("Invalid JSON", 400)
    
    product_id = data.get("product_id")
    quantity = int(data.get("quantity", 1))
    
    if not product_id:
        return safe_error_response("product_id required", 400)
    
    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return safe_error_response("Product not found", 404)
    
    cart, _ = Cart.objects.get_or_create(user=request.user)
    cart_item, created = CartItem.objects.get_or_create(
        cart=cart,
        product=product,
        defaults={'quantity': quantity}
    )
    
    if not created:
        cart_item.quantity += quantity
        cart_item.save()
    
    cart_count = CartItem.objects.filter(cart=cart).aggregate(total=Sum('quantity'))['total'] or 0
    
    return JsonResponse({
        "status": "success",
        "message": f"{product.name} added to cart",
        "cart_count": cart_count
    })


def update_cart_item(request):
    if not request.user.is_authenticated:
        return safe_error_response("Login required", 401)
    
    if request.method != "POST":
        return safe_error_response("POST required", 405)
    
    try:
        data = json.loads(request.body) if request.body else {}
    except Exception as e:
        logger.error(f"JSON parse error: {e}")
        return safe_error_response("Invalid JSON", 400)
    
    product_id = data.get("product_id")
    quantity = int(data.get("quantity", 0))
    
    if not product_id:
        return safe_error_response("product_id required", 400)
    
    cart = Cart.objects.filter(user=request.user).first()
    if not cart:
        return safe_error_response("Cart not found", 404)
    
    if quantity <= 0:
        CartItem.objects.filter(cart=cart, product_id=product_id).delete()
    else:
        cart_item, created = CartItem.objects.get_or_create(
            cart=cart,
            product_id=product_id,
            defaults={'quantity': quantity}
        )
        if not created:
            cart_item.quantity = quantity
            cart_item.save()
    
    return JsonResponse({"status": "success"})


def remove_from_cart(request):
    if not request.user.is_authenticated:
        return safe_error_response("Login required", 401)
    
    if request.method != "POST":
        return safe_error_response("POST required", 405)
    
    try:
        data = json.loads(request.body) if request.body else {}
    except Exception as e:
        logger.error(f"JSON parse error: {e}")
        return safe_error_response("Invalid JSON", 400)
    
    product_id = data.get("product_id")
    
    if not product_id:
        return safe_error_response("product_id required", 400)
    
    cart = Cart.objects.filter(user=request.user).first()
    if cart:
        CartItem.objects.filter(cart=cart, product_id=product_id).delete()
    
    return JsonResponse({"status": "success"})


# ============================================================
# FAVORITES API
# ============================================================

def get_favorites(request):
    if not request.user.is_authenticated:
        return JsonResponse([], safe=False)
    
    try:
        favorites = Favorite.objects.filter(user=request.user).select_related('product')
        data = []
        for fav in favorites:
            if fav.product:
                data.append({
                    "id": fav.product.id,
                    "name": fav.product.name,
                    "price": float(fav.product.price),
                    "image": fav.product.image.url if fav.product.image else "",
                    "slug": fav.product.slug,
                })
        return JsonResponse(data, safe=False)
    except Exception as e:
        logger.error(f"Favorites API error: {e}")
        return JsonResponse([], safe=False)


def toggle_favorite(request):
    if not request.user.is_authenticated:
        return safe_error_response("Login required", 401)
    
    if request.method != "POST":
        return safe_error_response("POST required", 405)
    
    try:
        data = json.loads(request.body) if request.body else {}
    except Exception as e:
        logger.error(f"JSON parse error: {e}")
        return safe_error_response("Invalid JSON", 400)
    
    product_id = data.get("product_id")
    
    if not product_id:
        return safe_error_response("product_id required", 400)
    
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return safe_error_response("Product not found", 404)
    
    fav, created = Favorite.objects.get_or_create(
        user=request.user,
        product=product
    )
    
    if not created:
        fav.delete()
        return JsonResponse({"status": "removed", "is_favorite": False})
    
    return JsonResponse({"status": "added", "is_favorite": True})


@login_required
def get_order(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    if request.user != order.user and not request.user.is_staff:
        return safe_error_response("Unauthorized", 403)

    items = order.items.all()
    received_amount = order.received_amount if order.received_amount else 0
    remaining_amount = order.total - received_amount
    
    data = {
        "id": order.id,
        "name": order.name,
        "phone": order.phone,
        "address": order.address,
        "total": float(order.total),
        "received_amount": float(received_amount),
        "remaining_amount": float(remaining_amount),
        "status": order.status,
        "status_display": order.get_status_display(),
        "payment_status": order.payment_status,
        "created_at": order.created_at.isoformat(),
        "items": [{"name": i.product_name, "price": float(i.product_price), "quantity": i.quantity} for i in items],
    }
    return JsonResponse(data)


# ============================================================
# REMAINING PAYMENT FLOW
# ============================================================

@login_required
@require_POST
def pay_remaining_amount(request, order_id):
    try:
        order = get_object_or_404(Order, id=order_id, user=request.user)
        if order.payment_status != 'partial_paid':
            return JsonResponse({
                "status": "error",
                "error": "Remaining payment is not required for this order."
            }, status=400)

        transaction_id = request.POST.get('transaction_id', '').strip().upper()
        screenshot = request.FILES.get('payment_screenshot')

        if not transaction_id:
            return JsonResponse({"status": "error", "error": "Transaction ID is required."}, status=400)
        if not screenshot:
            return JsonResponse({"status": "error", "error": "Payment screenshot is required."}, status=400)

        err = validate_image_file(screenshot)
        if err:
            return JsonResponse({"status": "error", "error": err}, status=400)

        if Order.objects.filter(remaining_transaction_id=transaction_id).exclude(id=order.id).exists():
            increment_suspicious_attempts(request.user)
            return JsonResponse({"status": "error", "error": "Transaction ID already used."}, status=400)

        file_hash = get_file_hash(screenshot)
        if Order.objects.filter(remaining_screenshot_hash=file_hash).exclude(id=order.id).exists():
            increment_suspicious_attempts(request.user)
            return JsonResponse({"status": "error", "error": "This screenshot has already been used."}, status=400)

        order.remaining_transaction_id = transaction_id
        order.remaining_payment_screenshot = screenshot
        order.remaining_screenshot_hash = file_hash
        order.remaining_payment_verified = False
        order.verification_note = "Remaining payment submitted. Awaiting admin verification."
        order.save()
        clear_dashboard_cache()
        return JsonResponse({
            "status": "success",
            "message": "Remaining payment submitted. Waiting for admin verification.",
            "order_id": order.id,
            "payment_status": order.payment_status
        })
    except Exception as e:
        logger.exception("Remaining payment error")
        increment_suspicious_attempts(request.user)
        return JsonResponse({"status": "error", "error": "Something went wrong."}, status=500)


# ============================================================
# PLACE ORDER (FIXED – removed broken deal code)
# ============================================================

@retry_on_lock(max_retries=5, delay=0.2)
@transaction.atomic
@login_required
@ratelimit(key='user', rate='3/m', block=True)
def place_order(request):
    if not request.user.is_authenticated:
        return safe_error_response("Login required", 401)
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    try:
        if hasattr(request.user, 'profile') and getattr(request.user.profile, 'suspicious_attempts', 0) >= 5:
            return JsonResponse({"error": "Too many suspicious attempts. Contact support."}, status=403)

        cart = get_or_create_cart(request)
        if not cart or not cart.items.exists():
            return JsonResponse({"error": "Cart is empty"}, status=400)

        if request.content_type and 'multipart/form-data' in request.content_type:
            name = request.POST.get("name", "").strip()
            phone = request.POST.get("phone", "").strip()
            address = request.POST.get("address", "").strip()
            payment_method = request.POST.get("payment_method", "")
            delivery_datetime = request.POST.get("delivery_datetime", "")
            transaction_id = request.POST.get("transaction_id", "").strip().upper()
            product_info = request.POST.get("product_info", "")
            theme = request.POST.get("theme", "")
            cake_message = request.POST.get("cake_message", "")
            instructions = request.POST.get("instructions", "")
            eggless = request.POST.get("eggless", "No")
            cart_items_json = request.POST.get("cart_items", "[]")
            screenshot = request.FILES.get("payment_screenshot")
            try:
                cart_items = json.loads(cart_items_json)
            except:
                cart_items = []
        else:
            data = safe_json_parse(request)
            if not data:
                return safe_error_response("Invalid JSON", 400)
            name = data.get("name", "").strip()
            phone = data.get("phone", "").strip()
            address = data.get("address", "").strip()
            payment_method = data.get("payment_method", "")
            delivery_datetime = data.get("delivery_datetime", "")
            transaction_id = data.get("transaction_id", "").strip().upper()
            product_info = data.get("product_info", "")
            theme = data.get("theme", "")
            cake_message = data.get("cake_message", "")
            instructions = data.get("instructions", "")
            eggless = data.get("eggless", "No")
            cart_items = data.get("cart_items", [])
            screenshot = None

        received_amount = Decimal("0")
        ocr_warnings = []

        total = Decimal("0")
        for item in cart_items:
            try:
                price = Decimal(str(item.get("price", 0)))
            except:
                price = Decimal("0")
            quantity = int(item.get("quantity", 1))
            total += price * quantity

        if total <= 0:
            return JsonResponse({"error": "Cart is empty"}, status=400)

        if payment_method in ["jazzcash", "easypaisa"]:
            if not transaction_id:
                transaction_id = generate_unique_transaction_id(payment_method)
                logger.info(f"Auto-generated Transaction ID: {transaction_id}")
            
            transaction_id = transaction_id.upper().strip()
            transaction_id = transaction_id.replace(':', '').replace(' ', '').replace('-', '').replace('_', '')
            if transaction_id.startswith('ID#'):
                transaction_id = 'EP' + transaction_id[3:]
            if transaction_id.startswith('TID'):
                if payment_method == 'jazzcash':
                    transaction_id = 'JC' + transaction_id[3:]
                else:
                    transaction_id = 'EP' + transaction_id[3:]
            if transaction_id[:2] in ['EP', 'JC']:
                prefix = transaction_id[:2]
                numbers = re.sub(r'[^0-9]', '', transaction_id[2:])
                transaction_id = prefix + numbers
            else:
                if payment_method == 'easypaisa':
                    numbers = re.sub(r'[^0-9]', '', transaction_id)
                    transaction_id = 'EP' + numbers
                elif payment_method == 'jazzcash':
                    numbers = re.sub(r'[^0-9]', '', transaction_id)
                    transaction_id = 'JC' + numbers
            if len(transaction_id) < 8:
                return JsonResponse({"error": "Transaction ID must be at least 8 characters."}, status=400)
            if not transaction_id[:2].upper() in ['EP', 'JC']:
                return JsonResponse({"error": "Transaction ID must start with EP or JC"}, status=400)
            if Order.objects.filter(transaction_id=transaction_id).exists():
                increment_suspicious_attempts(request.user)
                return JsonResponse({"error": "This Transaction ID has already been used."}, status=400)
            if not screenshot:
                return JsonResponse({"error": "Payment screenshot is required"}, status=400)
            file_hash = get_file_hash(screenshot)
            if Order.objects.filter(screenshot_hash=file_hash).exists():
                increment_suspicious_attempts(request.user)
                return JsonResponse({"error": "This screenshot has already been used."}, status=400)
            
            temp_path = save_screenshot_temp(screenshot)
            if temp_path and os.path.exists(temp_path):
                detected_amount, ocr_warnings = detect_amount_from_screenshot(temp_path)
                if detected_amount > 0:
                    received_amount = min(detected_amount, total)
                    logger.info(f"✅ Using detected amount: {received_amount}")
                else:
                    received_amount = total * Decimal("0.5")
                try:
                    os.unlink(temp_path)
                except:
                    pass
            else:
                received_amount = total * Decimal("0.5")
                ocr_warnings.append("Could not process screenshot")
            if received_amount > total:
                received_amount = total
            
            payment_status, _, remaining_amount = calculate_payment_status(total, received_amount, payment_method)
        else:  # COD
            transaction_id = ""
            file_hash = None
            received_amount = Decimal("0")
            remaining_amount = total
            payment_status = "under_review"
            screenshot = None

        if not name or not phone or not address or not payment_method:
            return JsonResponse({"error": "Please fill all customer details"}, status=400)
        if not validate_pakistani_phone(phone):
            return JsonResponse({"error": "Invalid Pakistani phone number. Use 03XXXXXXXXX"}, status=400)
        if delivery_datetime:
            try:
                dt = parse_datetime(delivery_datetime)
                if dt:
                    if timezone.is_naive(dt):
                        dt = make_aware(dt)
                    if dt < timezone.now() + timedelta(hours=6):
                        return JsonResponse({"error": "Orders must be placed at least 6 hours before delivery"}, status=400)
            except:
                pass

        # ✅ FIXED: removed references to non-existent 'deal' and 'whatsapp_lead'
        order = Order.objects.create(
            user=request.user,
            session_key=request.session.session_key,
            name=name,
            phone=phone,
            address=address,
            payment_method=payment_method,
            order_type='website',
            transaction_id=transaction_id,
            payment_screenshot=screenshot,
            screenshot_hash=file_hash,
            total=total,
            received_amount=received_amount,
            remaining_amount=remaining_amount,
            payment_status=payment_status,
            status="pending",
            payment_verified=False,
            customization={
                "product_info": product_info,
                "theme": theme,
                "cake_message": cake_message,
                "instructions": instructions,
                "eggless": eggless,
                "delivery_datetime": delivery_datetime,
                "ocr_warnings": ocr_warnings
            }
        )

        for item in cart_items:
            OrderItem.objects.create(
                order=order,
                product_name=item.get("name", ""),
                product_price=Decimal(str(item.get("price", 0))) if str(item.get("price", 0)).replace('.','',1).isdigit() else Decimal("0"),
                quantity=int(item.get("quantity", 1))
            )

        invoice_text = generate_invoice_text(order)
        order.invoice_text = invoice_text
        order.save(update_fields=['invoice_text'])

        cart.items.all().delete()
        clear_dashboard_cache()

        phone_clean = format_phone(phone)
        wa_message = f"""🎉 *IK Delights - Order Confirmation* 🎉

Dear {name},

✅ Your order has been placed successfully!

📋 *Order ID:* #{order.id}
🔑 *Transaction ID:* {transaction_id if payment_method in ['jazzcash', 'easypaisa'] else 'COD'}
💰 *Total Amount:* Rs {total:,.2f}
💳 *Amount Received:* Rs {received_amount:,.2f}
💰 *Remaining:* Rs {remaining_amount:,.2f}
📦 *Status:* {order.get_payment_status_display()}
📍 *Delivery Address:* {address}

We will notify you once your order is confirmed.

*Thank you for choosing IK Delights!* 💖"""

        wa_link = f"https://wa.me/{phone_clean}?text={quote(wa_message)}" if phone_clean else None

        return JsonResponse({
            "status": "success",
            "order_id": order.id,
            "transaction_id": transaction_id if payment_method in ["jazzcash", "easypaisa"] else "COD",
            "invoice_text": invoice_text,
            "wa_link": wa_link,
            "message": "Order placed successfully!",
            "ocr_warnings": ocr_warnings
        })

    except Exception as e:
        logger.exception("Place order failed")
        increment_suspicious_attempts(request.user)
        return safe_error_response(str(e))


# ============================================================
# CONFIRM ADVANCE PAYMENT
# ============================================================

@staff_member_required
def confirm_advance_payment(request, order_id):
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    try:
        order = get_object_or_404(Order, id=order_id)
        if order.payment_status != "under_review":
            return JsonResponse({"error": f"Cannot confirm. Current status: {order.payment_status}"}, status=400)
        
        if order.received_amount == 0:
            order.received_amount = order.total * Decimal('0.5')
        order.remaining_amount = order.total - order.received_amount
        order.payment_status = 'partial_paid'
        order.payment_verified = False
        order.verified_at = timezone.now()
        order.save()
        
        clear_dashboard_cache()
        phone_clean = format_phone(order.phone)
        wa_message = f"""✅ *IK Delights - Payment Confirmed* ✅

Dear {order.name},

Your payment of Rs {order.received_amount:,.2f} has been confirmed.

📋 Order #{order.id} is now CONFIRMED.
💰 Remaining: Rs {order.remaining_amount:,.2f}

Thank you! 💖"""
        wa_link = f"https://wa.me/{phone_clean}?text={quote(wa_message)}" if phone_clean else None
        
        return JsonResponse({
            "status": "success",
            "order_id": order.id,
            "payment_status": order.payment_status,
            "order_status": order.status,
            "received_amount": float(order.received_amount),
            "remaining_amount": float(order.remaining_amount),
            "wa_link": wa_link,
            "message": "Payment confirmed"
        })
    except Exception as e:
        logger.exception("Confirm advance payment error")
        return safe_error_response()


# ============================================================
# CONFIRM REMAINING PAYMENT
# ============================================================

@staff_member_required
def confirm_remaining_payment(request, order_id):
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    try:
        order = get_object_or_404(Order, id=order_id)
        if order.payment_status != "partial_paid":
            return JsonResponse({"error": f"Cannot confirm. Current payment status: {order.payment_status}"}, status=400)
        if not order.remaining_transaction_id and not order.remaining_payment_screenshot:
            return JsonResponse({"error": "No remaining payment submitted by customer yet."}, status=400)
        if order.status not in ["out_for_delivery", "delivered", "confirmed", "processing", "baking", "packed"]:
            return JsonResponse({"error": f"Order status is '{order.status}'. Remaining payment can only be confirmed when order is in out_for_delivery or delivered state."}, status=400)
        
        old_payment_status = order.payment_status
        order.payment_status = 'fully_paid'
        order.payment_verified = True
        order.remaining_payment_verified = True
        order.received_amount = order.total
        order.remaining_amount = 0
        if order.status != 'delivered':
            order.status = 'delivered'
        order.verified_at = timezone.now()
        order.save()
        
        clear_dashboard_cache()
        invoice_text = generate_invoice_text(order)
        phone_clean = format_phone(order.phone)
        wa_message = f"""🎉 *IK Delights - Order Complete* 🎉

Dear {order.name},

✅ Your remaining payment has been received and verified.

📋 Order #{order.id} is now COMPLETE and DELIVERED.

Thank you for choosing IK Delights! 💖"""
        wa_link = f"https://wa.me/{phone_clean}?text={quote(wa_message)}" if phone_clean else None
        
        return JsonResponse({
            "status": "success",
            "order_id": order.id,
            "old_payment_status": old_payment_status,
            "new_payment_status": order.payment_status,
            "order_status": order.status,
            "remaining_amount": float(order.remaining_amount),
            "invoice_text": invoice_text,
            "wa_link": wa_link,
            "message": "Remaining payment confirmed. Order is now complete."
        })
    except Exception as e:
        logger.exception("Confirm remaining payment error")
        return safe_error_response()


# ============================================================
# GET ORDER PAYMENT DETAILS
# ============================================================

@login_required
def get_order_payment_details(request, order_id):
    order = get_object_or_404(Order, id=order_id)
    if not (request.user.is_staff or request.user == order.user):
        return safe_error_response("Unauthorized", 403)
    received_amount = order.received_amount if order.received_amount else 0
    return JsonResponse({
        "order_id": order.id,
        "total": float(order.total),
        "received_amount": float(received_amount),
        "remaining_amount": float(order.total - received_amount),
        "payment_status": order.payment_status,
        "status": order.status,
        "payment_verified": order.payment_verified,
        "transaction_id": order.transaction_id,
        "remaining_transaction_id": order.remaining_transaction_id,
        "remaining_payment_verified": order.remaining_payment_verified,
        "created_at": order.created_at.isoformat()
    })


# ============================================================
# CONFIRM PAYMENT (compatibility)
# ============================================================

@transaction.atomic
@login_required
@ratelimit(key='user', rate='10/m', block=True)
def confirm_payment(request):
    if request.method != "POST":
        return safe_error_response("Invalid method", 405)

    try:
        transaction_id = request.POST.get("transaction_id", "").strip().upper()
        order_id = request.POST.get("order_id")
        screenshot = request.FILES.get("payment_screenshot")

        if not order_id:
            return JsonResponse({"error": "Order ID required"}, status=400)

        order = get_object_or_404(Order, id=order_id)
        if order.user != request.user and not request.user.is_staff:
            return safe_error_response("Unauthorized", 403)

        if screenshot:
            err = validate_image_file(screenshot)
            if err:
                return JsonResponse({"error": err}, status=400)

        if transaction_id:
            if Order.objects.filter(transaction_id=transaction_id).exclude(id=order.id).exists():
                return JsonResponse({"error": "Transaction ID already used"}, status=400)

        if not screenshot:
            return JsonResponse({"error": "Payment screenshot required"}, status=400)

        file_hash = get_file_hash(screenshot)
        if Order.objects.filter(screenshot_hash=file_hash).exclude(id=order.id).exists():
            increment_suspicious_attempts(request.user)
            return JsonResponse({"error": "This screenshot has already been used"}, status=400)

        order.transaction_id = transaction_id
        order.payment_screenshot = screenshot
        order.screenshot_hash = file_hash
        order.payment_status = 'under_review'
        order.payment_verified = False
        order.save()
        clear_dashboard_cache()
        return JsonResponse({"status": "success", "message": "Payment submitted for review"})
    except Exception as e:
        logger.exception("Confirm payment error")
        return safe_error_response()


# ============================================================
# UPDATE ORDER STATUS
# ============================================================

@staff_member_required
@ratelimit(key='user', rate='30/m', block=True)
def update_order_status(request, order_id):
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    try:
        if request.content_type == 'application/json':
            data = safe_json_parse(request)
            if not data:
                return safe_error_response("Invalid JSON", 400)
            new_status = data.get("status")
            notes = data.get("notes", "")
        else:
            new_status = request.POST.get("status")
            notes = request.POST.get("notes", "")

        if not new_status:
            return JsonResponse({"error": "Status required"}, status=400)

        valid_statuses = ['pending', 'confirmed', 'processing', 'baking', 'packed', 'out_for_delivery', 'delivered', 'cancelled']
        if new_status not in valid_statuses:
            return JsonResponse({"error": "Invalid status"}, status=400)

        order = get_object_or_404(Order, id=order_id)
        flow = {
            'pending': ['confirmed', 'cancelled'],
            'confirmed': ['processing', 'cancelled'],
            'processing': ['baking', 'cancelled'],
            'baking': ['packed', 'cancelled'],
            'packed': ['out_for_delivery', 'cancelled'],
            'out_for_delivery': ['delivered', 'cancelled'],
            'delivered': [],
            'cancelled': []
        }

        if new_status not in flow.get(order.status, []):
            return JsonResponse({"error": f"Cannot change from {order.status} to {new_status}"}, status=400)

        old_status = order.status
        order.status = new_status
        
        if order.payment_method == 'cod' and new_status == 'delivered':
            order.payment_status = 'fully_paid'
            order.payment_verified = True
            order.received_amount = order.total
            order.remaining_amount = 0
            order.verified_at = timezone.now()
        
        order.save()
        
        clear_dashboard_cache()

        status_messages = {
            'confirmed': f"✅ IK Delights - Order Confirmed ✅\n\nDear {order.name},\n\nYour order #{order.id} has been CONFIRMED!\n\n💰 Total: Rs {order.total}\n💳 Payment: {order.payment_method.upper()}\n📍 Delivery: {order.address}\n\nThank you for choosing IK Delights! 🎂",
            'processing': f"⏳ IK Delights - Order Processing ⏳\n\nDear {order.name},\n\nYour order #{order.id} is now being PROCESSED.\n\nOur chefs are preparing your treats with love. ❤️\n\nIK Delights 🍰",
            'baking': f"🔥 IK Delights - Order Being Baked 🔥\n\nDear {order.name},\n\nYour order #{order.id} is currently being BAKED!\n\nFresh treats coming soon! 🎂\n\nIK Delights",
            'packed': f"📦 IK Delights - Order Packed 📦\n\nDear {order.name},\n\nYour order #{order.id} has been PACKED and is ready for delivery.\n\n🚚 Delivery partner will pick it up soon.\n\nIK Delights",
            'out_for_delivery': f"🚚 IK Delights - Order Out for Delivery 🚚\n\nDear {order.name},\n\nYour order #{order.id} is OUT FOR DELIVERY!\n\nPlease keep your phone handy. Our rider will contact you shortly.\n\nIK Delights 🎂",
            'delivered': f"🎉 IK Delights - Order Delivered 🎉\n\nDear {order.name},\n\nYour order #{order.id} has been DELIVERED successfully!\n\nWe hope you enjoy your treats! 💖\n\nPlease leave a review on our website.\n\nThank you! 🍰",
            'cancelled': f"❌ IK Delights - Order Cancelled ❌\n\nDear {order.name},\n\nYour order #{order.id} has been CANCELLED.\n\nReason: {notes if notes else 'Not specified'}\n\nContact support for questions.\n\nIK Delights"
        }

        message = status_messages.get(new_status, f"Order #{order.id} status is now {new_status}")
        if notes and new_status != 'cancelled':
            message += f"\n\n📝 Note: {notes}"

        phone = format_phone(order.phone)
        whatsapp_link = f"https://wa.me/{phone}?text={quote(message)}" if phone else None

        return JsonResponse({
            "status": "ok",
            "order_id": order.id,
            "old_status": old_status,
            "new_status": new_status,
            "whatsapp_link": whatsapp_link,
            "total": float(order.total)
        })
    except Exception as e:
        logger.exception("Update order status error")
        return safe_error_response()


# ============================================================
# UPDATE PAYMENT STATUS (FINAL – with debug prints)
# ============================================================
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

@csrf_exempt   # Temporary - CSRF bypass for testing
@require_POST  # Ensures only POST requests
def update_payment_status(request, order_id):
    # ========== STAFF CHECK WITH JSON RESPONSE ==========
    if not request.user.is_authenticated or not request.user.is_staff:
        return JsonResponse({
            "status": "error",
            "error": "Authentication required. Please login as admin."
        }, status=403)

    # ========== JSON PARSING ==========
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {e}")
        return JsonResponse({"status": "error", "error": "Invalid JSON format"}, status=400)

    payment_status = data.get("payment_status")
    notes = data.get("notes", "")
    confirm_remaining = data.get("confirm_remaining", False)
    received_amount_input = data.get("received_amount", None)

    if not payment_status:
        return JsonResponse({"error": "payment_status required"}, status=400)

    valid_statuses = ['under_review', 'partial_paid', 'fully_paid', 'rejected']
    if payment_status not in valid_statuses:
        return JsonResponse({"error": "Invalid payment status"}, status=400)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"error": "Order not found"}, status=404)

    old_payment_status = order.payment_status

    # ========== PAYMENT UPDATE LOGIC ==========
    if confirm_remaining and order.payment_status == "partial_paid":
        if order.remaining_transaction_id or order.remaining_payment_screenshot:
            order.payment_status = 'fully_paid'
            order.payment_verified = True
            order.remaining_payment_verified = True
            order.received_amount = order.total
            order.remaining_amount = 0
            if order.status != 'delivered':
                order.status = 'delivered'
            order.verified_at = timezone.now()
            order.save()
        else:
            return JsonResponse({"error": "No remaining payment submitted by customer yet."}, status=400)
    else:
        if received_amount_input is not None:
            try:
                received_amount = Decimal(str(received_amount_input))
                order.received_amount = received_amount
                order.remaining_amount = order.total - received_amount
                if received_amount >= order.total:
                    order.payment_status = 'fully_paid'
                elif received_amount >= order.total * Decimal('0.5'):
                    order.payment_status = 'partial_paid'
                else:
                    order.payment_status = 'under_review'
            except Exception:
                return JsonResponse({"error": "Invalid received_amount"}, status=400)
        else:
            order.payment_status = payment_status
            if payment_status == 'fully_paid':
                order.received_amount = order.total
                order.remaining_amount = 0
            elif payment_status == 'partial_paid' and order.received_amount == 0:
                order.received_amount = order.total * Decimal('0.5')
                order.remaining_amount = order.total - order.received_amount

        # Auto-update order status
        if order.payment_status == 'fully_paid':
            order.payment_verified = True
            order.status = 'processing'
            order.verified_at = timezone.now()
        elif order.payment_status == 'rejected':
            order.payment_verified = False
            order.status = 'cancelled'
        elif order.payment_status == 'partial_paid':
            order.payment_verified = False
            order.status = 'processing'
        else:  # under_review
            order.payment_verified = False

        order.verification_note = notes

        # DEBUG PRINTS (terminal mein dekhein)
        print("========== PAYMENT UPDATE DEBUG ==========")
        print("ORDER ID:", order.id)
        print("TOTAL:", order.total)
        print("RECEIVED:", order.received_amount)
        print("REMAINING:", order.remaining_amount)
        print("PAYMENT STATUS:", order.payment_status)
        print("===========================================")

        order.save()

    clear_dashboard_cache()

    # ========== WHATSAPP MESSAGE ==========
    payment_messages = {
        "under_review": f"💳 IK Delights - Payment Under Review 💳\n\nDear {order.name},\n\nYour payment for order #{order.id} is currently UNDER REVIEW.\n\n💰 Amount: Rs {order.received_amount}\n\nWe will notify you once verified.\n\nThank you for your patience! 🎂",
        "partial_paid": f"✅ IK Delights - Payment Confirmed ✅\n\nDear {order.name},\n\nYour payment of Rs {order.received_amount} for order #{order.id} has been CONFIRMED!\n\n💰 Total Amount: Rs {order.total}\n💰 Remaining: Rs {order.remaining_amount}\n\nYour order is now CONFIRMED and will be prepared soon.\n\nThank you for choosing IK Delights! 💖",
        "fully_paid": f"🎉 IK Delights - Full Payment Received 🎉\n\nDear {order.name},\n\nYour full payment of Rs {order.total} for order #{order.id} has been RECEIVED!\n\n✅ Payment Complete\n✅ Order Status: {order.status.upper()}\n\nThank you for your trust in IK Delights! 🍰",
        "rejected": f"❌ IK Delights - Payment Rejected ❌\n\nDear {order.name},\n\nWe regret to inform you that your payment for order #{order.id} could not be verified.\n\nReason: {notes if notes else 'Payment verification failed'}\n\nPlease contact our support team for assistance.\n\nIK Delights Support"
    }

    message = payment_messages.get(order.payment_status, f"Payment status for Order #{order.id} updated to {order.payment_status}")
    if notes and order.payment_status == 'rejected':
        message += f"\n\n📝 Note: {notes}"

    phone = format_phone(order.phone)
    from urllib.parse import quote
    whatsapp_link = f"https://wa.me/{phone}?text={quote(message)}" if phone else None

    return JsonResponse({
        "status": "ok",
        "order_id": order.id,
        "old_payment_status": old_payment_status,
        "new_payment_status": order.payment_status,
        "order_status": order.status,
        "received_amount": float(order.received_amount),
        "remaining_amount": float(order.remaining_amount),
        "remaining_transaction_id": order.remaining_transaction_id,
        "remaining_payment_verified": order.remaining_payment_verified,
        "whatsapp_link": whatsapp_link
    })
# ============================================================
# REVIEWS
# ============================================================

def get_reviews(request):
    reviews = Review.objects.all().order_by("-created_at")
    data = []
    for r in reviews:
        data.append({
            "id": r.id,
            "name": r.name,
            "city": r.city,
            "rating": r.rating,
            "comment": r.comment,
            "created_at": r.created_at.strftime("%Y-%m-%d"),
        })
    return JsonResponse(data, safe=False)


@ratelimit(key='ip', rate='3/m', block=True)
def submit_review(request):
    if request.method == "POST":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)

        name = escape(data.get("name", ""))
        city = escape(data.get("city", ""))
        comment = escape(data.get("comment", ""))
        rating = data.get("rating", 5)

        if not name or not comment:
            return JsonResponse({"error": "Name and comment required"}, status=400)
        if not 1 <= rating <= 5:
            return JsonResponse({"error": "Rating must be 1-5"}, status=400)

        review = Review.objects.create(name=name, city=city, rating=rating, comment=comment)
        return JsonResponse({"id": review.id, "status": "ok"})
    return safe_error_response("Invalid", 405)


@staff_member_required
def delete_review(request, review_id):
    Review.objects.filter(id=review_id).delete()
    return JsonResponse({"status": "ok"})


@staff_member_required
def update_review(request, review_id):
    if request.method == "PUT":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)
        review = get_object_or_404(Review, id=review_id)
        review.comment = escape(data.get("comment", review.comment))
        review.rating = data.get("rating", review.rating)
        review.save()
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid", 405)


# ============================================================
# CONTACT
# ============================================================

@ratelimit(key='ip', rate='5/m', block=True)
def contact_submit(request):
    if request.method == "POST":
        name = escape(request.POST.get("name", "").strip())
        email = escape(request.POST.get("email", "").strip())
        phone = escape(request.POST.get("phone", "").strip())
        message = escape(request.POST.get("message", "").strip())

        if not all([name, email, message]):
            return JsonResponse({"error": "Name, email, message required"}, status=400)

        ContactMessage.objects.create(name=name, email=email, phone=phone, message=message, status="pending")
        clear_dashboard_cache()
        return JsonResponse({"status": "ok", "message": "Message sent successfully!"})
    return safe_error_response("Invalid method", 405)


# ============================================================
# SELECT DEAL
# ============================================================

@csrf_exempt
def select_deal(request):
    if request.method != 'POST':
        return safe_error_response('POST required', 400)

    try:
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)

        deal = data.get('deal')
        inquiry_id = data.get('inquiry_id')
        answers = data.get('answers', {})

        if not deal or not inquiry_id:
            return JsonResponse({'error': 'Missing deal or inquiry ID'}, status=400)

        inquiry = get_object_or_404(BakingInquiry, id=inquiry_id)
        inquiry.selected_deal = deal
        inquiry.total_estimated_price = Decimal(str(deal.get('total_selling', 0)))
        inquiry.save()

        deal_total = Decimal(str(deal.get('total_selling', 0)))

        wa_message = f"""🎉 *IK Delights – Your Deal Inquiry* 🎉

📋 *Deal Details*
▸ Deal: {deal.get('name', 'Deal')}
▸ Total Price: PKR {deal_total:,.2f}
▸ Advance (70%): PKR {deal_total * Decimal("0.7"):,.2f}
▸ Remaining: PKR {deal_total * Decimal("0.3"):,.2f}

💳 *Payment Instructions*
Please send 70% advance to JazzCash: {settings.BUSINESS_NUMBER}

*Thank you for choosing IK Delights!* 🍰"""

        phone = answers.get('phone', '')
        if not phone:
            return JsonResponse({'error': 'Customer phone number missing'}, status=400)

        phone_clean = format_phone(phone)
        if not phone_clean:
            return JsonResponse({'error': 'Invalid phone number'}, status=400)

        wa_link = f"https://wa.me/{phone_clean}?text={quote(wa_message)}"

        return JsonResponse({
            'status': 'deal_selected',
            'wa_link': wa_link,
            'inquiry_id': inquiry.id,
            'message': 'Deal selected. Please complete payment to confirm.'
        })
    except Exception as e:
        logger.exception("Select deal error")
        return safe_error_response()


# ============================================================
# EVENT PLANNER API
# ============================================================

@ratelimit(key='ip', rate='5/m', block=True)
def event_planner_api(request):
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    data = safe_json_parse(request)
    if not data:
        return safe_error_response("Invalid JSON", 400)

    guests = int(data.get("guests", 25))
    budget = int(data.get("budget", 5000))
    cake_size = str(data.get("cake_size") or "2 Pound").strip()
    cake_flavor = str(data.get("cake_flavor") or "Chocolate").strip()
    extras = data.get("extras", [])

    silver_total = int(budget * 0.6)
    gold_total = int(budget * 0.85)
    premium_total = int(budget)

    packages = []

    silver_items = [{"product": f"{cake_size} {cake_flavor} Cake", "quantity": 1, "customer_price": silver_total}]
    if extras:
        silver_items.append({"product": "Assorted Desserts", "quantity": "6 pcs", "customer_price": int(silver_total * 0.2)})
    packages.append({"name": "Silver Package", "total_selling": silver_total, "items": silver_items, "recommended": budget <= 10000})

    gold_items = [
        {"product": f"{cake_size} {cake_flavor} Premium Cake", "quantity": 1, "customer_price": int(gold_total * 0.7)},
        {"product": "Cupcakes", "quantity": 6, "customer_price": int(gold_total * 0.3)}
    ]
    if extras:
        gold_items.append({"product": "Dessert Platter", "quantity": "6 pcs", "customer_price": int(gold_total * 0.15)})
    packages.append({"name": "Gold Package", "total_selling": gold_total, "items": gold_items, "recommended": 10000 < budget <= 25000})

    premium_items = [
        {"product": f"{cake_size} Luxury {cake_flavor} Cake", "quantity": 1, "customer_price": int(premium_total * 0.5)},
        {"product": "Cupcakes", "quantity": 12, "customer_price": int(premium_total * 0.25)},
        {"product": "Brownies", "quantity": 12, "customer_price": int(premium_total * 0.25)}
    ]
    if extras:
        premium_items.append({"product": "Gourmet Desserts", "quantity": "12 pcs", "customer_price": int(premium_total * 0.2)})
    packages.append({"name": "Premium Package", "total_selling": premium_total, "items": premium_items, "recommended": budget > 25000})

    return JsonResponse({
        "status": "success",
        "packages": packages,
        "guests": guests,
        "budget": budget,
        "cake_size": cake_size,
        "cake_flavor": cake_flavor
    })

# ============================================================
# ENHANCED EVENT BOOKING SUBMIT
# ============================================================

@csrf_exempt
@ratelimit(key='ip', rate='5/m', block=True)
def save_event_planner_order(request):
    if request.method == 'POST':
        try:
            if request.content_type == 'application/json':
                data = json.loads(request.body)
                customer_name = data.get('customer_name', '')
                relation_name = data.get('relation_name', '')
                phone = data.get('whatsapp_number', '')
                event_type = data.get('event_type', '')
                guest_count = data.get('guest_count', 0)
                total_budget = data.get('total_budget', 0)
                advance_payment = data.get('advance_payment', 0)
                remaining_amount = data.get('remaining_amount', 0)
                package_name = data.get('package_name', '')
                order_summary = data.get('order_summary', {})
                event_date = data.get('event_date', '')
                pickup_time = data.get('pickup_time', '')
                delivery_type = data.get('delivery_type', 'Pickup')
                special_instructions = data.get('special_instructions', '')
                reference_image = None
            else:
                order_summary = json.loads(request.POST.get('order_summary', '{}'))
                total_budget = Decimal(request.POST.get('total_budget') or 0)
                advance_payment = Decimal(request.POST.get('advance_payment') or 0)
                remaining_amount = Decimal(request.POST.get('remaining_amount') or 0)
                customer_name = request.POST.get('customer_name', '')
                relation_name = request.POST.get('relation_name', '')
                phone = request.POST.get('whatsapp_number', '')
                event_type = request.POST.get('event_type', '')
                guest_count = request.POST.get('guest_count', 0)
                package_name = request.POST.get('package_name', '')
                event_date = request.POST.get('event_date', '')
                pickup_time = request.POST.get('pickup_time', '') or None
                delivery_type = request.POST.get('delivery_type', 'Pickup')
                special_instructions = request.POST.get('special_instructions', '')
                reference_image = request.FILES.get('reference_image')

            try:
                guest_count = int(guest_count)
            except (TypeError, ValueError):
                guest_count = 0

            if reference_image:
                image_error = validate_image_file(reference_image)
                if image_error:
                    return JsonResponse({'success': False, 'error': image_error})

            total_budget_dec = Decimal(total_budget)
            advance_payment_dec = Decimal(advance_payment) if advance_payment else Decimal('0')
            remaining_amount_calc = total_budget_dec - advance_payment_dec
            event = EventBooking.objects.create(
                customer_name=customer_name,
                relation_name=relation_name,
                phone=phone,
                address='Event Planner Order',
                event_type=event_type,
                guests=guest_count,
                budget=total_budget,
                total_price=total_budget_dec,
                planner_answers=order_summary,
                event_date=event_date,
                pickup_time=pickup_time,
                event_image=reference_image,
                status='Pending'
            )

            phone_clean = format_phone(event.phone)
            wa_message = f"""
🎉 IK Delights Event Booking Confirmed 🎉

👤 Customer: {event.customer_name}

🎂 Event Type: {event.event_type}

👥 Guests: {event.guests}

📦 Package: {event.selected_package}

💰 Total: Rs {event.total_price}

💵 Advance: Rs {event.advance_payment}

💰 Remaining: Rs {event.remaining_amount}

📅 Event Date: {event.event_date}

Thank you for choosing IK Delights 💖
"""
            wa_link = f"https://wa.me/{phone_clean}?text={quote(wa_message)}" if phone_clean else None

            return JsonResponse({
                'success': True,
                'event_id': event.id,
                'wa_link': wa_link
            })
        except Exception as e:
            logger.exception("Save event planner order error")
            return JsonResponse({'success': False, 'error': str(e)})
    return JsonResponse({'success': False, 'error': 'Only POST allowed'})


# ============================================================
# LEGACY EVENT PACKAGE SUBMIT
# ============================================================

@ratelimit(key='ip', rate='5/m', block=True)
def submit_event_package(request):
    if request.method != "POST":
        return safe_error_response("Method not allowed", 405)

    data = safe_json_parse(request)
    if not data:
        return safe_error_response("Invalid JSON", 400)

    name = escape(data.get("name", "").strip())
    phone = data.get("phone", "").strip()
    event_type = escape(data.get("event_type", ""))
    guests = data.get("guests", 0)
    budget = data.get("budget", 0)
    address = escape(data.get("address", "").strip())
    cake_details = data.get("cake_details", {})
    event_date = data.get("event_date", "")
    selected_package = data.get("selected_package", {})

    if not name or not phone:
        return JsonResponse({"error": "Name and phone required"}, status=400)
    if not validate_pakistani_phone(phone):
        return JsonResponse({"error": "Invalid Pakistani phone number"}, status=400)

    event_dt = None
    if event_date:
        try:
            event_dt = parse_datetime(event_date)
            if event_dt:
                if timezone.is_naive(event_dt):
                    event_dt = make_aware(event_dt)
                if event_dt < timezone.now():
                    return JsonResponse({"error": "Event date cannot be in past"}, status=400)
        except:
            return JsonResponse({"error": "Invalid event date"}, status=400)

    event_total = Decimal(str(selected_package.get("total_selling", 0)))
    advance = event_total * Decimal("0.7")
    remaining = event_total - advance

    booking = EventBooking.objects.create(
        customer_name=name,
        phone=phone,
        address=address,
        relation_name=data.get("relation_name", ""),
        pickup_time=data.get("pickup_time", ""),
        event_type=event_type,
        guests=guests,
        budget=budget,
        cake_size=cake_details.get("size", ""),
        cake_flavor=cake_details.get("flavor", ""),
        selected_deal=selected_package.get("name", "Custom Package"),
        deal_items=selected_package.get("items", []),
        total_price=event_total,
        advance_payment=advance,
        remaining_amount=remaining,
        selected_package=selected_package.get("name", "Custom Package"),
        order_summary=selected_package,
        payment_status='under_review',
        status="pending",
        event_date=event_dt.date() if event_dt else None
    )

    message = f"""🎂 *IK DELIGHTS EVENT BOOKING* 🎂
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 *EVENT DETAILS*
🎉 Event Type: {event_type}
👥 Guests: {guests}
💰 Budget: PKR {int(budget):,}
📍 Address: {address[:100] if address else 'Not provided'}
📅 Event Date: {event_date or 'Not specified'}

📦 *SELECTED PACKAGE*
🎁 Package: {selected_package.get('name', 'Custom Package')}
💵 Price: PKR {event_total:,.2f}
💳 Advance (70%): PKR {advance:,.2f}
💰 Remaining: PKR {remaining:,.2f}

💳 Payment: 70% advance required to JazzCash: {settings.BUSINESS_NUMBER}

_This is a booking inquiry. Order will be created after payment verification._"""

    phone_clean = format_phone(phone)
    wa_link = f"https://wa.me/{phone_clean}?text={quote(message)}" if phone_clean else None

    booking.whatsapp_sent = True
    booking.save(update_fields=['whatsapp_sent'])
    clear_dashboard_cache()

    return JsonResponse({
        "status": "success",
        "booking_id": booking.id,
        "wa_link": wa_link,
        "message": "Event package booked successfully! Please complete payment to confirm."
    })


# ============================================================
# EVENTS MANAGEMENT
# ============================================================

@staff_member_required
def events_page(request):
    return render(request, "admin/partials/events.html")


@staff_member_required
def get_events_management(request):
    bookings = EventBooking.objects.all().order_by('-id')
    data = []
    for booking in bookings:
        data.append({
            "id": booking.id,
            "customer_name": booking.customer_name,
            "phone": booking.phone,
            "event_type": booking.event_type,
            "guests": booking.guests,
            "budget": float(booking.budget or 0),
            "selected_deal": booking.selected_deal or "Custom Package",
            "total_price": float(booking.total_price or 0),
           "payment_status": "Pending",
            "status": booking.status or "Pending",
            "invoice": getattr(booking, "invoice_text", ""),
            "created_at": booking.created_at.strftime("%Y-%m-%d"),
            "address": booking.address or "",
            "image": booking.event_image.url if booking.event_image else "https://cdn-icons-png.flaticon.com/512/3652/3652191.png",
            "advance_payment": float(booking.advance_payment) if hasattr(booking, 'advance_payment') else 0,
            "remaining_amount": float(booking.remaining_amount) if hasattr(booking, 'remaining_amount') else 0,
            "delivery_type": getattr(booking, 'delivery_type', 'Pickup'),
        })
    return JsonResponse(data, safe=False)


@staff_member_required
def delete_event(request, event_id):
    if request.method == "DELETE":
        try:
            booking = get_object_or_404(EventBooking, id=event_id)
            booking.delete()
            return JsonResponse({"status": "success"})
        except Exception as e:
            logger.exception("Delete event error")
            return safe_error_response()
    return safe_error_response("DELETE required", 405)

# ============================================================
# UPDATE EVENT STATUS (FIXED – ALWAYS RETURNS VALID WHATSAPP LINK)
# ============================================================
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

@csrf_exempt
@require_POST
def update_event_status(request, event_id):
    try:
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)

        booking = get_object_or_404(EventBooking, id=event_id)

        new_status = data.get("status", booking.status)
        # Note: EventBooking model does NOT have payment_status field – ignore it
        # new_payment = data.get("payment_status", getattr(booking, "payment_status", "Pending"))

        booking.status = new_status
        # Remove payment_status update – not in model
        # if hasattr(booking, "payment_status"):
        #     booking.payment_status = new_payment
        #     if new_payment in ['Fully Paid', 'fully_paid', 'Paid']:
        #         booking.payment_verified = True
        #         booking.remaining_amount = 0
        #     else:
        #         booking.payment_verified = False
        booking.save()

        # WhatsApp message
        message = f"""🎂 IK Delights Event Update

Hello {booking.customer_name},

Your event booking has been updated.

📌 Event: {booking.event_type}
📦 Status: {new_status}
💰 Total: PKR {booking.total_price}

Thank you for choosing IK Delights 💖"""

        # Format phone number with fallback
        raw_phone = str(booking.phone).strip() if booking.phone else ""
        # Remove non-digits
        phone = ''.join(filter(str.isdigit, raw_phone))

        # Convert Pakistani local number to international
        if phone.startswith('0'):
            phone = '92' + phone[1:]
        elif phone.startswith('92'):
            pass
        elif phone.startswith('+'):
            phone = phone[1:]
        elif len(phone) == 10 and phone.startswith('3'):
            phone = '92' + phone
        else:
            phone = ''

        # Validate length (Pakistan numbers are 12 digits including 92)
        if len(phone) < 10 or len(phone) > 13:
            # Fallback to business WhatsApp number (from settings)
            business_number = getattr(settings, 'BUSINESS_NUMBER', '923214243501')
            phone = business_number
            # Update message to indicate admin will receive update
            message = f"🎂 IK Delights Event Update (Admin Copy)\n\nEvent: {booking.event_type}\nCustomer: {booking.customer_name}\nStatus: {new_status}\nTotal: PKR {booking.total_price}\nOriginal Phone: {raw_phone}\n\nThis is a fallback because customer's phone number is invalid."

        from urllib.parse import quote
        whatsapp_link = f"https://wa.me/{phone}?text={quote(message)}"

        # Debug prints (will show in terminal)
        print("=" * 40)
        print("EVENT STATUS UPDATE")
        print(f"Event ID: {booking.id}")
        print(f"Raw phone: {raw_phone}")
        print(f"Formatted phone: {phone}")
        print(f"WhatsApp link: {whatsapp_link}")
        print("=" * 40)

        return JsonResponse({
            "status": "success",
            "event_id": booking.id,
            "new_status": new_status,
            "payment_status": "Pending",  # hardcoded as frontend expects it
            "whatsapp_link": whatsapp_link
        })
    except Exception as e:
        logger.exception("Update event status error")
        return safe_error_response(str(e), 500)
# ============================================================
# WHATSAPP ORDERS
# ============================================================

@staff_member_required
def whatsapp_orders_page(request):
    whatsapp_orders = WhatsAppNumber.objects.all().order_by('-created_at')
    paginator = Paginator(whatsapp_orders, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return render(request, "admin/partials/whatsapp_orders.html", {
        "whatsapp_orders": page_obj,
        "total_whatsapp_orders": whatsapp_orders.count(),
    })


@staff_member_required
def convert_whatsapp_to_order(request, lead_id):
    lead = get_object_or_404(WhatsAppNumber, id=lead_id)
    if lead.order_id:
        messages.warning(request, f"This lead is already converted to Order #{lead.order_id}")
        return redirect('admin-whatsapp-orders')

    phone_number = lead.phone_number
    phone_number = re.sub(r'[\s\-+]', '', str(phone_number))
    if phone_number.startswith('92'):
        phone_number = '0' + phone_number[2:]
    elif phone_number.startswith('3') and len(phone_number) == 10:
        phone_number = '0' + phone_number
    elif re.match(r'^03\d{9}$', phone_number):
        pass
    else:
        phone_number = '03000000000'

    received_amount = lead.advance_amount if lead.payment_verified else Decimal("0")
    payment_status, _, remaining_amount = calculate_payment_status(lead.total_amount, received_amount, 'cod')

    order = Order.objects.create(
        user=lead.user if lead.user else None,
        session_key=lead.session_key,
        name=lead.customer_name or "WhatsApp Customer",
        phone=phone_number,
        address="WhatsApp Order - " + (lead.address if hasattr(lead, 'address') and lead.address else "Address not provided"),
        payment_method='cod',
        transaction_id=lead.transaction_id,
        total=lead.total_amount,
        received_amount=received_amount,
        remaining_amount=remaining_amount,
        payment_verified=lead.payment_verified,
        payment_status=payment_status,
        order_type='whatsapp',
        status='confirmed' if lead.payment_verified else 'pending',
        verification_note=f"Converted from WhatsApp CRM. Original lead ID: {lead.id}",
        customization={
            "source": "whatsapp_crm",
            "original_lead_id": lead.id,
            "customer_name": lead.customer_name,
            "notes": lead.notes or "",
            "product_name": lead.product_name or ""
        }
    )

    lead.order_id = order.id
    lead.status = 'converted'
    lead.save()
    messages.success(request, f"✅ Lead converted to Order #{order.id} successfully!")
    return redirect('admin-whatsapp-orders')


@staff_member_required
def delete_whatsapp_order(request, order_id):
    if request.method == "POST":
        order = get_object_or_404(WhatsAppNumber, id=order_id)
        order.delete()
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid request", 400)


@staff_member_required
def update_whatsapp_status(request, order_id):
    if request.method == "PUT":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)
        order = get_object_or_404(WhatsAppNumber, id=order_id)
        order.status = data.get("status", order.status)
        order.save()
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid request", 400)


# ============================================================
# DEALS API
# ============================================================

def get_deals_api(request):
    now = timezone.now()
    Deal.objects.filter(expiry__lt=now, is_active=True).update(is_active=False)
    deals = Deal.objects.filter(is_active=True).filter(Q(expiry__gt=now) | Q(expiry__isnull=True)).order_by('sort_order', '-id')
    data = []
    for deal in deals:
        data.append({
            "id": deal.id,
            "title": deal.title if deal.title else "No Title",
            "subtitle": deal.subtitle or "",
            "image": deal.image.url if deal.image else "",
            "is_active": deal.is_active,
            "expiry": deal.expiry.isoformat() if deal.expiry else None,
            "sort_order": deal.sort_order,
        })
    return JsonResponse(data, safe=False)


def get_featured_deal_api(request):
    now = timezone.now()
    flash_sale = FlashSale.objects.filter(is_active=True, end_time__gt=now).first()
    if flash_sale:
        return JsonResponse({
            "success": True,
            "deal": {
                "id": flash_sale.id,
                "title": flash_sale.title or "Flash Sale",
                "description": flash_sale.subtitle or "Limited time offer!",
                "deal_price": float(flash_sale.sale_price or 0),
                "image_url": flash_sale.image.url if flash_sale.image else "",
                "expiry": flash_sale.end_time.isoformat(),
                "type": "flash_sale"
            }
        })
    active_deal = Deal.objects.filter(is_active=True).filter(Q(expiry__gt=now) | Q(expiry__isnull=True)).order_by('sort_order', '-id').first()
    if not active_deal:
        return JsonResponse({"success": False, "message": "No active deal found"})
    return JsonResponse({
        "success": True,
        "deal": {
            "id": active_deal.id,
            "title": active_deal.title or "Special Deal",
            "description": active_deal.subtitle or "Limited time offer!",
            "deal_price": float(active_deal.price) if hasattr(active_deal, 'price') and active_deal.price else 0,
            "image_url": active_deal.image.url if active_deal.image else "",
            "expiry": active_deal.expiry.isoformat() if active_deal.expiry else None,
            "type": "normal_deal"
        }
    })


def deals_view(request):
    now = timezone.now()
    active_deals = Deal.objects.filter(is_active=True).filter(Q(expiry__gt=now) | Q(expiry__isnull=True)).order_by('sort_order', '-id')
    return render(request, "deals.html", {"deals": active_deals})


@staff_member_required
def deals_page(request):
    now = timezone.now()
    Deal.objects.filter(expiry__lt=now, is_active=True).update(is_active=False)
    all_deals = Deal.objects.all().order_by('sort_order', '-id')
    active_deals = []
    expired_deals = []
    for deal in all_deals:
        if deal.is_active and (not deal.expiry or deal.expiry > now):
            active_deals.append(deal)
        else:
            expired_deals.append(deal)
    return render(request, "admin/partials/deals.html", {
        "deals": active_deals,
        "expired_deals": expired_deals,
        "total_deals": len(active_deals),
        "total_expired": len(expired_deals),
    })


@staff_member_required
def add_deal_api(request):
    if request.method == "POST":
        try:
            title = request.POST.get("title", "").strip()
            if not title:
                return JsonResponse({"status": "error", "error": "Title is required"}, status=400)
            expiry = None
            if request.POST.get("expiry"):
                ex = parse_datetime(request.POST.get("expiry"))
                if ex:
                    if timezone.is_naive(ex):
                        ex = make_aware(ex)
                    expiry = ex
            is_active = request.POST.get("is_active") == "true"
            sort_order = int(request.POST.get("sort_order", 0))
            subtitle = request.POST.get("subtitle", "")
            image = request.FILES.get("image")
            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"status": "error", "error": err}, status=400)
            deal = Deal.objects.create(
                title=title,
                subtitle=subtitle,
                expiry=expiry,
                is_active=is_active,
                sort_order=sort_order,
                image=image
            )
            return JsonResponse({"status": "success", "id": deal.id, "message": "Deal added successfully"})
        except Exception as e:
            logger.exception("Add deal error")
            return safe_error_response()
    return safe_error_response("POST required", 405)


@staff_member_required
def update_deal_api(request, deal_id):
    if request.method == "POST":
        try:
            deal = get_object_or_404(Deal, id=deal_id)
            if request.POST.get("title"):
                deal.title = request.POST.get("title").strip()
            if request.POST.get("subtitle") is not None:
                deal.subtitle = request.POST.get("subtitle")
            if request.POST.get("expiry") == "":
                deal.expiry = None
            elif request.POST.get("expiry"):
                ex = parse_datetime(request.POST.get("expiry"))
                if ex:
                    if timezone.is_naive(ex):
                        ex = make_aware(ex)
                    deal.expiry = ex
            if request.POST.get("is_active") is not None:
                deal.is_active = request.POST.get("is_active") == "true"
            if request.POST.get("sort_order"):
                deal.sort_order = int(request.POST.get("sort_order"))
            image = request.FILES.get("image")
            if image:
                err = validate_image_file(image)
                if err:
                    return JsonResponse({"status": "error", "error": err}, status=400)
                if deal.image and hasattr(deal.image, 'path'):
                    deal.image.delete(save=False)
                deal.image = image
            deal.save()
            return JsonResponse({"status": "success", "message": "Deal updated successfully"})
        except Exception as e:
            logger.exception("Update deal error")
            return safe_error_response()
    return safe_error_response("POST required", 405)


@staff_member_required
def delete_deal_api(request, deal_id):
    if request.method == "POST":
        try:
            deal = get_object_or_404(Deal, id=deal_id)
            if deal.image and hasattr(deal.image, 'path'):
                deal.image.delete(save=False)
            deal.delete()
            return JsonResponse({"status": "success", "message": "Deal deleted successfully"})
        except Exception as e:
            logger.exception("Delete deal error")
            return safe_error_response()
    return safe_error_response("POST required", 405)


# ==================== UPDATED grab_deal_whatsapp ====================
def grab_deal_whatsapp(request, deal_id):
    import urllib.parse
    from decimal import Decimal
    from django.db import transaction
    import random
    import string

    deal = get_object_or_404(Deal, id=deal_id)

    if not request.session.session_key:
        request.session.create()

    # Create WhatsApp lead
    whatsapp_lead, created = WhatsAppNumber.objects.get_or_create(
        session_key=request.session.session_key,
        phone_number="03000000000",
        defaults={
            'product_name': deal.title,
            'message': f"Interested in deal: {deal.title}",
            'lead_source': 'whatsapp',
            'status': 'lead'
            }
        )

    # Create Deal Order (so dashboard counts it)
    with transaction.atomic():
        timestamp = timezone.now().strftime('%y%m%d%H%M%S')
        rand_str = ''.join(random.choices(string.digits, k=4))
        dummy_txn = f"DEAL-{deal.id}-{timestamp}-{rand_str}"

        order = Order.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_key=request.session.session_key,
            name=f"Deal Inquiry: {deal.title}",
            phone="03000000000",                          # ✅ Valid Pakistani number
            address="Pending from WhatsApp",
            payment_method='cod',
            order_type='deal',                            # ✅ Critical for dashboard
            transaction_id=dummy_txn,
            total=Decimal('0'),
            received_amount=Decimal('0'),
            remaining_amount=Decimal('0'),
            payment_status='under_review',                # ✅ Correct value from model choices
            status='pending',
            payment_verified=False,
            customization={
                "source": "deal_click",
                "deal_id": deal.id,
                "deal_title": deal.title,
                "whatsapp_lead_id": whatsapp_lead.id,
                "message": "Customer clicked Grab Deal – awaiting payment confirmation"
            }
        )

        logger.info(f"✅ Deal order created: #{order.id} for deal '{deal.title}' (lead ID: {whatsapp_lead.id})")

    # Redirect to WhatsApp
    phone_number = settings.BUSINESS_NUMBER
    message = f"Assalam o Alaikum, mujhe {deal.title} deal order karni hai."
    encoded_message = urllib.parse.quote(message)
    whatsapp_url = f"https://wa.me/{phone_number}?text={encoded_message}"
    return redirect(whatsapp_url)
# ============================================================

# ============================================================
# WHATSAPP NUMBER REDIRECT
# ============================================================

@ratelimit(key='ip', rate='10/m', block=True)
def add_whatsapp_number(request):
    phone = request.GET.get("phone")
    if not phone:
        return JsonResponse({"error": "Phone required"})

    if not request.session.session_key:
        request.session.create()

    obj, _ = WhatsAppNumber.objects.get_or_create(
        session_key=request.session.session_key,
        defaults={"phone_number": phone, "verified": False, "status": "lead"}
    )
    obj.phone_number = phone
    obj.save()

    message = """🎂 IK Delights

Hello! 😊

Thank you for contacting IK Delights.

I would like to place an order and need details about:

🍰 Cakes & Customization
🎉 Event Orders
💰 Pricing
🚚 Delivery Availability

Please guide me further. ✨"""

    whatsapp_link = f"https://wa.me/{phone}?text={quote(message)}"
    return redirect(whatsapp_link)


# ============================================================
# ADMIN DASHBOARD (UPDATED)
# ============================================================

@staff_member_required
def admin_dashboard(request):
    cache_key = "dashboard_stats"
    stats = cache.get(cache_key)

    if not stats:
        total_revenue = Order.objects.aggregate(
            total=Coalesce(Sum('total'), Value(0, DecimalField()))
        )['total'] or 0

        received_amount = Order.objects.aggregate(
            total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
        )['total'] or 0

        remaining_amount = Order.objects.aggregate(
            total=Coalesce(Sum('remaining_amount'), Value(0, DecimalField()))
        )['total'] or 0

        active_deals_count = Deal.objects.filter(
            is_active=True
        ).filter(
            Q(expiry__gt=timezone.now()) | Q(expiry__isnull=True)
        ).count()

        total_event_inquiries = EventInquiry.objects.count()
        pending_event_inquiries = EventInquiry.objects.filter(status='new').count()
        total_event_orders = EventOrder.objects.count()
        pending_event_orders = EventOrder.objects.filter(status='pending').count()

        stats = {
            "total_orders": Order.objects.count(),
            "total_revenue": float(total_revenue),
            "received_amount": float(received_amount or 0),
            "remaining_amount": float(remaining_amount or 0),
            "pending_orders": Order.objects.filter(status='pending').count(),
            "unread_messages": ContactMessage.objects.filter(is_read=False).count(),
            "total_products": Product.objects.count(),
            "total_deals": active_deals_count,
            "total_events": EventBooking.objects.count(),
            "total_event_inquiries": total_event_inquiries,
            "pending_event_inquiries": pending_event_inquiries,
            "total_event_orders": total_event_orders,
            "pending_event_orders": pending_event_orders,
        }
        cache.set(cache_key, stats, CACHE_TIMEOUT)

    recent_orders = Order.objects.select_related('user').only(
        'id', 'name', 'total', 'status', 'created_at', 'user', 'received_amount', 'remaining_amount'
    ).order_by('-created_at')[:10]

    recent_messages = ContactMessage.objects.only(
        'name', 'phone', 'message', 'status', 'created_at'
    ).order_by('-created_at')[:5]

    recent_events = EventBooking.objects.only(
        'customer_name', 'phone', 'event_type', 'total_price', 'status', 'created_at'
    ).order_by('-created_at')[:5]

    sales_labels = []
    sales_data = []
    monthly_sales = Order.objects.filter(
        payment_status__in=['partial_paid', 'fully_paid'],
        created_at__isnull=False
    ).annotate(
        month=TruncMonth('created_at')
    ).values('month').annotate(
        total_sales=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    ).order_by('month')

    for item in monthly_sales:
        if item['month']:
            sales_labels.append(item['month'].strftime('%b %Y'))
            sales_data.append(float(item['total_sales']))

    if len(sales_labels) <= 1:
        from datetime import timedelta
        now = timezone.now()
        for i in range(5, -1, -1):
            month_date = now - timedelta(days=30 * i)
            sales_labels.append(month_date.strftime('%b %Y'))
            sales_data.append(round(50000 + (i * 15000), 0))

    order_status = Order.objects.values('status').annotate(count=Count('id'))
    status_labels = [item['status'] for item in order_status] if order_status else ['pending', 'processing', 'delivered', 'cancelled']
    status_counts = [item['count'] for item in order_status] if order_status else [0, 0, 0, 0]

    event_labels = []
    event_counts = []
    monthly_events = EventBooking.objects.filter(
        created_at__isnull=False
    ).annotate(
        month=TruncMonth('created_at')
    ).values('month').annotate(
        total_events=Count('id')
    ).order_by('month')

    for item in monthly_events:
        if item['month']:
            event_labels.append(item['month'].strftime('%b %Y'))
            event_counts.append(item['total_events'])

    if len(event_labels) <= 1:
        from datetime import timedelta
        now = timezone.now()
        for i in range(5, -1, -1):
            month_date = now - timedelta(days=30 * i)
            event_labels.append(month_date.strftime('%b %Y'))
            event_counts.append(0)

    event_type_labels = []
    event_type_counts = []
    event_types = EventBooking.objects.values('event_type').annotate(count=Count('id')).order_by('-count')
    for item in event_types:
        if item['event_type']:
            event_type_labels.append(item['event_type'])
            event_type_counts.append(item['count'])

    sidebar_categories = Category.objects.filter(is_active=True).order_by('name')

    under_review_count = Order.objects.filter(payment_status='under_review').count()
    partial_paid_count = Order.objects.filter(payment_status='partial_paid').count()
    completed_payments = Order.objects.filter(payment_status='fully_paid').count()
    partial_in_progress = Order.objects.filter(payment_status='partial_paid', status__in=['pending', 'confirmed', 'processing']).count()
    partial_converted = Order.objects.filter(payment_status='partial_paid', status='delivered').count()
    partial_rejected = Order.objects.filter(payment_status='rejected').count()
    fully_in_progress = Order.objects.filter(payment_status='fully_paid', status='processing').count()
    fully_converted = Order.objects.filter(payment_status='fully_paid', status='delivered').count()
    fully_rejected = Order.objects.filter(payment_status='rejected', status='cancelled').count()

    total_revenue = stats['total_revenue']
    received_amount = stats['received_amount']
    remaining_amount = stats['remaining_amount']

    total_leads = WhatsAppNumber.objects.filter(status='lead').count()
    followup_leads = WhatsAppNumber.objects.filter(status='followup').count()
    working_leads = WhatsAppNumber.objects.filter(status='working').count()
    converted_leads = WhatsAppNumber.objects.filter(status='converted').count()
    rejected_leads = WhatsAppNumber.objects.filter(status='rejected').count()
    whatsapp_orders_count = Order.objects.filter(order_type='whatsapp').count()
    website_orders_count = Order.objects.filter(order_type='website').count()

       # FIX
    event_orders_count = EventBooking.objects.count()

    deal_orders_count = Order.objects.filter(order_type='deal').count()
    processing_orders = Order.objects.filter(status='processing').count()
    notifications = []
    recent_order_notifs = Order.objects.order_by('-created_at')[:5]
    for order in recent_order_notifs:
        time_diff = timezone.now() - order.created_at
        if time_diff.total_seconds() < 60:
            time_ago = f"{int(time_diff.total_seconds())} seconds ago"
        elif time_diff.total_seconds() < 3600:
            time_ago = f"{int(time_diff.total_seconds() // 60)} minutes ago"
        elif time_diff.total_seconds() < 86400:
            time_ago = f"{int(time_diff.total_seconds() // 3600)} hours ago"
        else:
            time_ago = f"{int(time_diff.total_seconds() // 86400)} days ago"
        notifications.append({"message": f"New order #{order.id} received from {order.name}", "time_ago": time_ago, "type": "order"})

    payment_notifs = Order.objects.filter(payment_verified=True).exclude(verified_at__isnull=True).order_by('-verified_at')[:3]
    for order in payment_notifs:
        if order.verified_at:
            time_diff = timezone.now() - order.verified_at
            if time_diff.total_seconds() < 60:
                time_ago = f"{int(time_diff.total_seconds())} seconds ago"
            elif time_diff.total_seconds() < 3600:
                time_ago = f"{int(time_diff.total_seconds() // 60)} minutes ago"
            else:
                time_ago = f"{int(time_diff.total_seconds() // 3600)} hours ago"
            notifications.append({"message": f"Payment verified for Order #{order.id}", "time_ago": time_ago, "type": "success"})
    notifications = notifications[:5]

    context = {
        'admin_name': request.user.username,
        'admin_email': request.user.email,
        'admin_role': 'Super Admin',
        'total_orders': stats['total_orders'],
        'total_revenue': total_revenue,
        'received_amount': received_amount,
        'remaining_amount': remaining_amount,
        'pending_orders': stats['pending_orders'],
        'unread_messages': stats['unread_messages'],
        'total_products': stats['total_products'],
        'total_deals': stats['total_deals'],
        'total_events': stats['total_events'],
        'total_event_inquiries': stats['total_event_inquiries'],
        'pending_event_inquiries': stats['pending_event_inquiries'],
        'total_event_orders': stats['total_event_orders'],
        'pending_event_orders': stats['pending_event_orders'],
        'recent_orders': recent_orders,
        'recent_messages': recent_messages,
        'recent_events': recent_events,
        'upcoming_events': recent_events,
        'sales_labels': sales_labels,
        'sales_data': sales_data,
        'status_labels': status_labels,
        'status_data': status_counts,
        'event_labels': event_labels,
        'event_counts': event_counts,
        'event_type_labels': event_type_labels,
        'event_type_counts': event_type_counts,
        'sidebar_categories': sidebar_categories,
        'under_review_count': under_review_count,
        'partial_paid_count': partial_paid_count,
        'completed_payments': completed_payments,
        'partial_in_progress': partial_in_progress,
        'partial_converted': partial_converted,
        'partial_rejected': partial_rejected,
        'fully_in_progress': fully_in_progress,
        'fully_converted': fully_converted,
        'fully_rejected': fully_rejected,
        'total_leads': total_leads,
        'followup_leads': followup_leads,
        'working_leads': working_leads,
        'converted_leads': converted_leads,
        'rejected_leads': rejected_leads,
        'whatsapp_orders_count': whatsapp_orders_count,
        'website_orders_count': website_orders_count,
        'event_orders_count': event_orders_count,
        'deal_orders_count': deal_orders_count,
        'processing_orders': processing_orders,
        'notifications': notifications,
    }
    return render(request, 'admin/dashboard.html', context)


# ============================================================
# REMAINING ADMIN PAGES
# ============================================================

@staff_member_required
def products_page(request):
    products = Product.objects.select_related('category').all().order_by('-id')
    categories = Category.objects.filter(is_active=True)
    paginator = Paginator(products, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return render(request, "admin/partials/products.html", {
        "products": page_obj,
        "categories": categories,
        "total_products": products.count(),
    })

@staff_member_required
def orders_page(request):
    orders = Order.objects.select_related('user').all().order_by('-created_at')

    return render(request, "admin/partials/orders.html", {
        "orders": orders,
        "total_orders": orders.count(),
    })


@staff_member_required
def categories_page(request):
    return render(request, "admin/partials/categories.html")


@staff_member_required
def gallery_page(request):
    if request.method == "POST":
        name = request.POST.get("name")
        category = request.POST.get("category")
        price = request.POST.get("price")
        image = request.FILES.get("image")
        if image:
            err = validate_image_file(image)
            if err:
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return JsonResponse({"error": err}, status=400)
                messages.error(request, err)
                return redirect('admin-gallery')
        Gallery.objects.create(name=name, category=category, price=price, image=image)
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({"status": "success", "message": "Image added successfully"})
        messages.success(request, "Image added successfully")
        return redirect('admin-gallery')
    gallery_images = Gallery.objects.all().order_by('-id')
    return render(request, "admin/partials/gallery.html", {
        "gallery_images": gallery_images,
        "total_images": gallery_images.count(),
    })


@staff_member_required
def add_gallery_image(request):
    if request.method == "POST":
        try:
            name = request.POST.get("name")
            category = request.POST.get("category")
            price = request.POST.get("price", "")
            image = request.FILES.get("image")
            if not name:
                return JsonResponse({"status": "error", "error": "Name is required"}, status=400)
            if not category:
                return JsonResponse({"status": "error", "error": "Category is required"}, status=400)
            if not image:
                return JsonResponse({"status": "error", "error": "Image is required"}, status=400)
            err = validate_image_file(image)
            if err:
                return JsonResponse({"status": "error", "error": err}, status=400)
            gallery = Gallery.objects.create(name=name, category=category, price=price, image=image)
            clear_dashboard_cache()
            return JsonResponse({"status": "success", "id": gallery.id, "message": "Image added successfully", "image_url": gallery.image.url if gallery.image else ""})
        except Exception as e:
            logger.exception("Gallery add error")
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
    return JsonResponse({"status": "error", "error": "Method not allowed"}, status=405)


@staff_member_required
def delete_gallery_image(request, image_id):
    if request.method == "DELETE" or request.method == "POST":
        try:
            image = Gallery.objects.get(id=image_id)
            if image.image and hasattr(image.image, 'path'):
                try:
                    image.image.delete(save=False)
                except:
                    pass
            image.delete()
            clear_dashboard_cache()
            return JsonResponse({"status": "success", "message": "Image deleted successfully", "id": image_id})
        except Gallery.DoesNotExist:
            return JsonResponse({"status": "error", "error": "Image not found"}, status=404)
        except Exception as e:
            logger.exception("Gallery delete error")
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
    return JsonResponse({"status": "error", "error": "Method not allowed"}, status=405)


@staff_member_required
def edit_gallery_image(request, image_id):
    if request.method == "POST":
        try:
            if request.content_type == 'application/json':
                data = json.loads(request.body)
                name = data.get("name")
                category = data.get("category")
                price = data.get("price", "")
            else:
                name = request.POST.get("name")
                category = request.POST.get("category")
                price = request.POST.get("price", "")
            image = Gallery.objects.get(id=image_id)
            if name:
                image.name = name
            if category:
                image.category = category
            if price:
                image.price = price
            image.save()
            clear_dashboard_cache()
            return JsonResponse({"status": "success", "message": "Image updated successfully", "id": image.id, "name": image.name, "category": image.category, "price": image.price})
        except Gallery.DoesNotExist:
            return JsonResponse({"status": "error", "error": "Image not found"}, status=404)
        except Exception as e:
            logger.exception("Gallery edit error")
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
    return JsonResponse({"status": "error", "error": "Method not allowed"}, status=405)


@staff_member_required
def update_gallery_image(request, image_id):
    if request.method == "POST":
        try:
            image = Gallery.objects.get(id=image_id)
            image.name = request.POST.get("name", image.name)
            image.category = request.POST.get("category", image.category)
            image.price = request.POST.get("price", image.price)
            new_image = request.FILES.get("image")
            if new_image:
                err = validate_image_file(new_image)
                if err:
                    return JsonResponse({"status": "error", "error": err}, status=400)
                if image.image and hasattr(image.image, 'path'):
                    try:
                        image.image.delete(save=False)
                    except:
                        pass
                image.image = new_image
            image.save()
            clear_dashboard_cache()
            return JsonResponse({"status": "success", "message": "Image updated successfully", "id": image.id, "image_url": image.image.url if image.image else ""})
        except Gallery.DoesNotExist:
            return JsonResponse({"status": "error", "error": "Image not found"}, status=404)
        except Exception as e:
            logger.exception("Gallery update error")
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
    return JsonResponse({"status": "error", "error": "Method not allowed"}, status=405)


@staff_member_required
def get_gallery_image(request, image_id):
    if request.method == "GET":
        try:
            image = Gallery.objects.get(id=image_id)
            return JsonResponse({"status": "success", "id": image.id, "name": image.name, "category": image.category, "price": image.price, "image_url": image.image.url if image.image else ""})
        except Gallery.DoesNotExist:
            return JsonResponse({"status": "error", "error": "Image not found"}, status=404)
        except Exception as e:
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
    return JsonResponse({"status": "error", "error": "Method not allowed"}, status=405)


# ============================================================
# REPORTS PAGE
# ============================================================

@staff_member_required
def reports_page(request):
    filter_type = request.GET.get('filter', 'all')
    start_date = request.GET.get('start')
    end_date = request.GET.get('end')
    today = timezone.now()

    total_orders = Order.objects.count()
    total_revenue = Order.objects.filter(
        payment_status__in=['partial_paid', 'fully_paid']
    ).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    total_gallery = Gallery.objects.count()
    total_events = EventBooking.objects.count()
    whatsapp_orders_count = Order.objects.filter(order_type='whatsapp').count()
    
    website_revenue = Order.objects.filter(order_type='website', payment_status__in=['partial_paid', 'fully_paid']).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    custom_revenue = Order.objects.filter(order_type='custom', payment_status__in=['partial_paid', 'fully_paid']).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    deal_revenue = Order.objects.filter(order_type='deal', payment_status__in=['partial_paid', 'fully_paid']).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    event_revenue = Order.objects.filter(order_type='event', payment_status__in=['partial_paid', 'fully_paid']).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    whatsapp_revenue = Order.objects.filter(order_type='whatsapp', payment_status__in=['partial_paid', 'fully_paid']).aggregate(
        total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
    )['total'] or 0
    event_booking_revenue = EventBooking.objects.aggregate(
        total=Coalesce(Sum('total_price'), Value(0, DecimalField()))
    )['total'] or 0
    overall_revenue = float(total_revenue) + float(event_booking_revenue)
    
    upcoming_events = EventBooking.objects.filter(status__in=['Pending', 'Approved', 'Preparing']).count()
    completed_events = EventBooking.objects.filter(status='Delivered').count()
    
    total_leads = WhatsAppNumber.objects.filter(status='lead').count()
    converted_leads = WhatsAppNumber.objects.filter(status='converted').count()
    followup_leads = WhatsAppNumber.objects.filter(status='followup').count()
    rejected_leads = WhatsAppNumber.objects.filter(status='rejected').count()
    
    top_products = Product.objects.filter(is_active=True).order_by('-id')[:6]
    
    orders = Order.objects.all().select_related('user')
    if filter_type == 'daily':
        orders = orders.filter(created_at__date=today.date())
    elif filter_type == 'monthly':
        orders = orders.filter(created_at__month=today.month, created_at__year=today.year)
    elif filter_type == 'yearly':
        orders = orders.filter(created_at__year=today.year)
    if start_date and end_date:
        orders = orders.filter(created_at__date__range=[start_date, end_date])
    recent_orders = orders.order_by('-created_at')[:20]
    
    months_labels = []
    website_orders_monthly = []
    whatsapp_orders_monthly = []
    for i in range(5, -1, -1):
        month_date = today - timedelta(days=30 * i)
        month_start = month_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if month_date.month == 12:
            next_month = month_date.replace(year=month_date.year + 1, month=1, day=1)
        else:
            next_month = month_date.replace(month=month_date.month + 1, day=1)
        months_labels.append(month_date.strftime('%b %Y'))
        month_orders = Order.objects.filter(created_at__gte=month_start, created_at__lt=next_month)
        website_count = month_orders.filter(order_type='website').count()
        whatsapp_count = month_orders.filter(order_type='whatsapp').count()
        website_orders_monthly.append(website_count)
        whatsapp_orders_monthly.append(whatsapp_count)
    
    total_website_orders = Order.objects.filter(order_type='website').count()
    total_whatsapp_orders = Order.objects.filter(order_type='whatsapp').count()
    total_all_orders = total_website_orders + total_whatsapp_orders
    website_percentage = round((total_website_orders / total_all_orders * 100) if total_all_orders > 0 else 0)
    whatsapp_percentage = round((total_whatsapp_orders / total_all_orders * 100) if total_all_orders > 0 else 0)
    
    total_gallery_views = Gallery.objects.aggregate(total=Count('id'))['total'] or 0
    unique_visitors = Gallery.objects.values('image').distinct().count()
    
    context = {
        "total_orders": total_orders,
        "total_revenue": float(total_revenue),
        "total_gallery": total_gallery,
        "total_events": total_events,
        "whatsapp_orders_count": whatsapp_orders_count,
        "website_revenue": float(website_revenue),
        "custom_revenue": float(custom_revenue),
        "deal_revenue": float(deal_revenue),
        "event_revenue": float(event_revenue),
        "whatsapp_revenue": float(whatsapp_revenue),
        "event_booking_revenue": float(event_booking_revenue),
        "overall_revenue": float(overall_revenue),
        "upcoming_events": upcoming_events,
        "completed_events": completed_events,
        "total_leads": total_leads,
        "converted_leads": converted_leads,
        "followup_leads": followup_leads,
        "rejected_leads": rejected_leads,
        "top_products": top_products,
        "recent_orders": recent_orders,
        "months_labels": months_labels,
        "website_orders_monthly": website_orders_monthly,
        "whatsapp_orders_monthly": whatsapp_orders_monthly,
        "website_percentage": website_percentage,
        "whatsapp_percentage": whatsapp_percentage,
        "total_gallery_views": total_gallery_views,
        "unique_visitors": unique_visitors,
        "avg_time": "02:15",
        "filter_type": filter_type,
        "start_date": start_date,
        "end_date": end_date,
    }
    return render(request, "admin/partials/reports.html", context)


# ============================================================
# SETTINGS PAGE
# ============================================================

@staff_member_required
def settings_page(request):
    settings_obj = SiteSettings.objects.first()
    if not settings_obj:
        settings_obj = SiteSettings.objects.create(bakery_name='IK Delights')

    if request.method == "POST":
        settings_obj.bakery_name = escape(request.POST.get('bakery_name', ''))
        settings_obj.email = escape(request.POST.get('email', ''))
        settings_obj.phone = escape(request.POST.get('phone', ''))
        settings_obj.address = escape(request.POST.get('address', ''))
        settings_obj.facebook = escape(request.POST.get('facebook', ''))
        settings_obj.tiktok = escape(request.POST.get('tiktok', ''))
        settings_obj.instagram = escape(request.POST.get('instagram', ''))
        settings_obj.whatsapp = escape(request.POST.get('whatsapp', ''))
        settings_obj.youtube = escape(request.POST.get('youtube', ''))
        settings_obj.whatsapp_number = escape(request.POST.get('whatsapp_number', ''))
        settings_obj.whatsapp_message = escape(request.POST.get('whatsapp_message', ''))
        settings_obj.primary_color = escape(request.POST.get('primary_color', ''))
        settings_obj.username = escape(request.POST.get('username', ''))
        settings_obj.jazzcash_number = escape(request.POST.get('jazzcash_number', ''))
        settings_obj.easypaisa_number = escape(request.POST.get('easypaisa_number', ''))

        if request.FILES.get('logo'):
            err = validate_image_file(request.FILES.get('logo'))
            if not err:
                if settings_obj.logo and hasattr(settings_obj.logo, 'path'):
                    settings_obj.logo.delete(save=False)
                settings_obj.logo = request.FILES.get('logo')

        if request.FILES.get('footer_logo'):
            err = validate_image_file(request.FILES.get('footer_logo'))
            if not err:
                if settings_obj.footer_logo and hasattr(settings_obj.footer_logo, 'path'):
                    settings_obj.footer_logo.delete(save=False)
                settings_obj.footer_logo = request.FILES.get('footer_logo')

        if request.FILES.get('admin_logo'):
            err = validate_image_file(request.FILES.get('admin_logo'))
            if not err:
                if settings_obj.admin_logo and hasattr(settings_obj.admin_logo, 'path'):
                    settings_obj.admin_logo.delete(save=False)
                settings_obj.admin_logo = request.FILES.get('admin_logo')

        settings_obj.save()
        return redirect('admin-settings')

    context = {'settings': settings_obj}
    return render(request, "admin/partials/settings.html", context)


@staff_member_required
def save_settings(request):
    if request.method == "POST":
        try:
            settings_obj = SiteSettings.objects.first()
            if not settings_obj:
                settings_obj = SiteSettings.objects.create(bakery_name="IK Delights")

            settings_obj.bakery_name = escape(request.POST.get('bakery_name', ''))
            settings_obj.email = escape(request.POST.get('email', ''))
            settings_obj.phone = escape(request.POST.get('phone', ''))
            settings_obj.address = escape(request.POST.get('address', ''))
            settings_obj.facebook = escape(request.POST.get('facebook', ''))
            settings_obj.tiktok = escape(request.POST.get('tiktok', ''))
            settings_obj.instagram = escape(request.POST.get('instagram', ''))
            settings_obj.whatsapp = escape(request.POST.get('whatsapp', ''))
            settings_obj.youtube = escape(request.POST.get('youtube', ''))
            settings_obj.whatsapp_number = escape(request.POST.get('whatsapp_number', ''))
            settings_obj.whatsapp_message = escape(request.POST.get('whatsapp_message', ''))
            settings_obj.primary_color = escape(request.POST.get('primary_color', ''))
            settings_obj.username = escape(request.POST.get('username', ''))
            settings_obj.jazzcash_number = escape(request.POST.get('jazzcash_number', ''))
            settings_obj.easypaisa_number = escape(request.POST.get('easypaisa_number', ''))

            if request.FILES.get('logo'):
                err = validate_image_file(request.FILES.get('logo'))
                if not err:
                    if settings_obj.logo and hasattr(settings_obj.logo, 'path'):
                        settings_obj.logo.delete(save=False)
                    settings_obj.logo = request.FILES.get('logo')

            if request.FILES.get('footer_logo'):
                err = validate_image_file(request.FILES.get('footer_logo'))
                if not err:
                    if settings_obj.footer_logo and hasattr(settings_obj.footer_logo, 'path'):
                        settings_obj.footer_logo.delete(save=False)
                    settings_obj.footer_logo = request.FILES.get('footer_logo')

            if request.FILES.get('admin_logo'):
                err = validate_image_file(request.FILES.get('admin_logo'))
                if not err:
                    if settings_obj.admin_logo and hasattr(settings_obj.admin_logo, 'path'):
                        settings_obj.admin_logo.delete(save=False)
                    settings_obj.admin_logo = request.FILES.get('admin_logo')

            settings_obj.save()
            return JsonResponse({"status": "ok"})
        except Exception as e:
            logger.exception("Save settings error")
            return safe_error_response()
    return safe_error_response("Invalid method", 405)


# ============================================================
# ANNOUNCEMENTS
# ============================================================

@staff_member_required
def announcements_page(request):
    if request.method == "POST":
        text = escape(request.POST.get("text", ""))
        link = request.POST.get("link", "")
        is_active = request.POST.get("is_active") == "true"
        Announcement.objects.create(text=text, link=link, is_active=is_active)
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({"status": "success", "message": "Announcement added"})
        messages.success(request, "Announcement added successfully")
        return redirect('admin-announcements')
    announcements = Announcement.objects.all().order_by('-created_at')
    return render(request, "admin/partials/announcements.html", {
        "announcements": announcements,
        "total_announcements": announcements.count(),
    })


@staff_member_required
def add_announcement(request):
    if request.method == "POST":
        try:
            text = request.POST.get("text")
            link = request.POST.get("link", "")
            is_active = request.POST.get("is_active") == "true"
            if not text:
                return JsonResponse({"error": "Text is required"}, status=400)
            announcement = Announcement.objects.create(text=text, link=link, is_active=is_active)
            return JsonResponse({"status": "success", "id": announcement.id, "message": "Announcement added"})
        except Exception as e:
            logger.exception("Announcement add error")
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Method not allowed"}, status=405)


@staff_member_required
def update_announcement(request, ann_id):
    if request.method == "POST":
        try:
            announcement = Announcement.objects.get(id=ann_id)
            announcement.text = request.POST.get("text", announcement.text)
            announcement.link = request.POST.get("link", announcement.link)
            announcement.is_active = request.POST.get("is_active") == "true"
            announcement.save()
            return JsonResponse({"status": "success", "message": "Announcement updated"})
        except Announcement.DoesNotExist:
            return JsonResponse({"error": "Announcement not found"}, status=404)
        except Exception as e:
            logger.exception("Announcement update error")
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Method not allowed"}, status=405)


@staff_member_required
def delete_announcement(request, ann_id):
    if request.method == "POST":
        try:
            announcement = Announcement.objects.get(id=ann_id)
            announcement.delete()
            return JsonResponse({"status": "success", "message": "Announcement deleted"})
        except Announcement.DoesNotExist:
            return JsonResponse({"error": "Announcement not found"}, status=404)
        except Exception as e:
            logger.exception("Announcement delete error")
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Method not allowed"}, status=405)


# ============================================================
# CUSTOMERS, MESSAGES, REVIEWS, BAKING ASSISTANT, ETC.
# ============================================================

@staff_member_required
def customers_page(request):
    customers = Profile.objects.select_related('user').all().order_by('-user__date_joined')
    paginator = Paginator(customers, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return render(request, "admin/partials/customers.html", {
        "customers": page_obj,
        "total_customers": customers.count(),
    })


@staff_member_required
def messages_page(request):
    unread_count = ContactMessage.objects.filter(is_read=False).count()
    messages_list = ContactMessage.objects.all().order_by('-created_at')
    ContactMessage.objects.filter(is_read=False).update(is_read=True)
    paginator = Paginator(messages_list, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return render(request, "admin/partials/messages.html", {
        "messages": page_obj,
        "total_messages": messages_list.count(),
        "unread_count": unread_count,
    })


@staff_member_required
def reviews_page(request):
    reviews = Review.objects.all().order_by('-created_at')
    paginator = Paginator(reviews, 20)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    return render(request, "admin/partials/reviews.html", {
        "reviews": page_obj,
        "total_reviews": reviews.count(),
    })


def baking_assistant(request):
    if request.method == "POST":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)
        session_key = request.session.session_key or "unknown"
        inquiry = BakingInquiry.objects.create(
            session_key=session_key,
            user=request.user if request.user.is_authenticated else None,
            answers=data.get("answers", {}),
            completed=data.get("completed", False),
        )
        return JsonResponse({"inquiry_id": inquiry.id})
    return safe_error_response("Invalid", 405)


@login_required
def admin_event_orders_json(request):
    if not request.user.is_staff:
        return JsonResponse({"error": "Unauthorized"}, status=403)
    bookings = EventBooking.objects.all().order_by("-created_at")
    data = []
    for b in bookings:
        data.append({
            "id": b.id,
            "customer_name": b.customer_name,
            "phone": b.phone,
            "event_type": b.event_type,
            "guests": b.guests,
            "budget": b.budget,
            "selected_deal": b.selected_deal,
            "total_price": float(b.total_price),
            "status": b.status,
            "created_at": b.created_at.isoformat(),
        })
    return JsonResponse(data, safe=False)


@staff_member_required
def reports_pdf(request):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib import colors
        import io

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=24,
            textColor=colors.HexColor('#d88ca0'),
            alignment=TA_CENTER,
            spaceAfter=30
        )

        start_date = request.GET.get('start')
        end_date = request.GET.get('end')
        today = timezone.now()

        title = Paragraph("IK Delights - Analytics Report", title_style)
        elements.append(title)
        elements.append(Spacer(1, 20))

        if start_date and end_date:
            date_text = Paragraph(f"Report Period: {start_date} to {end_date}", styles['Normal'])
            elements.append(date_text)
        else:
            date_text = Paragraph("Report Period: Last 6 Months", styles['Normal'])
            elements.append(date_text)

        date_generated = Paragraph(f"Generated on: {today.strftime('%d %b %Y, %I:%M %p')}", styles['Normal'])
        elements.append(date_generated)
        elements.append(Spacer(1, 20))

        orders = Order.objects.filter(payment_status__in=['partial_paid', 'fully_paid']).select_related('user')
        if start_date and end_date:
            orders = orders.filter(created_at__date__range=[start_date, end_date])

        total_orders = orders.count()
        orders_text = Paragraph(f"<b>Total Paid Orders:</b> {total_orders}", styles['Normal'])
        elements.append(orders_text)

        revenue_result = orders.aggregate(
            total=Coalesce(Sum('received_amount'), Value(0, DecimalField()))
        )['total']
        total_revenue = float(revenue_result or 0)
        revenue_text = Paragraph(f"<b>Total Revenue Received:</b> Rs {total_revenue:,.2f}", styles['Normal'])
        elements.append(revenue_text)

        whatsapp_orders = orders.filter(order_type='whatsapp').count()
        whatsapp_text = Paragraph(f"<b>WhatsApp Orders:</b> {whatsapp_orders}", styles['Normal'])
        elements.append(whatsapp_text)

        website_orders = orders.exclude(order_type='whatsapp').count()
        website_text = Paragraph(f"<b>Website Orders:</b> {website_orders}", styles['Normal'])
        elements.append(website_text)

        elements.append(Spacer(1, 30))
        footer = Paragraph("Thank you for choosing IK Delights!", styles['Normal'])
        elements.append(footer)

        doc.build(elements)
        buffer.seek(0)

        if start_date and end_date:
            filename = f"reports_{start_date}_to_{end_date}.pdf"
        else:
            filename = f"reports_{today.strftime('%Y%m%d')}.pdf"

        return FileResponse(buffer, as_attachment=True, filename=filename)
    except Exception as e:
        logger.exception("Reports PDF error")
        return HttpResponse("Reports PDF generation failed. Please try again later.", status=500)


@staff_member_required
def delete_message(request, message_id):
    if request.method == "DELETE":
        try:
            message = get_object_or_404(ContactMessage, id=message_id)
            message.delete()
            return JsonResponse({"status": "success"})
        except Exception as e:
            logger.exception("Delete message error")
            return safe_error_response()
    return safe_error_response("DELETE required", 405)


@staff_member_required
def delete_customer(request, customer_id):
    if request.method == "POST":
        profile = get_object_or_404(Profile, id=customer_id)
        user = profile.user
        profile.delete()
        user.delete()
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid request", 400)


@staff_member_required
def update_customer(request, customer_id):
    if request.method == "PUT":
        data = safe_json_parse(request)
        if not data:
            return safe_error_response("Invalid JSON", 400)
        profile = get_object_or_404(Profile, id=customer_id)
        profile.phone = data.get("phone", profile.phone)
        profile.city = data.get("city", profile.city)
        profile.address = data.get("address", profile.address)
        profile.save()
        return JsonResponse({"status": "ok"})
    return safe_error_response("Invalid request", 400)