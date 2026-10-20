import sys
import argparse
import uvicorn
from .server import app, LAN_IP, PORT as DEFAULT_PORT
from . import __version__

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="caston",
        description="CastOn — Self-hosted LAN party game console for Android TV and smartphones."
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host interface to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "-p", "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Port number to listen on (default: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload on code changes (development mode)"
    )
    parser.add_argument(
        "-v", "--version",
        action="version",
        version=f"CastOn {__version__}"
    )
    return parser.parse_args(argv)

def print_banner(lan_ip: str, port: int):
    border = "=" * 60
    print("\n" + border)
    print("  🎮 CastOn LAN Game Console Platform is Ready!")
    print(f"  📺 Open on Android TV : http://{lan_ip}:{port}/tv")
    print(f"  📱 Mobile Controller  : http://{lan_ip}:{port}/controller")
    print(border + "\n")

def main(argv=None):
    args = parse_args(argv)

    import caston.server as server_mod
    server_mod.PORT = args.port

    print_banner(server_mod.LAN_IP, args.port)

    try:
        uvicorn.run(
            "caston.server:app",
            host=args.host,
            port=args.port,
            reload=args.reload
        )
    except KeyboardInterrupt:
        print("\nCastOn console stopped.")
        sys.exit(0)

if __name__ == "__main__":
    main()

