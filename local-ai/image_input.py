"""Decode and scrub uploads in memory. This module never writes image data."""
import base64
import binascii
from io import BytesIO
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 25_000_000
MAX_JSON_BYTES = ((MAX_IMAGE_BYTES + 2) // 3) * 4 + 1024
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


class ImageInputError(ValueError):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code


def decode_image(payload):
    if not isinstance(payload, dict) or set(payload) != {"imageBase64", "mimeType"}:
        raise ImageInputError(400, "INVALID_INPUT", "Send imageBase64 and mimeType.")
    encoded, mime = payload["imageBase64"], payload["mimeType"]
    if not isinstance(mime, str) or mime not in FORMATS:
        raise ImageInputError(415, "INVALID_IMAGE_TYPE", "Use JPEG, PNG or WebP.")
    if not isinstance(encoded, str) or not encoded:
        raise ImageInputError(400, "INVALID_IMAGE", "An image is required.")
    if len(encoded) > ((MAX_IMAGE_BYTES + 2) // 3) * 4:
        raise ImageInputError(413, "IMAGE_TOO_LARGE", "Choose an image smaller than 5 MB.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ImageInputError(400, "INVALID_IMAGE", "Image base64 is invalid.") from None
    if len(data) > MAX_IMAGE_BYTES:
        raise ImageInputError(413, "IMAGE_TOO_LARGE", "Choose an image smaller than 5 MB.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as original:
                if original.format != FORMATS[mime]:
                    raise ImageInputError(415, "INVALID_IMAGE_TYPE", "Image format does not match mimeType.")
                if original.width * original.height > MAX_PIXELS:
                    raise ImageInputError(400, "INVALID_IMAGE", "Image exceeds 25 million pixels.")
                if getattr(original, "n_frames", 1) != 1:
                    raise ImageInputError(400, "INVALID_IMAGE", "Choose a still image.")
                original.load()  # Fully decode; Pillow's truncated-image tolerance stays disabled.
                oriented = ImageOps.exif_transpose(original)
                rgba = oriented.convert("RGBA")
                clean = Image.new("RGB", rgba.size, "white")
                clean.paste(rgba, mask=rgba.getchannel("A"))
                clean.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
                # A fresh RGB image has no EXIF, GPS, ICC profile, or source metadata.
                clean.info.clear()
                return clean
    except ImageInputError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageInputError(400, "INVALID_IMAGE", "Image is damaged or too large to decode.") from None
