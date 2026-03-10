using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using JetBrains.Annotations;

public class BreathStressSeceneController : MonoBehaviour
{
    [Header("측정 설정")]
    public float measureDuration = 10f;
    public float minConfidence = 0.2f;

    [Header("씬 전환 딜레이")]
    public float resultShowDuration = 3f;

    [Header("UI - 확인 팝업(측정 시작 전")]
    public GameObject confirmPanel;     // "측정을 시작하시겠습니까?" 패널
    public Button confirmBtn;           // 확인 버튼
    public TextMeshProUGUI confirmText; // 팝업 안내 텍스트

    [Header("UI - 측정중")]
    public GameObject measurePanel;     // 측정 중 패널 (타이머 + 상태)
    public TextMeshProUGUI measureTimerText;
    public TextMeshProUGUI statusText;

    [Header("UI - 결과")]
    public BreathResultUI breathResultUI;   // 결과 패널

    [Header("구체 피드백")]
    public BreathVisualFeedback breathVisualFeedback;   // 측정 중에만 활성화

    // ----- 내부 변수 -----
    private float _measureTimer = 0f;
    private float _rpmAccumulator = 0f;
    private int _rpmSampleCount = 0;
    private bool _isMeasuring = false;
    private bool _isDone = false;
    private bool _confirmed = false;    // 확인 버튼 눌렀는지

    private void Start()
    {
        //BreathDetector 이벤트 구독
        if (BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.AddListener(OnBreathUpdated);
            Debug.Log("[BreathStresssCtrl] BreathDetector 이벤트 구독 완료");
        }
        else
        {
            Debug.LogError("[BreathStressCtrl] BreathDetector를 찾을수 없습니다.");
            return;
        }

        // StressLevelSceneMgr 확인
        if (StressLevelSceneMgr.Instance == null)
        {
            Debug.LogError("[BreathStressCtrl] StressLevelSceneMgr를 찾을 수 없습니다.");
        }

        // 구체 비활성화 (측정 전에 숨김)
        if (breathVisualFeedback != null)
        {
            breathVisualFeedback.gameObject.SetActive(false);
        }

        // 확인 버튼 클릭 이벤트 연결
        if (confirmBtn != null)
        {
            confirmBtn.onClick.AddListener(OnConfirmClicked);
        }

        // 처음엔 확인 팝업만 보이게
        ShowConfirmPanel();

        // 서버 연결 대기는 백그라운드에서 미리 시작
        StartCoroutine(WaitForConnection());
    }
    private void OnDestroy()
    {
        // 이벤트 구독 해제(메모리 누수 방지)
        if (BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.RemoveListener(OnBreathUpdated);
        }
        if (confirmBtn != null)
        {
            confirmBtn.onClick.RemoveListener(OnConfirmClicked);
        }
    }
    private void Update()
    {
        if (!_isMeasuring || _isDone) return;

        // ----- 측정 타이머 -----
        _measureTimer += Time.deltaTime;

        // 남은 시간 UI 업데이트
        float remaining = measureDuration - _measureTimer;
        if (measureTimerText != null)
        {
            measureTimerText.text = $"측정 중...{remaining:F0}초";
        }

        // ----- 측정 완료 체크 -----
        if (_measureTimer >= measureDuration)
        {
            FinishMeasurement();
        }
    }

    // ----- UI 패널 전환 -----
    private void ShowConfirmPanel()
    {
        if (confirmPanel != null)
        {
            confirmPanel.SetActive(true);
        }
        if (measurePanel != null)
        {
            measurePanel.SetActive(false);
        }
    }

    private void ShowMeasurePanel()
    {
        if (confirmPanel != null)
        {
            confirmPanel.SetActive(false);
        }
        if (measurePanel != null)
        {
            measurePanel.SetActive(true);
        }
    }

    // ----- 확인 버튼 클릭 -----
    public void OnConfirmClicked()
    {
        if (_confirmed) return;
        _confirmed = true;
        Debug.Log("[BreathStressCtrl] 확인 버튼 클릭 -> 측정 시작 대기");
        ShowMeasurePanel();

        // 구체 활성화
        if (breathVisualFeedback != null)
        {
            breathVisualFeedback.gameObject.SetActive(true);
        }

        // 서버 연결이 이미 됐으면 바로 시작, 아직이면 대기
        if (BreathDetector.Current != null && BreathDetector.Current.IsConnected)
        {
            StartCoroutine(StartMeasureAfterDelay());
        }
        else
        {
            UpdateStatusText("서버 연결 대기 중...");
            // WaitForConnection 코루틴이 연결 완료 후 자동으로 시작해줌.
        }
    }

    // ----- 서버 연결 대기 (백그라운드) -----
    private IEnumerator WaitForConnection()
    {
        // 서버에 연결될 때까지 대기 (최대 30초)
        float timeout = 30f;
        while (timeout > 0)
        {
            // BreathDetector가 연결됐으면 루프 탈출
            if (BreathDetector.Current != null && BreathDetector.Current.IsConnected)
            {
                break;
            }
            timeout -= Time.deltaTime;
            if (!_confirmed && confirmText != null)
            {
                confirmText.text = $"서버 연결 중...({timeout:F0}초)\n측정을 시작하시겠습니까?";
            }
            yield return null;
        }
        if (BreathDetector.Current == null || !BreathDetector.Current.IsConnected)
        {
            UpdateStatusText("서버 연결 실패! Python 서버를 확인해 주세요.");
            if (confirmText != null)
            {
                confirmText.text = "서버 연결 실패!\nPython 서버를 확인해주세요.";
            }
            Debug.LogError("[BreathStressCtrl] 서버 연결 타임아웃!");
            yield break;
        }

        // 연결 완료
        Debug.Log("[BreathStressCtrl] 서버 연결 완료!");
        if (!_confirmed && confirmText != null)
        {
            confirmText.text = "서버 연결 완료!\n측정을 시작하시곘습니까?";
        }
        if (_confirmed)
        {
            StartCoroutine(StartMeasureAfterDelay());
        }

    }
    private IEnumerator StartMeasureAfterDelay()
    {
        // 서버 연결 안됐으면 대기
        while (!BreathDetector.Current.IsConnected)
        {
            yield return null;
        }

        UpdateStatusText("잠시 후 측정을 시작합니다...");
        yield return new WaitForSeconds(3f);    // 데이터 안정화 3초

        _isMeasuring = true;
        _measureTimer = 0f;
        _rpmAccumulator = 0f;
        _rpmSampleCount = 0;

        Debug.Log($"[BreathStressCtrl] 측정 시작! ({measureDuration}초");
        UpdateStatusText($"호흡을 자연스럽게 쉬어주세요...({measureDuration:F0}초");
    }

    // ----- 호흡 데이터 수신(BreathDetector 이벤트 콜백) -----
    private void OnBreathUpdated(BreathState state)
    {
        // 측정 중이 아니면 무시
        if (!_isMeasuring || _isDone) return;

        // 신뢰도가 충분한 데이터만 수집
        if (state.confidence >= minConfidence && state.rpm > 0)
        {
            // RPM 값을 누적( 나중에 평균 계산 )
            _rpmAccumulator += state.rpm;
            // 샘플 수 증가
            _rpmSampleCount++;
        }
    }

    // ----- 측정 완료 -> 레벨 판정 -> 씬 전환
    private void FinishMeasurement()
    {
        _isMeasuring = false;
        _isDone = true; // 중복 실행 방지

        // 구체 비활성화 (결과창 보여줄 때 숨김)
        if (breathVisualFeedback != null)
        {
            breathVisualFeedback.gameObject.SetActive(false);
        }

        if (_rpmSampleCount == 0)
        {
            // 유효한 샘플이 하나도 없으면 (서버 응답 없음)
            Debug.LogWarning("[BreathStressCtrl] 유효한 호흡 데이터가 없습니다. 기본값(Level 3)으로 처리");
            StartCoroutine(TransitionToScene(3));
            return;
        }

        // ----- 평균 RPM 계산 -----
        float averageRpm = _rpmAccumulator / _rpmSampleCount;   // 측정 시간 동안 수집한  RPM의 평균값

        // ----- 스트레스 레벨 판정 -----
        int stressLevel = CalculateStressLevel(averageRpm);
        string desc = GetStressDescription(stressLevel);

        // ----- 결과 로그 -----
        Debug.Log("========== 호흡 측정 결과 ==========");
        Debug.Log($"평균 RPM     : {averageRpm:F1} 회/분");
        Debug.Log($"샘플 수      : {_rpmSampleCount}개");
        Debug.Log($"스트레스 레벨 : Level{stressLevel}");
        Debug.Log($"상태         : {desc}");
        Debug.Log("===================================");

        // ----- UI 결과 표시 -----
        if (breathResultUI != null)
        {
            breathResultUI.ShowResult(averageRpm, stressLevel, desc);
        }

        UpdateStatusText($"Level {stressLevel} - {desc}");

        if (measureTimerText != null)
        {
            measureTimerText.text = "측정완료!";
        }

        // ----- 씬 전환 (resultShowDuration 초 후) -----
        StartCoroutine(TransitionToScene(stressLevel));
    }

    private IEnumerator TransitionToScene(int stressLevel)
    {
        yield return new WaitForSeconds(resultShowDuration);    // 결과 UI를 잠깐 보여준 후 씬 전환

        if (StressLevelSceneMgr.Instance != null)
        {
            StressLevelSceneMgr.Instance.MoveToSceneByStressLevel(stressLevel);
        }
        else
        {
            Debug.LogError("[BreathStressCtrl] StressLevelSceneMgr 없음! 씬 전환 실패");
        }
    }

    // ----- 스트레스 레벨 판정, 헬퍼 -----
    private int CalculateStressLevel(float rpm)
    {
        if (rpm >= 12 && rpm <= 15) return 1;
        else if (rpm >= 16 && rpm <= 18) return 2;
        else if (rpm >= 19 && rpm <= 22) return 3;
        else if (rpm >= 23 && rpm <= 26) return 4;
        else if (rpm >= 27) return 5;
        else return 3;  // 기준 밖 보통으로 처리.
    }

    private string GetStressDescription(int level)
    {
        switch (level)
        {
            case 1: return "매우 안정된 상태";
            case 2: return "안정된 상태";
            case 3: return "보통 상태";
            case 4: return "스트레스가 높은 상태";
            case 5: return "매우 높은 스트레스";
            default: return "측정 중...";
        }
    }

    // ----- UI 헬퍼 -----
    private void UpdateStatusText(string message)
    {
        if (statusText != null)
        {
            statusText.text = message;
        }
    }

}