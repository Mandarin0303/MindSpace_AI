using System;
using System.Collections;           // IEnmerator (코루틴에 필요)
using System.Text;                  // Encoding.UTF8 (바이트, 문자열 변환)
using System.Threading;             // CancellationToken(WebSocket 취소용)
using System.Threading.Tasks;       // Task(async/await)
using Unity.VisualScripting;
using UnityEngine;
using UnityEngine.Events;           // UnityEvent, Inspector에 이벤다 연결용

using SysWS = System.Net.WebSockets;        // ClientWebSocket <- Unity 6 내장

// Python 서버에서 JSON으로 받은 호흡 분석 결과를 담는 그릇.
// 호흡 상태 데이터 컨테이너
[Serializable]
public class BreathState
{
    public float rpm;              // 분당 호흡수
    public string status;          // Level 1~5
    public float confidence;       // 측정 신뢰도 0.0~1.0
    public bool inhale;            // true=들숨, false=날숨
    public float mic_rpm;          // 마이크 채널만으로 계산한 RPM
    public float imu_rpm;          // IMU 채널만으로 계산한 RPM
    public double timestamp;       // 서버 측 타임스탬프(Unix time)
}

// [이벤트클래스] Inspector에서 '호흡 상태가 바뀔 때 이 함수 호출해줘'라고 연결 해주는 커스텀 이벤트 타입.
[Serializable]
public class BreathUpdateEvent : UnityEvent<BreathState> { }


public class BreathDetector : MonoBehaviour
{
    // Inspector 설정
    [Header("서버 연결")]
    [Tooltip("Python FastAPI 서버 주소 (PC의 로컬 IP 입력")]
    public string serverUrl = "ws://192.168.0.23:8000/ws/breath";

    [Header("마이크 설정")]
    [Tooltip("Quest 2 내장 마이크 디바이스명 (비워두면 기본 마이크)")]
    public string micDeviceName = "";
    public int micSampleRate = 16000;   // 마이크 샘플링 주파수, Quest 2 내장 마이크 기본값 = 16000Hz
    public int micChunkSize = 1024;     // 한 번에 전송할 샘플 수, 청크사이즈

    [Header("IMU 전송 주파수")]
    [Range(10, 72)]
    public int imuSendHZ = 36;  // 초당 IMU 전송 횟수

    // 인스펙터에서 확인해보기.
    [Header("이벤트")]
    public BreathUpdateEvent onBreathUpdate;    // Inspector에서 연결 가능

    // 공개 프로퍼티 ( 다른 스크립트에서 접근 )
    public static BreathDetector Current { get; private set; }
    public BreathState LatestState { get; private set; } = new BreathState { status = "UNKNOWN" };
    public bool IsConnected => _ws != null && _ws.State == SysWS.WebSocketState.Open;

    //***[테스트후 주석삭제] 측정 완료시 true로 설정
    public static bool MeasureDone { get; set; } = false;

    // ------ 내부 변수 -------
    private SysWS.ClientWebSocket _ws;
    private CancellationTokenSource _cts;
    private AudioClip _micClip;
    private int _lastMicPos;
    private bool _micRunning;

    private float _imuTimer;
    private float _imuInterval;

    // ----- IMU 기반 들숨 보완 -----
    // 마이크는 날숨엔 강하지만 들숨은 소리가 거의 없어서 서버가 놓침
    private float _aySmooth = 0f;   // ay의 지수이동평균, 순간 잡음을 제거해 부드러운 추세만 추출
    private bool _imuInhale = false;    // IMU 신호 단독으로 판단한 현재 들숨 여부, aySmooth > +threshold면 들숨, < -threshold면 날숨
    private float _ayBaseline = 0f;     // 장시간 평균을 천천히 업데이트해서 헤드셋 기울기 오프셋 제거
    private const float AY_ALPHA = 0.15f;    // EMA 평할 계수, 0에 가까울수록 더 느리게/부드럽게 반응
    private const float AY_THRESHOLD = 0.008f;  // 들숨/날숨 판정 임계값, 너무 낮으면 잡음에 오반응, 너무 높으면 못잡음
    private const float BASELINE_ALPHA = 0.002f;    // 기준선 업데이트 속도

    // 수신 버퍼 : 서버에서 오는 JSON 최대 크기 (4096바이트면 충분)
    private readonly byte[] _recvBuffer = new byte[4096];

    // 메인 스레드 실행 큐 (WebSocket 콜백 -> Unity API 마샬링)
    private readonly System.Collections.Generic.Queue<Action> _mainThreadQueue
        = new System.Collections.Generic.Queue<Action>();


    // ------ Unity 생명 주기 -------
    private void Awake()
    {
        Current = this;
        _imuInterval = 1f / imuSendHZ;
        DontDestroyOnLoad(gameObject);
    }

    private void Start()
    {
        _cts = new CancellationTokenSource();
        StartCoroutine(ConnectLoop());
    }

    private void Update()
    {
        // 메인 스레드 큐 처리
        //  async 수신 콜백이 쌓아둔 작업들을 메인 스레드에서 꺼내 실행
        lock(_mainThreadQueue)
        {
            while (_mainThreadQueue.Count > 0)
            { _mainThreadQueue.Dequeue()?.Invoke(); }
        }

        if (!IsConnected) return;

        // IMU 전송
        _imuTimer += Time.deltaTime;
        if (_imuTimer >= _imuInterval)
        {
            _imuTimer = 0f;
            _ = SendIMUAsync();
        }

        // 마이크 청크 전송
        if (_micRunning) _ = SendMicChunkAsync();
    }

    private void OnDestroy()
    {
        StopMic();
        _cts?.Cancel();
        _cts?.Dispose();
        _ws?.Dispose();
    }

    // ------ WebSocket 연결 관리 ------
    private IEnumerator ConnectLoop()
    {
        // 연결 실패 / 끊김 시 5초 후 자동 재연결하는 무한 루프
        while (true)
        {
            var task = ConnectAsync();
            yield return new WaitUntil(() => task.IsCompleted);

            if(task.IsFaulted)
            {
                Debug.LogWarning($"[BreathDerector] 연결 실패: {task.Exception?.GetBaseException().Message}");
            }
            Debug.Log("[BreathDetector] 5초 후 재연결 시도...");
            yield return new WaitForSeconds(5f);
        }
    }

    ///
    private IEnumerator ConnectCoroutine()
    {
        // Task를 코로틴으로 래핑 : async/await Task를 유니티 코루틴에서 사용
        var task = ConnectAsync();

        // Task가 완료될 때까지 매 프레임 대기
        yield return new WaitUntil(() => task.IsCompleted);

        if(task.IsFaulted)
        {
            Debug.LogWarning($"[BreathDetector] 연결 실패: {task.Exception?.GetBaseException().Message}");
        }
    }

    private async Task ConnectAsync()
    {
        try
        {
            // 이전 WebSocket 객체 정리
            _ws?.Dispose();
            _ws = new SysWS.ClientWebSocket();

            Debug.Log($"[BreathDetector] 연결 시도: {serverUrl}");

            await _ws.ConnectAsync(new Uri(serverUrl), _cts.Token);

            Debug.Log("[BreathDetector] 서버 연결됨");
            StartMic();

            await ReceiveLoopAsync();
        }
        catch (OperationCanceledException)
        {
            Debug.Log("[BreathDetector] WebSocket 연결 취소됨(정상 종료)");
        }
        catch(Exception e)
        {
            Debug.LogWarning($"[BreathDetector] 연결 오류: {e.Message}");
            StopMic();
        }
    }

    // ----- 서버 메세지 수신 루프 ------
    
    private async Task ReceiveLoopAsync()
    {
        // 연결이 유지되는 동안 서버에서 오는 메시지를 계속 수신
        while (_ws.State == SysWS.WebSocketState.Open && !_cts.Token.IsCancellationRequested)
        {
            SysWS.WebSocketReceiveResult result;
            try
            {
                result = await _ws.ReceiveAsync(new ArraySegment<byte>(_recvBuffer), _cts.Token);
            }
            catch
            {
                break;
            }
            if(result.MessageType == SysWS.WebSocketMessageType.Close)
            {
                Debug.Log("[BreathDetector] 서버가 연결을 종료했습니다.");
                StopMic();
                break;
            }

            // 수신한 바이트를 JSON 문자열로 변환
            string json = Encoding.UTF8.GetString(_recvBuffer, 0, result.Count);

            lock(_mainThreadQueue)
            {
                _mainThreadQueue.Enqueue(() => ProcessMessage(json));
            }
        }
    }
    private void ProcessMessage(string json)
    {
        try
        {
            BreathState state = JsonUtility.FromJson<BreathState>(json);

            LatestState = state;
            onBreathUpdate?.Invoke(state);
            ApplyToVR(state);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[BreathDetector] JSON 파싱 오류: {e.Message}");
        }
    }

    private float _logTimer = 0f;   //로그 출력 간격 타이머
    private string _lastLoggedStatus = "";  // 이전에 출력한 상태(상태 바뀔 때만 출력)
    private bool _lastLoggedInhale = false; // 이전 들숨 여부 (바뀔 때 즉시 출력)

    // VR 반영( 자식 클래스에서 override해서 확장 가능)
    protected virtual void ApplyToVR(BreathState state)
    {
        // virtual = 자식 클래스에서 override 가능
        // BreathDetector를 상속받아 이 함수만 재정의하면 원하는 VR 반응 구현 가능

        //***[테스트후 주석삭제] 측정 완료 후에는 로그 출력 중단
        if (MeasureDone) return;

        // ----- IMU 보정 ------
        // inhale=false인데 클라이언트 IMU가 들숨으로 판단하면 덮어씀
        // 조건: 신뢰도가 낮을 때(0.5미만)만 보정 -> 신뢰도 높은 서버 판단은 그대로 존중
        bool correctedInhale = state.inhale;
        bool imuCorrected = false;
        if(state.confidence <0.5f && state.inhale != _imuInhale)
        {
            correctedInhale = _imuInhale;
            imuCorrected = true;
        }

        // 로그 출력 조건 : 에디터/빌드 구분 없이 항상 동작
        // 에디터에서만 찍히던 기존 구조 제거 -> Quest 빌드 adb logcat으로도 확인 가능
        _logTimer += Time.deltaTime;

        bool statusChanged = state.status != _lastLoggedStatus;
        bool inhaleChanged = correctedInhale != _lastLoggedInhale;

        // 상태, 들숨 변화가 생겼거나 2초마다 주기 로그
        if(statusChanged || inhaleChanged || _logTimer >= 2f)
        {
            string inhaleTag = correctedInhale ? "들숨" : "날숨";
            string correctTag = imuCorrected ? "[IMU보정]" : "";
            string ayTag = $"ay={_aySmooth:F4}";
            // _aySmooth: 양수면 헤드셋이 올라가는 중(들숨 신호), 음수면 내려가는 중(날숨 신호)

            Debug.Log(
                $"[Breah] {state.status} | {state.rpm:F1} RPM |"
                + $"conf:{state.confidence:F2} | {inhaleTag}{correctTag} |"
                + $"mic_rpm:{state.mic_rpm:F1} | imu_rpm{state.imu_rpm:F1} | {ayTag}");

            _logTimer = 0f;
            _lastLoggedStatus = state.status;
            _lastLoggedInhale = correctedInhale;
       
        }
        // 예시 : 콘솔 출력
        // 실제로는 파티클, 사운드, UI 등에 연결
        //if (Application.isEditor)
        //{
        //    Debug.Log($"[Breath] {state.status} | {state.rpm:F1} RPM |" + $"conf:{state.confidence:F2} | {(state.inhale ? "들숨" : "날숨")}");
        //}
    }

    // ----- 마이크 처리 -----
    private void StartMic()
    {
        if (_micRunning) return;
        

        // Quest 2 마이크 디바이스 확인
        if (Microphone.devices.Length == 0)
        {
            Debug.LogWarning("[BreathDetector] 마이크를 찾을 수 없습니다.");
            return;
        }

        string device = string.IsNullOrEmpty(micDeviceName)
            ? Microphone.devices[0]
            : micDeviceName;


        // 10초짜리 루프 버퍼로 녹음
        _micClip = Microphone.Start(device, true, 10, micSampleRate);
        _lastMicPos = 0;
        _micRunning = true;

        Debug.Log($"[BreathDetector] 마이크 시작: {device}");
    }

    private void StopMic()
    {
        if (!_micRunning) return;
        Microphone.End(micDeviceName);
        _micRunning = false;
    }

    private async Task SendMicChunkAsync()
    {
        int currentPos = Microphone.GetPosition(micDeviceName);
        if (currentPos < 0 || _micClip == null) return;

        // 새로 들어온 샘플 수 계산
        int available = currentPos >= _lastMicPos
            ? currentPos - _lastMicPos
            : _micClip.samples - _lastMicPos + currentPos;

        if (available < micChunkSize) return;

        // 샘플 추출
        float[] samples = new float[micChunkSize];
        _micClip.GetData(samples, _lastMicPos % _micClip.samples);
        _lastMicPos = (_lastMicPos + micChunkSize) % _micClip.samples;

        // JSON으로 직력화해서 전송
        string json = JsonUtility.ToJson(new MicMessage { type ="audio", samples = samples});
        await SendTextAsync(json);
    }

    // IMU 전송
    private async Task SendIMUAsync()
    {
        // Quest 2: InputTracking으로 HMD 속도 가져오기
        // OVR SDK 사용 시 : OVRPlugin.GetNodeVelocity(OVRPlugin.Node.Head, ...)
        Vector3 velocity = GetHMDVelocity();

        float rawAy = velocity.y;

        // 기준선 업데이트 : 현재 ay의 극히 느린 이동평균 -> 자세 드리프트 흡수
        _ayBaseline += BASELINE_ALPHA * (rawAy - _ayBaseline);
        // 기준선 제거 후 EMA 평활: 잡음제거, 호흡 주기 신호만 남김
        float correctedAy = rawAy - _ayBaseline;
        _aySmooth += AY_ALPHA * (correctedAy - _aySmooth);
        // 임계값 비교로 들숨/날숨 판정, 임계값 미만의 애매한 구간에서는 이전 상태 유지(히스테리스 효과)
        if (_aySmooth > AY_THRESHOLD) _imuInhale = true;    // 흉곽 올라옴, 들숨
        else if (_aySmooth < -AY_THRESHOLD) _imuInhale = false; // 흉곽 내려감, 날숨

        string json = JsonUtility.ToJson(new IMUMessage
        {
            type = "imu",
            ax=velocity.x,
            ay=velocity.y,  // 수직 방향 속도, 호흡 감지 핵심 신호
            az=velocity.z,
            ay_smooth = _aySmooth,  //평활된 ay(서버 디버그용)
            imu_inhale = _imuInhale,// 클라이언트 판단 들숨 여부
        });

        await SendTextAsync(json);

    }

    private Vector3 GetHMDVelocity()
    {
        // OVR SDK 방식 (Meta XR SDK 설치 시)
        // var state = OVRPlugin.SetNodeStateProperties(OVRPlugin.Node.Head);
        // return new Vector3(state.Velocity.x, state.Velocity.y, state.Velocity.z);

        // Unity XR 방식(기본)
        // XR Input Subsystem에서 선속도 읽기
        var devices = new System.Collections.Generic.List<UnityEngine.XR.InputDevice>();
        UnityEngine.XR.InputDevices.GetDevicesWithCharacteristics(
            UnityEngine.XR.InputDeviceCharacteristics.HeadMounted, devices);

        if (devices.Count > 0)
        {
            Vector3 vel;
            if (devices[0].TryGetFeatureValue(UnityEngine.XR.CommonUsages.deviceVelocity, out vel))
            {
                return vel;
            }
        }

        // 폴백: 프레임 간 위치 사이로 추정
        return Vector3.zero;
    }
    // ------ WebSocket 전송 헬퍼 -----
    private async Task SendTextAsync(string text)
    {
        if (!IsConnected) return;

        try
        {
            byte[] bytes = Encoding.UTF8.GetBytes(text);

            await _ws.SendAsync(new ArraySegment<byte>(bytes),
                SysWS.WebSocketMessageType.Text,
                true,
                _cts.Token);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[BreathDetector] 전송 오류: {e.Message}");
        }
    }

    // ----- 전송 메시지 구조체 ------
    [Serializable]
    private class MicMessage
    {
        public string type;
        public float[] samples;
    }

    [Serializable]
    private class IMUMessage
    {
        public string type;
        public float ax, ay, az;
        public float ay_smooth;
        public bool imu_inhale;
    }
}

// UnityMainThread - async 콜백 -> 메인 스레드 마샬링 헬퍼
// WebSocket 콜백은 백그라운드 스레드에서 오므로 Unity API 호출을 메인 스레드로 마샬링
public class UnityMainThread : MonoBehaviour
{
    private static UnityMainThread _instance;

    private static readonly System.Collections.Generic.Queue<Action> _queue
        = new System.Collections.Generic.Queue<Action>();

    public static void Run(Action action)
    {
        lock (_queue) { _queue.Enqueue(action); }
        EnsureExists();
    }

    static void EnsureExists()
    {
        if (_instance != null) return;
        var go = new GameObject("UnityMainThread");
        DontDestroyOnLoad(go);
        _instance = go.AddComponent<UnityMainThread>();
    }

    void Update()
    {
        lock (_queue)
        {
            while (_queue.Count > 0)
                _queue.Dequeue()?.Invoke();
        }
    }
}


