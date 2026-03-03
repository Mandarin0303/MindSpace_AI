import sounddevice as sd
import numpy as np
import time
from scipy.signal import butter, lfilter, find_peaks
import cv2

# 먼저 어떤 장치들이 있는지 확인
# print(sd.query_devices())

# ===== 마이크 설정 =====
sd.default.device = 1  # 나의 장치 번호
FS = 48000  # 샘플링 주파수
DURATION = 1.0  # 녹음 시간 (초)
CHANNELS = 1

# ===== 함수 정의 =====

# 필터링(호흡 주파수만 추출)
# 숨소리는 100hz~1000hz 사이에 존재하므로, 이 범위의 주파수만 통과시키는 밴드패스 필터를 적용
def bandpass_filter(data, lowcut=100, highcut=1000, fs=48000):
    nyq = fs / 2
    b, a = butter(2, [lowcut/nyq, highcut/nyq], btype='band')
    return lfilter(b, a, data)

def get_stress_level(bpm):
    if bpm < 12 :       return "Mesuring...",       (128,128,128)
    elif bpm <= 15 :    return "LV1 Very Calm",     (0,255,0)
    elif bpm <= 18 :    return "LV2 Normal",        (255,255,0)
    elif bpm <= 22 :    return "LV3 Mild Stress",   (0,165,255)
    elif bpm <= 26 :    return "LV4 High Stress",   (0,0,255)
    else:               return "LV5 Emergency",     (0,0,200)

# ===== 초기화 =====
breath_count = 0
start_time = time.time()
level_text, color = "Measuring...", (128,128,128)

print("--- 호흡 측정 시작 (Q키로 종료) ---")

while True:
    # 1. 녹음
    recording = sd.rec(int(DURATION * FS), samplerate=FS, channels=CHANNELS, dtype='float32')
    sd.wait()
    audio = recording.flatten()

    # 2. 정규화 (-1 ~ 1 범위로)
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val

    # 3. 필터링
    filtered = bandpass_filter(audio)
    abs_data = np.abs(filtered)

    # 4. 피크 감지
    threshold = np.mean(abs_data) * 3  # 평균의 3배 이상만 호흡으로 인정
    peaks, _ = find_peaks(abs_data, height=threshold, distance=20000)
    if len(peaks) > 0:
        breath_count += 1

    # 5. BPM 계산 (10초 후부터)
    elapsed_time = time.time() - start_time
    if elapsed_time > 10:
        bpm = (breath_count / elapsed_time) * 60
        level_text, color = get_stress_level(bpm)
    else:
        bpm = 0

    # 디버깅 출력
    print(f"[{int(elapsed_time)}s] max:{max_val:.4f} | peaks:{len(peaks)} | breath:{breath_count} | BPM:{int(bpm)}")
    
    # 6. 화면 출력
    canvas = np.zeros((400, 600, 3), dtype=np.uint8)
    cv2.putText(canvas, f"Time: {int(elapsed_time)}s / 60s", (30,50),  cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
    cv2.putText(canvas, f"Breaths: {breath_count}",          (30,110), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,255), 2)
    cv2.putText(canvas, f"BPM: {int(bpm)}",                  (30,170), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255,255,255), 3)
    cv2.putText(canvas, level_text,                          (30,270), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 3)

    # 파형 시각화
    wave_data = abs_data[::100]  # 100 샘플마다 1개만 표시 (48000 -> 480)
    for i, val in enumerate(wave_data[:150]):
        h = int(min(val * 300, 80))
        cv2.line(canvas, (i*4, 370), (i*4, 370-h), (0,255,100), 2)

    cv2.imshow("Stress Analyzer", canvas)

    if cv2.waitKey(1) & 0xFF == ord('q') or elapsed_time > 60:
        break

print(f"\n === 최종 결과 ===")
print(f"총 호흡: {breath_count}회 | 판정: {level_text}")
cv2.destroyAllWindows()
