from email.message import EmailMessage
import smtplib
from urllib.parse import urlencode

from app.core.config import Settings


def send_password_reset_email(settings: Settings, email_address: str, token: str) -> None:
    query = urlencode({"token": token})
    separator = "&" if "?" in settings.password_reset_url else "?"
    reset_link = f"{settings.password_reset_url}{separator}{query}"
    message = EmailMessage()
    message["Subject"] = "Reset your DMS password"
    message["From"] = settings.smtp_from_address
    message["To"] = email_address
    message.set_content(
        "A password reset was requested for your Disaster Management System account.\n\n"
        f"Use this link within 30 minutes to choose a new password:\n{reset_link}\n\n"
        "If you did not request this change, you can ignore this message."
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as client:
        client.ehlo()
        if settings.smtp_starttls:
            client.starttls()
            client.ehlo()
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        client.send_message(message)
