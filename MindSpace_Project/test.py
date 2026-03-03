import sounddevice as sd
import numpy as np
from scipy.signal import butter, lfilter

sd.default.device = 3   #vr 마이크
FS = 48000
#CHANNELS = 1    #VR 마이크는 1채널

def bandpass_filter(data, lowcut, highcut, fs):
    nyq = fs / 2
    b,a = butter(2, [lowcut/nyq, highcut/nyq], btype='band')
    return lfilter(b, a, data)

print("=== 5초간 가만히 있어봐 ===")
rec = sd.rec(int(5*FS), samplerate=FS, channels=1, dtype='float32')
sd.wait()
audio = rec.flatten()
#audio= np.clip(audio*100, -1.0, 1.0) # 100배 증폭
filtered = bandpass_filter(audio, 100, 1000, FS)
print(f"가만히: max={np.max(np.abs(filtered)):.4f}, mean={np.mean(np.abs(filtered)):.4f}")

print("=== 5초간 후~ 불어봐 ===")
rec = sd.rec(int(5*FS), samplerate=FS, channels=1, dtype='float32')
sd.wait()
audio = rec.flatten()
#audio = np.clip(audio*100, -1.0, 1.0) # 100배 증폭
filtered = bandpass_filter(audio, 100, 1000, FS)
print(f"후~ 불때: max={np.max(np.abs(filtered)):.4f}, mean={np.mean(np.abs(filtered)):.4f}")