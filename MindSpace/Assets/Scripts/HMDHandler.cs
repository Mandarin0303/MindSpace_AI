using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections;   // 코루틴을 위해 필요
using Firebase;
using Firebase.Database;
using Firebase.Extensions;

public class HMDHandler : MonoBehaviour
{
    [Header("사운드")]
    [Tooltip("VR기기 탈착 안내 음성")]
    public AudioSource guideAudio;  // 유니티 에디터에서 음성 파일 연결용

    [Header("Scene Ambience")]
    public SceneAmbience ambienceManager;

    [Header("이완 판정 설정")]
    [Tooltip("이완으로 판정할 호흡 레벨(이 값 이하면 이완 상태)")]
    public int relaxedLevelThreshold = 2;   // Level 1~2 일때 이완 상태

    [Tooltip("이완 상태가 이 시간(초) 이상 지속되면 안내 음성 재생")]
    public float relaxedHoldDuration = 30f;

    [Tooltip("탈착으로 판정할 userPresent == false 유지 시간(초)")]
    public float unmountHoldDuration = 5f;

    [Tooltip("안내 음성 재생 후 탈착 대기 최대 시간(초). 초과 시 자동으로 탈찰 처리")]
    public float waitForRemovalTimeout = 120f;

    // ----- 내부 변수 -----
    private DatabaseReference _dbRef;  // Firebase 변수 추가
    private bool _firebaseReady = false;

    // 이완 판정
    private float _relaxedTimer = 0.0f; // 이완 상태 지속 타이머
    private bool _guideTriggered = false;    // 안내 음성 재생 여부(중복방지)

    // 탈찰 판정
    private float _unmountTimer = 0f;
    private bool _isTransitioned = false;    // 수면 모드로 전환됐는지

    // 상태 머신
    // IDLE-> RELAXED_WAIT-> GUIDE_PLAYING-> WAIT_REMOVAL-> SLEEP_MODE
    private enum State { Idle, RelaxedWait, GuidePlaying, WaitRemoval, SleepMode }
    private State _state = State.Idle;

    private void Awake()
    {
        DontDestroyOnLoad(gameObject);
        SceneManager.sceneLoaded += OnSceneLoaded;
    }
    // 씬 전환 시 새 씬의 SceneAmbience 자동 탐색
    private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
    {
        // Firebase 준비됐을 때만 씬 이름 전송
        if(_firebaseReady)
        {
            SetFirebase("status/currentScene", scene.name);
        }

        Debug.Log($"[HMDHandler] 씬 전환 감지: {scene.name}");

        var found = FindFirstObjectByType<SceneAmbience>();
        if (found != null)
        {
            ambienceManager = found;
            Debug.Log($"[HMDHandler] SceneAmbiece 자동 연결 : {scene.name}");
        }
        else
        {
            Debug.LogWarning($"[HMDHandler] SceneAmbience 없음: {scene.name}");
        }
    }
    private void Start()
    {
        // 초기화 시작 로그
        Debug.Log("Firebase 초기화 시도중...");

        InitFirebase();

        // BreathDetector 이벤트 구독 추가
        if (BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.AddListener(OnBreathUpdated);
        }
        else
        {
            Debug.LogWarning("[HMDHandler] BreathDetector를 찾을 수 없습니다.");
        }

    }
    private void OnDestroy()
    {
        SceneManager.sceneLoaded -= OnSceneLoaded;
        if (BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.RemoveListener(OnBreathUpdated);
        }
    }
    private void Update()
    {
        // 디버그용 - 나중에 지우기****
        if (_state == State.RelaxedWait)
        {
            Debug.Log($"[HMDHandler] 이완 타이머: {_relaxedTimer:F1}초/{relaxedHoldDuration}초");
        }

        switch (_state)
        {
            case State.RelaxedWait:
                // 타이머를 Update에서 증가 (이벤트 빈도 아닌 실제 시간 기준)
                _relaxedTimer += Time.deltaTime;
                if (_relaxedTimer >= relaxedHoldDuration && !_guideTriggered)
                {
                    _guideTriggered = true;
                    StartCoroutine(PlayGuideAndWait());
                }
                break;

            case State.WaitRemoval:
                if (!OVRPlugin.userPresent)
                {
                    _unmountTimer += Time.deltaTime;
                    if (_unmountTimer >= unmountHoldDuration)
                    {
                        EnterSleepMode();
                    }
                }
                else
                {
                    _unmountTimer = 0f;
                }
                break;

            case State.SleepMode:
                if (OVRPlugin.userPresent && _isTransitioned)
                {
                    OnResumed();
                }
                break;
        }
    }

    // OVRManager가 살아있는지 + 유저가 없는지 동시에 체크
    // 에디터 테스트 시에는 센서가 민감하므로 조건을 더 추가한다.
    // OVRPlugin.userPresent: HMD를 쓰고 있으면 true, 벗으면 false
    //bool isUserAbsent = !OVRPlugin.userPresent;

    // ----- Firebase 초기화 -----
    private void InitFirebase()
    {
        Debug.Log("[HMDHandler] Firebase 초기화 시도...");
        FirebaseApp.CheckAndFixDependenciesAsync().ContinueWithOnMainThread(task =>
        {
            if (task.Result != DependencyStatus.Available)
            {
                Debug.LogError($"[HMDHandler] Firebase 초기화 실패: {task.Result}");
                return;
            }

            FirebaseApp app;
            try
            {
                app = FirebaseApp.Create(new AppOptions { DatabaseUrl = new System.Uri("https://mindspace-vr-default-rtdb.firebaseio.com/") },
                "mindspace-app"
                );
            }
            catch (System.Exception)
            {
                app = FirebaseApp.GetInstance("mindspace-app");
                Debug.Log("[HMDHandler] 기존 Firebase 앱 인스턴스 재사용");
            }

            _dbRef = FirebaseDatabase.GetInstance(app).RootReference;
            _firebaseReady = true;

            // VR 착용 상태 초기화
            SetFirebase("status/isWearing", true);
            SetFirebase("status/sleepMusicStart", false);
            SetFirebase("status/bgmUrl", ""); // 이전 세션 BGM URL 초기화
            Debug.Log("[HMDHandler] Firebase 연결 성공!");
        });
    }

    // ----- 호흡 상태 수신 -> 이완 판정
    private void OnBreathUpdated(BreathState state)
    {
        // 이완 판정은 Idle 또는 RelaxedWait 상태일 때만
        if (_state != State.Idle && _state != State.RelaxedWait) return;

        // Level 파싱 : "Level1" -> 1
        int level = ParseLevel(state.status);
        bool isRelaxed = level > 0 && level <= relaxedLevelThreshold && state.confidence >= 0.2f;

        if ((isRelaxed))
        {
            // 상태만 변경, 타이머는 Update에서 증가
            _state = State.RelaxedWait;
        }
        else
        {
            // 이완 상태 끊기면 타이머 리셋
            _relaxedTimer = 0f;
            if (_state == State.RelaxedWait)
            {
                _state = State.Idle;
            }
        }
    }
    // 안내 음성 재생 -> 탈착 대기 코루틴
    private IEnumerator PlayGuideAndWait()
    {
        _state = State.GuidePlaying;
        Debug.Log("[HMDHandler] 이완 임계점 도달 -> 안내 음성 재생");

        // BGM 페이드 아웃 (음성이 잘 들리도록)
        if (ambienceManager != null)
        {
            ambienceManager.StartFadeOutBGM(3f);
        }

        yield return new WaitForSeconds(1.5f);  // BGM 살짝 줄어든 뒤 음성 시작

        if (guideAudio != null)
        {
            guideAudio.Play();
            Debug.Log("[HMDHandler] 안내 음성 재생 중...");

            // 음성이 끝날 때까지 대기
            yield return new WaitUntil(() => !guideAudio.isPlaying);
        }
        else
        {
            Debug.LogWarning("[HMDHandler] guideAudio가 연결되지 않았습니다.");
            yield return new WaitForSeconds(5f);    // guideAudio 없으면 5초 대기
        }

        Debug.Log("[HMHandler] 안내 음성 완료 -> 탈착 대기 시작");
        _state = State.WaitRemoval;
        _unmountTimer = 0f;

        // 탈착 없이 너무 오래 지나면 자동 처리
        StartCoroutine(RemovalTimeout());
    }

    private IEnumerator RemovalTimeout()
    {
        yield return new WaitForSeconds(waitForRemovalTimeout);
        if (_state == State.WaitRemoval)
        {
            Debug.Log("[HMDHandler] 탈착 대기 타임아웃 -> 자동 수면 모드 전환");
            EnterSleepMode();
        }
    }
    // 수면 모드 진입(탈착 확정)
    private void EnterSleepMode()
    {
        if (_state == State.SleepMode) return;  // 중복 방지
        _state = State.SleepMode;
        _isTransitioned = true;
        _unmountTimer = 0f;

        Debug.Log("[HMDHandler] 탈착 확정 -> 수면 모드 진입");

        // Firebase : 착용 해제 + 수면 음악 시작 신호
        // 모바일 PWA가 sleepMusicStart = true를 감지하면 수면 음악을 재생함
        SetFirebase("status/isWearing", false);
        SetFirebase("status/sleepMusicStart", true);
        SetFirebase("status/sleepStartTime", System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        // 현재 씬 BGM을 모바일로 전달 (VR 음악이 모바일에서 이어서 재생됨)
        // bgmClip 이름이 모바일 /public/souns/폴더의 파일명과 일치해야 함
        if (ambienceManager != null && ambienceManager.bgmClip != null)
        {
            string bgmUrl = $"/sounds/{ambienceManager.bgmClip.name}.mp3";
            SetFirebase("status/bgmUrl", bgmUrl);
            Debug.Log($"[HMDHandler] VR BGM 모바일 전달: {bgmUrl}");
        }
        else
        {
            Debug.LogWarning("[HMDHandler] ambienceManager 또는 bgmClip 없음 -> bgmUrl 전송 불가");
        }
        Debug.Log("[HMDHandler] Firebase 신호 전송 완료 -> 모바일 수면 음악 시작 대기");
    
        // 호흡 측정 종료 (VR 탈착 후 더 이상 불필요)
        if(BreathDetector.Current != null)
        {
            BreathDetector.Current.StopAll();
        }
    
    }
    // 재착용 복구
    private void OnResumed()
    {
        _isTransitioned = false;
        _state = State.Idle;
        _relaxedTimer = 0f;
        _guideTriggered = false;
        _unmountTimer = 0f;

        SetFirebase("status/isWearing", true);
        SetFirebase("status/sleepMusicStart", false);

        // BGM 재개
        if (ambienceManager != null)
        {
            ambienceManager.StartFadeInBGM(2f);
        }
        Debug.Log("[HMDHandler] 기기 재착용 감지 -> 정상 모드 복구");
    }

    // Firebase 헬퍼
    private void SetFirebase(string path, object value)
    {
        if (!_firebaseReady || _dbRef == null)
        {
            Debug.LogWarning($"[HMDHandler] Firebase 미준비 상태에서 쓰기 시도: {path}");
            return;
        }
        _dbRef.Child(path).SetValueAsync(value).ContinueWithOnMainThread(task =>
        {
            if (task.IsCompleted)
            {
                Debug.Log($"[HMDHandler] Firebase 쓰기 성공: {path} = {value}");
            }
            else
            {
                Debug.LogError($"[HMDHandler] Firebase 쓰기 실패 : {path} | {task.Exception}");
            }
        });
    }
    // 헬퍼
    private int ParseLevel(string status)
    {
        switch (status)
        {
            case "Level1": return 1;
            case "Level2": return 2;
            case "Level3": return 3;
            case "Level4": return 4;
            case "Level5": return 5;
            default: return -1;     // UNKNOWN 등
        }
    }

}