import sys
import socket
import random
import string
import time
import re
import uvicorn
from pathlib import Path
from typing import Dict, Optional

if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse

app = FastAPI(title="CastOn Game Console Platform")

BASE_DIR = Path(__file__).parent
STATIC_DIR = (BASE_DIR / "caston" / "static") if (BASE_DIR / "caston" / "static").exists() else (BASE_DIR / "static")
SERVER_START_TIME = int(time.time())

def get_asset_version() -> str:
    """Returns the latest modification timestamp across static files, or server start time."""
    try:
        latest = max(p.stat().st_mtime for p in STATIC_DIR.rglob("*") if p.is_file())
        return str(int(latest))
    except Exception:
        return str(SERVER_START_TIME)

NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}

def render_html_with_cache_busting(filepath: Path) -> HTMLResponse:
    """Injects dynamic cache-busting query params into all /static/ assets."""
    content = filepath.read_text(encoding="utf-8")
    version = get_asset_version()
    pattern = r'((?:href|src)=["\']/static/[^"\'?#]+)(["\'])'
    busted = re.sub(pattern, rf'\1?v={version}\2', content)
    return HTMLResponse(busted, headers=NO_CACHE_HEADERS)

@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path in ["/", "/tv", "/controller"]:
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    elif request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

def get_lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

LAN_IP = get_lan_ip()
PORT = 8000

PLAYER_COLORS = [
    "#2563EB", # Cobalt Royal Blue
    "#F43F5E", # Coral Rose
    "#F59E0B", # Golden Amber
    "#10B981", # Emerald
    "#8B5CF6", # Royal Purple
    "#06B6D4", # Cyan
    "#EC4899", # Raspberry Pink
    "#F97316", # Sunset Orange
]

AVATARS = ["🦊", "🐼", "🦁", "🐸", "🐙", "🦄", "🦖", "🤖"]

class Room:
    def __init__(self, code: str, tv_ws: WebSocket):
        self.code = code
        self.tv_ws = tv_ws
        self.controllers: Dict[str, WebSocket] = {}
        self.players: Dict[str, dict] = {}
        self.vip_id: Optional[str] = None
        self.current_layout: str = "dpad"
        self.layout_state: dict = {}

    def assign_vip(self):
        if not self.players:
            self.vip_id = None
            return
        if self.vip_id not in self.players:
            self.vip_id = next(iter(self.players.keys()))
        for pid, pdata in self.players.items():
            pdata["is_vip"] = (pid == self.vip_id)

rooms: Dict[str, Room] = {}

def generate_room_code() -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase, k=4))
        if code not in rooms:
            return code

@app.get("/")
async def root():
    return RedirectResponse(url="/tv")

@app.get("/tv")
async def tv_view():
    return render_html_with_cache_busting(STATIC_DIR / "tv.html")

@app.get("/controller")
async def controller_view():
    return render_html_with_cache_busting(STATIC_DIR / "controller.html")

@app.get("/api/reload")
@app.post("/api/reload")
async def force_reload_all():
    """Broadcasts a reload command to all connected TVs and mobile controllers."""
    for room in list(rooms.values()):
        try:
            await room.tv_ws.send_json({"type": "reload"})
        except Exception:
            pass
        for c_ws in list(room.controllers.values()):
            try:
                await c_ws.send_json({"type": "reload"})
            except Exception:
                pass
    return {"status": "ok", "message": "Reload signal broadcasted to all clients."}

@app.websocket("/ws/tv")
async def tv_ws_endpoint(ws: WebSocket):
    await ws.accept()
    code = generate_room_code()
    room = Room(code, ws)
    rooms[code] = room

    join_url = f"http://{LAN_IP}:{PORT}/controller?code={code}"
    await ws.send_json({
        "type": "room_init",
        "code": code,
        "join_url": join_url,
        "lan_ip": f"{LAN_IP}:{PORT}"
    })

    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type")

            # TV requests controller layout switch or state update
            if msg_type == "set_layout":
                room.current_layout = msg.get("layout", "dpad")
                room.layout_state = msg.get("state", {})
                target = msg.get("target", "all")

                payload = {
                    "type": "layout_update",
                    "layout": room.current_layout,
                    "state": room.layout_state
                }
                if target == "all":
                    for pid, c_ws in list(room.controllers.items()):
                        try:
                            await c_ws.send_json(payload)
                        except Exception:
                            pass
                elif target in room.controllers:
                    try:
                        await room.controllers[target].send_json(payload)
                    except Exception:
                        pass

            # TV sends direct event to specific or all controllers (haptics, secret prompts, scores)
            elif msg_type == "to_controller":
                target = msg.get("target", "all")
                payload = msg.get("payload", {})
                if target == "all":
                    for c_ws in list(room.controllers.values()):
                        try:
                            await c_ws.send_json(payload)
                        except Exception:
                            pass
                elif target in room.controllers:
                    try:
                        await room.controllers[target].send_json(payload)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        for c_ws in list(room.controllers.values()):
            try:
                await c_ws.send_json({"type": "room_closed"})
                await c_ws.close()
            except Exception:
                pass
        rooms.pop(code, None)

@app.websocket("/ws/controller/{code}")
async def controller_ws_endpoint(ws: WebSocket, code: str, name: str = "Player", pid: str = "", avatar: str = ""):
    code = code.upper().strip()
    await ws.accept()

    if code not in rooms:
        await ws.send_json({"type": "error", "message": f"Room '{code}' not found. Check the TV screen!"})
        await ws.close()
        return

    room = rooms[code]

    # Reconnect support if pid is known, otherwise create new player
    if not pid or pid not in room.players:
        idx = len(room.players)
        pid = f"p_{random.randint(10000, 99999)}"
        color = PLAYER_COLORS[idx % len(PLAYER_COLORS)]
        default_avatar = AVATARS[idx % len(AVATARS)]
        chosen_avatar = avatar if (avatar and len(avatar) <= 32) else default_avatar
        room.players[pid] = {
            "id": pid,
            "name": name[:12].strip() or f"Player {idx+1}",
            "color": color,
            "avatar": chosen_avatar,
            "score": 0,
            "is_vip": False
        }
    else:
        room.players[pid]["name"] = name[:12].strip() or room.players[pid]["name"]
        if avatar and len(avatar) <= 32:
            room.players[pid]["avatar"] = avatar

    room.controllers[pid] = ws
    room.assign_vip()

    # Send welcome & current layout to controller
    await ws.send_json({
        "type": "joined",
        "player": room.players[pid],
        "layout": room.current_layout,
        "state": room.layout_state,
        "room_code": room.code
    })

    # Notify all controllers of VIP status updates
    for c_pid, c_ws in list(room.controllers.items()):
        try:
            await c_ws.send_json({"type": "vip_update", "is_vip": room.players[c_pid]["is_vip"]})
        except Exception:
            pass

    # Notify TV
    await room.tv_ws.send_json({
        "type": "players_sync",
        "players": list(room.players.values()),
        "vip_id": room.vip_id
    })

    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action")
            if action == "update_profile":
                new_name = (data.get("name") or "").strip()[:12]
                new_avatar = (data.get("avatar") or "").strip()
                changed = False
                if new_name and pid in room.players:
                    room.players[pid]["name"] = new_name
                    changed = True
                if new_avatar and pid in room.players:
                    room.players[pid]["avatar"] = new_avatar
                    changed = True
                if changed:
                    await room.tv_ws.send_json({
                        "type": "players_sync",
                        "players": list(room.players.values()),
                        "vip_id": room.vip_id
                    })
                    await ws.send_json({
                        "type": "profile_sync",
                        "player": room.players[pid]
                    })
                continue

            await room.tv_ws.send_json({
                "type": "controller_input",
                "player_id": pid,
                "player": room.players.get(pid),
                "data": data
            })
    except WebSocketDisconnect:
        room.controllers.pop(pid, None)
        room.players.pop(pid, None)
        room.assign_vip()
        if not room.players:
            room.current_layout = "dpad"
            room.layout_state = {}
        try:
            await room.tv_ws.send_json({
                "type": "players_sync",
                "players": list(room.players.values()),
                "vip_id": room.vip_id
            })
            for c_pid, c_ws in list(room.controllers.items()):
                await c_ws.send_json({"type": "vip_update", "is_vip": room.players[c_pid]["is_vip"]})
        except Exception:
            pass

if __name__ == "__main__":
    print("\n" + "="*58)
    print("  🎮 CastOn LAN Console Platform is Ready!")
    print(f"  📺 Open on Android TV : http://{LAN_IP}:{PORT}/tv")
    print(f"  📱 Mobile Controller  : http://{LAN_IP}:{PORT}/controller")
    print("="*58 + "\n")
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)
