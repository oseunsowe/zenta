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
