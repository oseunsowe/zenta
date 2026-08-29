"""In-memory screen relay: one publisher per session, fan-out to viewers."""

import asyncio
from collections import defaultdict
from typing import Set

from fastapi import WebSocket


class Relay:
    def __init__(self) -> None:
        self._publishers: dict[str, WebSocket] = {}
        self._viewers: dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def has_publisher(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._publishers

    async def register_publisher(self, session_id: str, ws: WebSocket) -> bool:
        async with self._lock:
            if session_id in self._publishers:
                return False
            self._publishers[session_id] = ws
            return True

    async def unregister_publisher(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if self._publishers.get(session_id) is ws:
                self._publishers.pop(session_id, None)
            viewers = list(self._viewers.get(session_id, ()))
        # Notify viewers the stream ended.
        for viewer in viewers:
            try:
                await viewer.close(code=1000)
            except Exception:
                pass

    async def register_viewer(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._viewers[session_id].add(ws)

    async def unregister_viewer(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self._viewers.get(session_id, set()).discard(ws)

    async def broadcast(self, session_id: str, frame: bytes) -> None:
        async with self._lock:
            viewers = list(self._viewers.get(session_id, ()))
        dead: list[WebSocket] = []
        for viewer in viewers:
            try:
                await viewer.send_bytes(frame)
            except Exception:
                dead.append(viewer)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._viewers.get(session_id, set()).discard(ws)

    async def send_input(self, session_id: str, payload: str) -> None:
        async with self._lock:
            publisher = self._publishers.get(session_id)
        if publisher is None:
            return
        try:
            await publisher.send_text(payload)
        except Exception:
            await self.unregister_publisher(session_id, publisher)


relay = Relay()


class WebRtcRelay:
    """Signaling-only relay for /ws/screen-webrtc: forwards SDP/ICE JSON

    between exactly one publisher and one viewer per session — never carries
    media or input, those go peer-to-peer once negotiation completes. Scoped
    to a single viewer (a plain dict, not a Set like Relay._viewers) because
    WebRTC needs a distinct RTCPeerConnection per viewer; supporting several
    at once is a separate SFU/multi-PC design left for a later phase.
    """

    def __init__(self) -> None:
        self._publishers: dict[str, WebSocket] = {}
        self._viewers: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def has_viewer(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._viewers

    async def has_publisher(self, session_id: str) -> bool:
        async with self._lock:
            return session_id in self._publishers

    async def notify_publisher_viewer_joined(self, session_id: str) -> None:
        await self.forward_to_publisher(session_id, {'type': 'viewer-joined'})

    async def register_publisher(self, session_id: str, ws: WebSocket) -> bool:
        async with self._lock:
            if session_id in self._publishers:
                return False
            self._publishers[session_id] = ws
            return True

    async def unregister_publisher(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if self._publishers.get(session_id) is ws:
                self._publishers.pop(session_id, None)
            viewer = self._viewers.get(session_id)
        if viewer is not None:
            try:
                await viewer.send_json({'type': 'hangup'})
            except Exception:
                pass

    async def register_viewer(self, session_id: str, ws: WebSocket) -> bool:
        async with self._lock:
            if session_id in self._viewers:
                return False
            self._viewers[session_id] = ws
            return True

    async def unregister_viewer(self, session_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if self._viewers.get(session_id) is ws:
                self._viewers.pop(session_id, None)

    async def forward_to_viewer(self, session_id: str, message: dict) -> None:
        async with self._lock:
            viewer = self._viewers.get(session_id)
        if viewer is None:
            return
        try:
            await viewer.send_json(message)
        except Exception:
            await self.unregister_viewer(session_id, viewer)

    async def forward_to_publisher(self, session_id: str, message: dict) -> None:
        async with self._lock:
            publisher = self._publishers.get(session_id)
        if publisher is None:
            return
        try:
            await publisher.send_json(message)
        except Exception:
            await self.unregister_publisher(session_id, publisher)


webrtc_relay = WebRtcRelay()
