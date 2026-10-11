import base64
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

from PIL import Image

from image_input import ImageInputError, MAX_JSON_BYTES, decode_image
from model import IDENTITY
from server import make_handler


def payload(image=None, fmt="PNG", **save_args):
    image = image or Image.new("RGB", (16, 8), "green")
    output = BytesIO()
    image.save(output, format=fmt, **save_args)
    mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[fmt]
    return {"imageBase64": base64.b64encode(output.getvalue()).decode("ascii"), "mimeType": mime}


class ImageSafetyTests(unittest.TestCase):
    def assert_error(self, input_payload, code):
        with self.assertRaises(ImageInputError) as caught:
            decode_image(input_payload)
        self.assertEqual(caught.exception.code, code)

    def test_supported_formats_decode_to_rgb(self):
        for fmt in ("PNG", "JPEG", "WEBP"):
            with self.subTest(fmt=fmt):
                decoded = decode_image(payload(fmt=fmt))
                self.assertEqual(decoded.mode, "RGB")
                self.assertEqual(decoded.size, (16, 8))
                self.assertFalse(decoded.info)

    def test_mime_mismatch_rejected(self):
        value = payload()
        value["mimeType"] = "image/jpeg"
        self.assert_error(value, "INVALID_IMAGE_TYPE")

    def test_corrupt_input_rejected(self):
        self.assert_error({"imageBase64": "%%%", "mimeType": "image/png"}, "INVALID_IMAGE")
        self.assert_error({"imageBase64": base64.b64encode(b"not an image").decode(), "mimeType": "image/png"}, "INVALID_IMAGE")

    def test_oversized_base64_rejected_before_decode(self):
        with patch('image_input.MAX_IMAGE_BYTES', 10):
            self.assert_error(payload(), "IMAGE_TOO_LARGE")

    def test_excessive_decoded_pixels_rejected(self):
        with patch('image_input.MAX_PIXELS', 100):
            self.assert_error(payload(), "INVALID_IMAGE")

    def test_orientation_applied_and_exif_removed(self):
        exif = Image.Exif()
        exif[274] = 6  # 90-degree clockwise rotation
        exif[315] = "Private photographer"
        decoded = decode_image(payload(fmt="JPEG", exif=exif))
        self.assertEqual(decoded.size, (8, 16))
        self.assertEqual(len(decoded.getexif()), 0)
        self.assertFalse(decoded.info)

    def test_transparency_flattened_white_and_large_image_resized(self):
        decoded = decode_image(payload(Image.new("RGBA", (1700, 850), (255, 0, 0, 0))))
        self.assertEqual(decoded.size, (1536, 768))
        self.assertEqual(decoded.getpixel((0, 0)), (255, 255, 255))

    def test_animated_upload_rejected(self):
        animated = payload(Image.new("RGB", (8, 8), "red"), save_all=True, append_images=[Image.new("RGB", (8, 8), "blue")], duration=100, loop=0)
        self.assert_error(animated, "INVALID_IMAGE")


class TransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Mock encoder only: transport tests do not claim model inference coverage.
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(lambda _image: [1.0] + [0.0] * 511, IDENTITY))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.address = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def test_health_identity_and_embedding_response(self):
        with urlopen(self.address + "/health") as response:
            self.assertEqual(json.load(response), {"status": "ok", **IDENTITY})
        request = Request(self.address + "/embed", data=json.dumps(payload()).encode(), headers={"Content-Type": "application/json"})
        with urlopen(request) as response:
            result = json.load(response)
            self.assertEqual(len(result["embedding"]), 512)
            self.assertTrue(result["normalized"])
            self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_direct_browser_upload_rejected(self):
        request = Request(self.address + "/embed", data=b"{}", headers={"Content-Type": "application/json", "Origin": "https://example.com"})
        with self.assertRaises(HTTPError) as caught:
            urlopen(request)
        self.assertEqual(caught.exception.code, 403)

    def test_body_limit_enforced_before_read(self):
        request = Request(self.address + "/embed", data=b"{}", headers={"Content-Type": "application/json", "Content-Length": str(MAX_JSON_BYTES + 1)})
        with self.assertRaises(HTTPError) as caught:
            urlopen(request)
        self.assertEqual(caught.exception.code, 413)


class SupervisorLifetimeTests(unittest.TestCase):
    def test_managed_stdin_eof_stops_actual_python_service_without_loading_model(self):
        script = '\n'.join([
            'from http.server import ThreadingHTTPServer',
            'from server import make_handler, serve',
            'from model import IDENTITY',
            'server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(lambda image: [1.0] + [0.0] * 511, IDENTITY))',
            'print("mock-service-ready", flush=True)',
            'serve(server, managed_stdin=True)',
            'print("graceful-shutdown-complete", flush=True)',
        ])
        # This is a real child interpreter and real HTTP lifecycle, with only the
        # encoder mocked. Empty input closes the supervisor pipe immediately.
        completed = subprocess.run([sys.executable, '-u', '-c', script], cwd=Path(__file__).parent,
                                   input=b'', stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())
        self.assertIn(b'graceful-shutdown-complete', completed.stdout)


if __name__ == "__main__":
    unittest.main()
