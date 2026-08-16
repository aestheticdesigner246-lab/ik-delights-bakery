import re

from django.core.exceptions import ValidationError


# ============================================================
# TRANSACTION ID VALIDATOR
# ============================================================

def validate_transaction_id(value):

    if not value:
        return

    value = value.strip().upper()

    pattern = r'^(JC|EP)[0-9]{6,12}$'

    if not re.match(pattern, value):

        raise ValidationError(
            "Invalid transaction ID format."
        )

    # BLOCK FAKE / SUSPICIOUS IDS

    blocked_patterns = [
        '111111',
        '123456',
        '000000',
        '999999',
        '222222',
        '333333',
    ]

    for pattern_text in blocked_patterns:

        if pattern_text in value:

            raise ValidationError(
                "Suspicious transaction ID detected."
            )


# ============================================================
# PAYMENT SCREENSHOT VALIDATOR
# ============================================================

def validate_payment_screenshot(file):

    if not file:

        raise ValidationError(
            "Payment screenshot is required."
        )

    # MAX SIZE = 5MB

    max_size = 5 * 1024 * 1024

    if file.size > max_size:

        raise ValidationError(
            "Image size must be less than 5MB."
        )

    # ALLOWED TYPES

    allowed_types = [
        'image/jpeg',
        'image/png',
        'image/webp',
    ]

    content_type = file.content_type

    if content_type not in allowed_types:

        raise ValidationError(
            "Only JPG, PNG, and WEBP images are allowed."
        )

    # FAKE FILE CHECK

    allowed_extensions = [
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
    ]

    filename = file.name.lower()

    if not any(filename.endswith(ext) for ext in allowed_extensions):

        raise ValidationError(
            "Invalid image file extension."
        )

    # EMPTY FILE BLOCK

    if file.size == 0:

        raise ValidationError(
            "Uploaded screenshot is empty."
        )