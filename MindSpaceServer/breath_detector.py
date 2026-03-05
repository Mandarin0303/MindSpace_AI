"""
MindSpace VR - Meta Quest 2 호흡 측정 모듈
=========================================
내장 마이크 + 머리 움직임(IMU) 융합으로 실시간 호흡 감지

신호 소스:
  1. Microphone  → 호흡 소리 주파수 분석 (80~600Hz 대역)
  2. IMU (Head)  → 숨 쉴 때 발생하는 미세 수직 진동 (0.1~0.5Hz)

출력:
  - RPM (breaths per minute)
  - 호흡 상태: NORMAL / SLOW / FAST / HOLD
  - confidence score (0.0~1.0)
"""

import numpy as np
from scipy import signal
from scipy.fft import rfft, rfftfreq
from collections import deque
import time
from dataclasses import dataclass, field
from typing import Optional

# ──────────────────────────────────────────
# 설정 상수
# ──────────────────────────────────────────
MIC_SAMPLE_RATE = 16000          # Hz  (Quest 2 내장 마이크)
IMU_SAMPLE_RATE = 72             # Hz  (Quest 2 IMU: 실제 약 60~72Hz)
BREATH_WINDOW_SEC = 10           # 분석 윈도우 (초)
BREATH_FREQ_MIN = 0.1            # Hz → 6 RPM  (최저 호흡수)
BREATH_FREQ_MAX = 0.6            # Hz → 36 RPM (최고 호흡수)
NORMAL_RPM_MIN, NORMAL_RPM_MAX = 12, 20   # 정상 호흡 범위

# 호흡 소리 주파수 대역 (코/입 통과 소음)
BREATH_AUDIO_LOW  = 80           # Hz
BREATH_AUDIO_HIGH = 600          # Hz


# ──────────────────────────────────────────
# 데이터 컨테이너
# ──────────────────────────────────────────
@dataclass
class BreathState:
    rpm: float = 0.0
    status: str = "UNKNOWN"       # NORMAL / SLOW / FAST / HOLD / UNKNOWN
    confidence: float = 0.0
    inhale: bool = False          # 현재 들숨 여부
    mic_rpm: float = 0.0
    imu_rpm: float = 0.0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "rpm": round(self.rpm, 1),
            "status": self.status,
            "confidence": round(self.confidence, 2),
            "inhale": self.inhale,
            "mic_rpm": round(self.mic_rpm, 1),
            "imu_rpm": round(self.imu_rpm, 1),
            "timestamp": self.timestamp,
        }


# ──────────────────────────────────────────
# 1. 마이크 채널 분석기
# ──────────────────────────────────────────
class MicrophoneBreathAnalyzer:
    """
    Quest 2 내장 마이크 오디오에서 호흡 패턴 추출.

    원리:
      - 80~600Hz 대역 에너지를 프레임 단위로 추출 (envelope)
      - 추출된 에너지 신호에서 0.1~0.6Hz 피크 검출 → RPM 계산
    """

    def __init__(self):
        buf_len = MIC_SAMPLE_RATE * BREATH_WINDOW_SEC
        self._audio_buf: deque = deque(maxlen=buf_len)

        # 호흡 대역 bandpass 필터 (Butterworth 4th)
        nyq = MIC_SAMPLE_RATE / 2
        self._bp = signal.butter(
            4,
            [BREATH_AUDIO_LOW / nyq, BREATH_AUDIO_HIGH / nyq],
            btype="band",
        )

        # envelope 다운샘플 결과 버퍼 (~10Hz)
        env_len = BREATH_WINDOW_SEC * 10
        self._env_buf: deque = deque(maxlen=env_len)
        self._env_fs = 10          # 다운샘플 주파수

    # ── 외부 입력 ──────────────────────────
    def push_audio(self, samples: np.ndarray):
        """
        Quest 2에서 수신한 PCM 샘플 추가 (float32, -1.0~1.0).
        실제 환경: WebSocket으로 청크 단위 수신
        """
        self._audio_buf.extend(samples.tolist())
        self._update_envelope(samples)

    def _update_envelope(self, samples: np.ndarray):
        """오디오 → 호흡 에너지 envelope 추출"""
        if len(samples) < 32:
            return
        # bandpass → 절댓값 → 저역 평활 (50ms 이동평균)
        filtered = signal.lfilter(*self._bp, samples)
        abs_sig = np.abs(filtered)
        # 50ms 이동평균
        win = max(1, MIC_SAMPLE_RATE // 20)
        if len(abs_sig) >= win:
            smoothed = np.convolve(abs_sig, np.ones(win) / win, mode="valid")
            # 10Hz 다운샘플
            step = max(1, MIC_SAMPLE_RATE // self._env_fs)
            downsampled = smoothed[::step]
            self._env_buf.extend(downsampled.tolist())

    # ── RPM 추출 ──────────────────────────
    def get_rpm(self) -> tuple[float, float]:
        """
        Returns: (rpm, confidence)
          confidence: 0.0~1.0 (스펙트럼 피크 선명도)
        """
        if len(self._env_buf) < self._env_fs * 4:   # 최소 4초 필요
            return 0.0, 0.0

        env = np.array(self._env_buf)

        # 직류 제거 + 정규화
        env = env - env.mean()
        if env.std() < 1e-8:
            return 0.0, 0.0
        env /= env.std()

        # FFT
        freqs = rfftfreq(len(env), d=1.0 / self._env_fs)
        spectrum = np.abs(rfft(env))

        # 호흡 주파수 대역 마스크
        mask = (freqs >= BREATH_FREQ_MIN) & (freqs <= BREATH_FREQ_MAX)
        if not mask.any():
            return 0.0, 0.0

        breath_spectrum = spectrum[mask]
        breath_freqs = freqs[mask]

        peak_idx = np.argmax(breath_spectrum)
        peak_freq = breath_freqs[peak_idx]
        peak_power = breath_spectrum[peak_idx]
        total_power = spectrum.sum() + 1e-10

        rpm = peak_freq * 60.0
        confidence = float(np.clip(peak_power / total_power * 5, 0, 1))

        return rpm, confidence


# ──────────────────────────────────────────
# 2. IMU 채널 분석기
# ──────────────────────────────────────────
class IMUBreathAnalyzer:
    """
    Quest 2 헤드셋 IMU (가속도계) 수직축 데이터에서 호흡 패턴 추출.

    원리:
      - 숨을 쉴 때 흉곽이 팽창 → 헤드셋이 미세하게 위아래로 움직임
      - Y축(수직) 가속도에서 0.1~0.6Hz 성분 추출
      - 저역통과 필터로 자세 변화(저주파) 제거 후 호흡 대역만 추출
    """

    def __init__(self):
        buf_len = IMU_SAMPLE_RATE * BREATH_WINDOW_SEC
        self._accel_y: deque = deque(maxlen=buf_len)

        nyq = IMU_SAMPLE_RATE / 2

        # 호흡 대역 bandpass (0.1 ~ 0.6 Hz)
        self._bp = signal.butter(
            4,
            [BREATH_FREQ_MIN / nyq, BREATH_FREQ_MAX / nyq],
            btype="band",
        )

        # 직전 들숨/날숨 판별용 (미분 방향)
        self._last_filtered: float = 0.0
        self._phase: str = "unknown"   # "inhale" / "exhale"

    # ── 외부 입력 ──────────────────────────
    def push_imu(self, accel_x: float, accel_y: float, accel_z: float):
        """
        IMU 가속도계 1 샘플 추가.
        Quest 2 OpenXR: XR_REFERENCE_SPACE_STAGE 기준 Y축 = 수직 위 방향
        """
        self._accel_y.append(accel_y)

    # ── RPM 추출 ──────────────────────────
    def get_rpm(self) -> tuple[float, float, bool]:
        """
        Returns: (rpm, confidence, is_inhale)
        """
        if len(self._accel_y) < IMU_SAMPLE_RATE * 5:   # 최소 5초
            return 0.0, 0.0, False

        accel = np.array(self._accel_y)

        # 중력 성분 제거 (이동평균 고역통과 효과)
        accel = accel - signal.sosfilt(
            signal.butter(2, 0.05 / (IMU_SAMPLE_RATE / 2), btype="low", output="sos"),
            accel,
        )

        # 호흡 대역 필터
        filtered = signal.lfilter(*self._bp, accel)

        if filtered.std() < 1e-9:
            return 0.0, 0.0, False

        # FFT로 주 호흡 주파수
        freqs = rfftfreq(len(filtered), d=1.0 / IMU_SAMPLE_RATE)
        spectrum = np.abs(rfft(filtered))
        mask = (freqs >= BREATH_FREQ_MIN) & (freqs <= BREATH_FREQ_MAX)

        if not mask.any():
            return 0.0, 0.0, False

        sub_spec = spectrum[mask]
        sub_freq = freqs[mask]
        peak_idx = np.argmax(sub_spec)
        peak_freq = sub_freq[peak_idx]
        peak_power = sub_spec[peak_idx]
        total_power = spectrum.sum() + 1e-10

        rpm = peak_freq * 60.0
        confidence = float(np.clip(peak_power / total_power * 8, 0, 1))

        # 현재 위상: 최근 10샘플 vs 이전 10샘플 평균 비교로 들숨/날숨 판별
        # 기존 filtered[-1] > filtered[-2] 방식은 노이즈에 너무 민감해서
        # 항상 날숨으로만 잡히는 문제가 있었음 → 이동평균 비교로 수정
        if len(filtered) >= 20:
            recent_mean = float(np.mean(filtered[-10:]))    # 최근 10샘플 평균
            prev_mean   = float(np.mean(filtered[-20:-10])) # 이전 10샘플 평균
            is_inhale   = recent_mean > prev_mean
        else:
            is_inhale = False

        return rpm, confidence, is_inhale


# ──────────────────────────────────────────
# 3. 융합 엔진
# ──────────────────────────────────────────
class BreathFusionEngine:
    """
    마이크 + IMU 두 채널을 confidence 가중치로 융합.

    융합 공식:
      fused_rpm = (mic_rpm × mic_conf + imu_rpm × imu_conf)
                  / (mic_conf + imu_conf + ε)

    한 채널이 신뢰도 낮으면 다른 채널이 자동으로 더 영향을 미침.
    """

    def __init__(self):
        self.mic = MicrophoneBreathAnalyzer()
        self.imu = IMUBreathAnalyzer()
        self._rpm_history: deque = deque(maxlen=10)   # 스무딩용

    # ── 데이터 수신 ────────────────────────
    def on_audio(self, samples: np.ndarray):
        self.mic.push_audio(samples)

    def on_imu(self, ax: float, ay: float, az: float):
        self.imu.push_imu(ax, ay, az)

    # ── 호흡 상태 계산 ─────────────────────
    def compute(self) -> BreathState:
        mic_rpm, mic_conf = self.mic.get_rpm()
        imu_rpm, imu_conf, is_inhale = self.imu.get_rpm()

        denom = mic_conf + imu_conf + 1e-10
        fused_rpm = (mic_rpm * mic_conf + imu_rpm * imu_conf) / denom
        total_conf = np.clip((mic_conf + imu_conf) / 2, 0, 1)

        # 이동평균 스무딩
        if fused_rpm > 0:
            self._rpm_history.append(fused_rpm)
        smoothed_rpm = float(np.mean(self._rpm_history)) if self._rpm_history else 0.0

        # 상태 분류
        status = self._classify(smoothed_rpm, total_conf)

        return BreathState(
            rpm=smoothed_rpm,
            status=status,
            confidence=float(total_conf),
            inhale=is_inhale,
            mic_rpm=mic_rpm,
            imu_rpm=imu_rpm,
        )

    @staticmethod
    def _classify(rpm: float, conf: float) -> str:
        if conf < 0.15:
            return "UNKNOWN"
        if rpm < 2:
            return "HOLD"          # 호흡 멈춤 (무호흡 의심)
        if rpm < NORMAL_RPM_MIN:
            return "SLOW"          # 깊은 명상 호흡
        if rpm > NORMAL_RPM_MAX:
            return "FAST"          # 과호흡 / 스트레스
        return "NORMAL"


# ──────────────────────────────────────────
# 4. 시뮬레이터 (테스트용 가상 센서 데이터)
# ──────────────────────────────────────────
class SensorSimulator:
    """
    실제 Quest 2 없이도 테스트 가능한 가상 센서 데이터 생성기.
    실제 구현 시 WebSocket 수신 루프로 교체.
    """

    def __init__(self, breath_rpm: float = 15.0, noise_level: float = 0.3):
        self.breath_hz = breath_rpm / 60.0
        self.noise = noise_level
        self._t = 0.0

    def next_audio_chunk(self, chunk_size: int = 1024) -> np.ndarray:
        """호흡 소리 + 배경 잡음 시뮬레이션"""
        t = np.linspace(self._t, self._t + chunk_size / MIC_SAMPLE_RATE, chunk_size)
        self._t += chunk_size / MIC_SAMPLE_RATE

        # 호흡 변조 (200Hz 캐리어를 호흡 주파수로 AM 변조)
        carrier = np.sin(2 * np.pi * 200 * t)
        envelope = 0.5 * (1 + np.sin(2 * np.pi * self.breath_hz * t))
        breath_audio = carrier * envelope * 0.6

        # 잡음
        noise = np.random.randn(chunk_size) * self.noise
        return (breath_audio + noise).astype(np.float32)

    def next_imu_sample(self) -> tuple[float, float, float]:
        """수직 호흡 진동 + 자세 드리프트 + 잡음 시뮬레이션"""
        ay_breath = 0.05 * np.sin(2 * np.pi * self.breath_hz * self._t)
        ay_drift = 9.8 + 0.002 * np.sin(0.01 * self._t)   # 중력 + 천천히 변하는 자세
        ay_noise = np.random.randn() * self.noise * 0.01
        ax = np.random.randn() * 0.005
        az = np.random.randn() * 0.005
        return ax, ay_drift + ay_breath + ay_noise, az


# ──────────────────────────────────────────
# 5. 메인 파이프라인 (실제 사용 예시)
# ──────────────────────────────────────────
def run_simulation(seconds: int = 20, target_rpm: float = 15.0):
    """
    시뮬레이션 실행 후 결과 출력.
    실제 환경에서는 WebSocket 콜백으로 on_audio / on_imu를 호출.
    """
    print(f"\n{'='*55}")
    print(f"  MindSpace VR - 호흡 측정 시뮬레이션")
    print(f"  목표 RPM: {target_rpm:.1f} | 측정 시간: {seconds}초")
    print(f"{'='*55}\n")

    engine = BreathFusionEngine()
    sim = SensorSimulator(breath_rpm=target_rpm, noise_level=0.25)

    audio_chunk_size = 1024
    imu_interval = 1.0 / IMU_SAMPLE_RATE
    audio_interval = audio_chunk_size / MIC_SAMPLE_RATE

    t = 0.0
    next_audio = 0.0
    next_imu = 0.0
    report_interval = 2.0
    next_report = report_interval

    states = []

    while t < seconds:
        # IMU 샘플 생성
        if t >= next_imu:
            ax, ay, az = sim.next_imu_sample()
            engine.on_imu(ax, ay, az)
            next_imu += imu_interval

        # 오디오 청크 생성
        if t >= next_audio:
            chunk = sim.next_audio_chunk(audio_chunk_size)
            engine.on_audio(chunk)
            next_audio += audio_interval

        # 2초마다 결과 출력
        if t >= next_report:
            state = engine.compute()
            states.append(state)
            _print_state(state, t)
            next_report += report_interval

        t += min(imu_interval, audio_interval)

    print(f"\n{'─'*55}")
    if states:
        avg_rpm = np.mean([s.rpm for s in states if s.rpm > 0])
        avg_conf = np.mean([s.confidence for s in states])
        print(f"  평균 RPM:        {avg_rpm:.1f} (목표: {target_rpm:.1f})")
        print(f"  평균 신뢰도:     {avg_conf:.2f}")
        print(f"  RPM 오차:        ±{abs(avg_rpm - target_rpm):.1f}")
    print(f"{'='*55}\n")
    return states


def _print_state(state: BreathState, t: float):
    status_emoji = {
        "NORMAL": "🟢", "SLOW": "🔵", "FAST": "🔴",
        "HOLD": "⚠️ ", "UNKNOWN": "⚫",
    }
    phase = "들숨 ↑" if state.inhale else "날숨 ↓"
    emoji = status_emoji.get(state.status, "⚫")
    bar = "█" * int(state.confidence * 20) + "░" * (20 - int(state.confidence * 20))

    print(f"  [{t:5.1f}s] {emoji} {state.status:<7} "
          f"| RPM {state.rpm:5.1f} (Mic:{state.mic_rpm:4.1f} / IMU:{state.imu_rpm:4.1f}) "
          f"| {phase} | conf [{bar}] {state.confidence:.2f}")


# ──────────────────────────────────────────
# 6. FastAPI 연동 예시 (실제 배포 시 사용)
# ──────────────────────────────────────────
FASTAPI_EXAMPLE = '''
# main.py (FastAPI + WebSocket 연동)
# ------------------------------------
from fastapi import FastAPI, WebSocket
import numpy as np, json
from breath_detector import BreathFusionEngine

app = FastAPI()
engine = BreathFusionEngine()

@app.websocket("/ws/breath")
async def breath_ws(ws: WebSocket):
    await ws.accept()
    while True:
        raw = await ws.receive_bytes()
        msg = json.loads(raw)

        if msg["type"] == "audio":
            samples = np.array(msg["samples"], dtype=np.float32)
            engine.on_audio(samples)

        elif msg["type"] == "imu":
            engine.on_imu(msg["ax"], msg["ay"], msg["az"])

        state = engine.compute()
        await ws.send_json(state.to_dict())

# Quest 2 JavaScript 클라이언트 (WebXR)
# ------------------------------------
# const ws = new WebSocket("wss://yourserver.com/ws/breath");
#
# // IMU 전송 (XRFrame에서)
# session.requestAnimationFrame((t, frame) => {
#   const pose = frame.getViewerPose(refSpace);
#   const vel = pose.angularVelocity;          // 각속도
#   const lin = pose.linearVelocity;           // 선속도 (Y = 수직)
#   ws.send(JSON.stringify({
#     type: "imu",
#     ax: lin.x, ay: lin.y, az: lin.z
#   }));
# });
#
# // 마이크 전송 (Web Audio API)
# const processor = audioCtx.createScriptProcessor(1024, 1, 1);
# processor.onaudioprocess = (e) => {
#   const samples = Array.from(e.inputBuffer.getChannelData(0));
#   ws.send(JSON.stringify({ type: "audio", samples }));
# };
'''


if __name__ == "__main__":
    # 정상 호흡 (15 RPM) 시뮬레이션
    run_simulation(seconds=20, target_rpm=15.0)

    # 느린 명상 호흡 (8 RPM) 시뮬레이션
    run_simulation(seconds=20, target_rpm=8.0)
