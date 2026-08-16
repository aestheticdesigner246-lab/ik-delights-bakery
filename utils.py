import urllib.parse
import re

def send_whatsapp_message(phone, message):
    """
    Returns a WhatsApp wa.me link with pre-filled message.
    No webbrowser.open – just returns URL for admin button.
    """
    if not phone:
        return ""

    # Keep only digits
    phone = re.sub(r'\D', '', str(phone))

    # Convert to international format (Pakistan)
    if phone.startswith('0') and len(phone) == 11:
        phone = '92' + phone[1:]
    elif not phone.startswith('92') and len(phone) == 10:
        phone = '92' + phone
    elif not phone.startswith('92'):
        phone = '92' + phone

    encoded_msg = urllib.parse.quote(message)
    wa_url = f"https://wa.me/{phone}?text={encoded_msg}"
    return wa_url