"""
main.py - MindSpace VR FastAPI WebSocket 서버
=============================================
실행:  uvicorn main:app --host 0.0.0.0 --port 8000

Quest 2와 같은 Wi-Fi에 연결된 PC에서 실행하세요.
유니티에서 serverUrl = "ws://[이 PC의 IP]:8000/ws/breath"
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import json
import asyncio
from breath_detector import BreathFusionEngine   # 이전에 만든 파일

app = FastAPI(title="MindSpace VR Breath Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 클라이언트별 엔진 관리
_engines: dict[str, BreathFusionEngine] = {}


@app.websocket("/ws/breath")
async def breath_endpoint(ws: WebSocket):
    await ws.accept()
    client_id = str(id(ws))
    engine = BreathFusionEngine()
    _engines[client_id] = engine
    print(f"[서버] 클라이언트 연결: {client_id}")

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg["type"] == "audio":
                samples = np.array(msg["samples"], dtype=np.float32)
                engine.on_audio(samples)

            elif msg["type"] == "imu":
                engine.on_imu(msg["ax"], msg["ay"], msg["az"])

            # 분석 결과 즉시 반환
            state = engine.compute()
            await ws.send_text(json.dumps(state.to_dict()))

    except WebSocketDisconnect:
        print(f"[서버] 클라이언트 종료: {client_id}")
    finally:
        _engines.pop(client_id, None)


@app.get("/health")
async def health():
    return {"status": "ok", "clients": len(_engines)}
