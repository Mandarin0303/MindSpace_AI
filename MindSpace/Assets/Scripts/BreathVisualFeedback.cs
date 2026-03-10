using UnityEngine;
using UnityEngine.UI;
using System.Collections;
using TMPro;

public class BreathVisualFeedback : MonoBehaviour
{
    [Header("호흡 가이드 구체 (들숨/날숨 시각화)")]
    [Tooltip("씬에 배치된 구체 오브젝트. 들숨=커짐, 날숨=작아짐")]
    public Transform breathGuideSphere;
    public float minScale = 0.8f;
    public float maxScale = 1.4f;
    public float breathAnimSpeed = 2f;

    [Header("플레이어 앞 위치 추적")]
    [Tooltip("OVRCameraRing의 CenterEyeAnchor 연결 (비워두면 자동 탐색")]
    public Transform playerCamera;
    public float distanceFromPlayer = 1.5f;
    public float heightOffset = -0.2f;
    public float followSpeed = 5f;

    [Header("파티클 시스템")]
    public ParticleSystem ambientParticles;

    [Header("UI 알림")]
    public TextMeshProUGUI statusText;
    public TextMeshProUGUI rpmText;
    public Image confidenceBar;
    public TextMeshProUGUI StressLevelText;

    [Header("상태별 색상")]
    public Color colorLevel1 = new Color(0.38f, 0.65f, 0.98f);    // 파랑 - 매우 안정
    public Color colorLevel2 = new Color(0.29f, 0.86f, 0.50f);    // 초록 - 안정
    public Color colorLevel3 = new Color(0.98f, 0.80f, 0.08f);    // 노랑 - 보통
    public Color colorLevel4 = new Color(0.97f, 0.43f, 0.43f);    // 주황 - 높음
    public Color colorLevel5 = new Color(0.42f, 0.45f, 0.50f);   // 빨강 - 매우 높음
    public Color colorUnknown = new Color(0.42f, 0.45f, 0.50f);     // 회색 - 측정 중

    [Header("사운드")]
    public AudioSource inhaleSound;
    public AudioSource exhaleSound;

    // ----- 내부 상태 -----
    private BreathState _currentState;
    private bool _lastInhale;
    private float _targetScale;
    private Color _targetColor;
    private Coroutine _alertCoroutine;

    // ----- 초기화 -----
    private void Awake()
    {
        // 씬 이동해도 구체 유지
        DontDestroyOnLoad(gameObject);
    }
    private void Start()
    {
        //  BreathDetector 이벤트 구독
        if(BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.AddListener(OnBreathUpdated);
        }
        else
        {
            Debug.LogWarning("[BreathVisualFeedback] BreathDetector를 찾을 수 없습니다.");
        }

        _targetScale = minScale;
        _targetColor = colorUnknown;
        _currentState = null;

        // PlayerCamera 자동 탐색
        if(playerCamera == null)
        {
            var ovrRig = FindFirstObjectByType<OVRCameraRig>();
            if(ovrRig != null)
            {
                playerCamera = ovrRig.centerEyeAnchor;
            }
            else if (Camera.main != null)
            {
                playerCamera = Camera.main.transform;
            }
        }
    }

    private void OnDestroy()
    {
        if(BreathDetector.Current != null)
        {
            BreathDetector.Current.onBreathUpdate.RemoveListener(OnBreathUpdated);
        }
    }

    // ----- 호흡 상태 수신 ------
    private void OnBreathUpdated(BreathState state)
    {
        _currentState = state;

        // 상태별 색상 결정
        _targetColor = state.status switch
        {
            "Level1" => colorLevel1,        // 파랑 - 매우 안정
            "Level2" => colorLevel2,        // 초록 - 안정,정상
            "Level3" => colorLevel3,        // 노랑 - 보통,약간주의
            "Level4" => colorLevel4,      // 주황 - 높음
            "Level5" => colorLevel5,      // 빨강 - 매우높음
            _        => colorUnknown,   // 회색 - 측정중
        };

        // 들숨/날숨 목표 스케일
        _targetScale = state.inhale ? maxScale : minScale;

        // 들숨 날숨 전환 시 사운드 재생
        if(state.confidence > 0.3f && state.inhale != _lastInhale)
        {
            PlaySafe(state.inhale ? inhaleSound : exhaleSound);
            _lastInhale = state.inhale;
        }

        // UI 업데이트
        UpdateUI(state);

        // 경고 상황 처리
        if(state.status == "Level5")
        {
            TriggerAlert(state.status);
        }
    }

    // AudioSource가 null 이거나 Clip이 없으면 조용히 무시
    private void PlaySafe(AudioSource source)
    {
        if (source == null) return;
        if (source.clip == null) return;
        if (source.isPlaying) return;   // 이미 재생 중이면 중복 재생 방지
        source.Play();
    }

    // ----- 매 프레임 애니메이션 -----
    private void Update()
    {
        FollowPlayer();
        AnimateGuideSphere();
        AnimateParticles();
    }

    private void FollowPlayer()
    {
        if (playerCamera == null) return;

        Vector3 forward = playerCamera.forward;
        forward.y = 0;
        if (forward == Vector3.zero) return;
        forward.Normalize();

        Vector3 targetPos = playerCamera.position + forward * distanceFromPlayer + Vector3.up * heightOffset;

        transform.position = Vector3.Lerp(transform.position, targetPos, Time.deltaTime * followSpeed);
        transform.LookAt(playerCamera.position);
        transform.Rotate(0, 180, 0);
    }

    private void AnimateGuideSphere()
    {
        if (breathGuideSphere == null) return;

        float current = breathGuideSphere.localScale.x;
        float next = Mathf.Lerp(current, _targetScale, Time.deltaTime * breathAnimSpeed);
        breathGuideSphere.localScale = Vector3.one * next;

        // 색상도 MeshRenderer에 반영
        var renderer = breathGuideSphere.GetComponent<Renderer>();
        if(renderer != null)
        {
            Color currentColor = renderer.material.color;
            renderer.material.color = Color.Lerp(currentColor, _targetColor, Time.deltaTime * 3f);
        }
    }

    private void AnimateParticles()
    {
        if (ambientParticles == null) return;

        var main = ambientParticles.main;
        main.startColor = Color.Lerp(main.startColor.color, _targetColor, Time.deltaTime * 2f);

        // FAST 상태 : 파티클 속도 증가
        if(_currentState != null)
        {
            float speedMult = _currentState.status == "Level4" ? 2f : 1f;
            main.simulationSpeed = Mathf.Lerp(main.simulationSpeed, speedMult, Time.deltaTime);
        }
    }

    // ----- UI 업데이트 -----
    private void UpdateUI(BreathState state)
    {
        if(rpmText != null)
        {
            rpmText.text = state.rpm > 0 ? $"{state.rpm:F1}" : "-";
        }

        if(statusText != null)
        {
            statusText.text = state.status switch
            {
                "Level1" => "평온한 호흡",
                "Level2" => "깊은 명상 호흡",
                "Level3" => "정상 호흡",
                "Level4" => "빠른 호흡",
                "Level5" => "호흡 위험",
                _        => "측정 중..",
            };
            statusText.color = _targetColor;
        }
        if(confidenceBar  != null)
        {
            confidenceBar.fillAmount = state.confidence;
            confidenceBar.color = _targetColor;
        }
    }

    // ----- 경고 알림 ------
    private void TriggerAlert(string status)
    {
        if (_alertCoroutine != null) StopCoroutine(_alertCoroutine);
        _alertCoroutine = StartCoroutine(FlashAlert(status));
    }

    private IEnumerator FlashAlert(string status)
    {
        // 화면 가장자리를 경고 색으로 2회 깜빡임
        // 실제로는 Post Processing Vignette 등으로 구현 권장
        Debug.LogWarning($"[BreathAlert] {status} 감지!");

        // TODO: VR 환경에 맞는 경고 UI 추가
        // 예 : XR Rig 하위 Canvas에 Vignette 이미지 표시
        for (int i =0; i<2; i++)
        {
            // flashImage?.SetActive(true)l
            yield return new WaitForSeconds(0.3f);
            // flashImage?.SetActive(false);
            yield return new WaitForSeconds(0.3f);
        }

        _alertCoroutine = null;
    }
}