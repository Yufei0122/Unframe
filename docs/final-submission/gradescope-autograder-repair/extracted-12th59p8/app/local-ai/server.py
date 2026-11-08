"""Loopback-only JSON embedding service. Upload bytes exist only in request memory."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import sys
import threading

from image_input import ImageInputError, MAX_JSON_BYTES, decode_image
from model import load_encoder


def make_handler(embed, identity):
    inference_lock = threading.BoundedSemaphore(1)

    class Handler(BaseHTTPRequestHandler):
        server_version = "UnframeOpenCLIP/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_args):
            pass  # Do not log request paths, images, request bodies, or uploaded metadata.

        def reply(self, status, payload):
            content = json.dumps(payload, allow_nan=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            if self.path != "/health":
                return self.reply(404, {"error": "NOT_FOUND"})
            self.reply(200, {"status": "ok", **identity})

        def do_POST(self):
            if self.path != "/embed":
                return self.reply(404, {"error": "NOT_FOUND"})
            # Browsers must go through the Node upload validation and origin checks.
            if self.headers.get("Origin"):
                return self.reply(403, {"error": "ORIGIN_NOT_ALLOWED"})
            if self.headers.get_content_type() != "application/json":
                return self.reply(415, {"error": "JSON_REQUIRED"})
            if self.headers.get("Transfer-Encoding"):
                return self.reply(400, {"error": "CONTENT_LENGTH_REQUIRED"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, {"error": "INVALID_CONTENT_LENGTH"})
            if size <= 0:
                return self.reply(400, {"error": "INVALID_INPUT"})
            if size > MAX_JSON_BYTES:
                return self.reply(413, {"error": "IMAGE_TOO_LARGE"})
            if not inference_lock.acquire(blocking=False):
                return self.reply(503, {"error": "CLIP_BUSY", "message": "OpenCLIP is busy; retry shortly."})
            try:
                raw = self.rfile.read(size)
                if len(raw) != size:
                    raise ImageInputError(400, "INVALID_INPUT", "Incomplete JSON body.")
                payload = json.loads(raw)
                image = decode_image(payload)
                try:
                    embedding = embed(image)
                finally:
                    image.close()
                self.reply(200, {**identity, "embedding": embedding})
            except ImageInputError as error:
                self.reply(error.status, {"error": error.code, "message": str(error)})
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.reply(400, {"error": "INVALID_JSON"})
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
            except Exception:
                self.reply(500, {"error": "EMBEDDING_FAILED", "message": "Local embedding failed; inspect model installation and memory."})
            finally:
                inference_lock.release()

    return Handler


def serve(server, *, managed_stdin=False, input_stream=None):
    """A supervisor-owned pipe reaching EOF ends this exact Python process.

    Windows venv python.exe may forward execution to another python.exe. The
    inherited stdin pipe stays with the actual interpreter, so supervisor death
    still shuts it down even if only the forwarding process was terminated.
    """
    server.daemon_threads = True
    if managed_stdin:
        stream = input_stream if input_stream is not None else sys.stdin.buffer

        def stop_on_eof():
            try:
                while stream.read(1):
                    pass
            finally:
                server.shutdown()

        threading.Thread(target=stop_on_eof, name="supervisor-stdin", daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost"])
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--managed-stdin", action="store_true", help="Stop on supervisor stdin EOF; used by ai:clip/ai:up only.")
    args = parser.parse_args()
    print("Loading local OpenCLIP on CPU; uploaded photos are never saved.", flush=True)
    embed, identity = load_encoder()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(embed, identity))
    print(json.dumps({"service": "openclip", "address": f"http://{args.host}:{args.port}", **identity}), flush=True)
    serve(server, managed_stdin=args.managed_stdin)


if __name__ == "__main__":
    main()
