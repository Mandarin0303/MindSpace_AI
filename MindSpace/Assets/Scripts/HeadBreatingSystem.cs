using UnityEngine;
using System.Collections;
using TMPro;
using UnityEngineInternal;    // 안내 문구 표시용

public class HeadBreatingSystem : MonoBehaviour
{
    [Header("설정")]
    public float measureDuration = 15f;     //분석주기(30초)
    public float breathThreshold = 0.0005f;  // 호흡으로 인정할 최소 이동 쪽 (미세 조정 필요)
    public TextMeshProUGUI guideText;       // '이제 기기를 벗고 주무세요' 문구 UI

    [Header("상태변수")]
    private float measureTimer = 0f;
    private int breathCount = 0;
    private float lastY = 0f;
    private bool isRising = false;
    //private bool isStable = false;
    private bool isGuideShown = false;   // 안내가 이미 나갔는지 체크하는 변수

    private void Start()
    {
        lastY = Camera.main.transform.localPosition.y;
        if(guideText != null)
        {
            guideText.gameObject.SetActive(false);
            Debug.Log("HMD 센서 기반 호흡 측정 시작...");
        }
    }

    private void Update()
    {
        // 이미 안내가 나갔다면 더 이상 계산하지 않고 리턴
        if (isGuideShown) return;

        AnalyzeHMDMovement();

        measureTimer += Time.deltaTime;
        if(measureTimer >= measureDuration)
        {
            CheckStability();
        }
    }

    private void AnalyzeHMDMovement()
    {
        //if (Camera.main == null) return;

        // 고개의 상하 각도(X축 회전)을 가져온다.
        // 0~360도로 들어오므로 -180~180도로 변환하여 계산하기 쉽게 만든다.
        // 현재 HMD의 Y축(높낮이) 값 가져오기
        float currentY = Camera.main.transform.localPosition.y;
        float deltaY = currentY - lastY;

        // 상승/하강 반전 지점(Peak)을 찾아 호흡 카운트
        if(deltaY >breathThreshold && !isRising)
        {
            isRising = true;
            breathCount++;  // 들숨 시작 지점 감지
        }
        else if (deltaY < -breathThreshold && isRising)
        {
            isRising = false;
        }

        lastY = currentY;
    }

    private void CheckStability()
    {
        float rpm = breathCount * (60f / measureDuration);

        Debug.Log($"[15초 측정 종료] 호흡 수: {breathCount}회 -> 환산 RPM:{rpm}");

        // 기획서 종합 판정 로직 : RPM 10~15회는 Level 1 (매우 안정)
        if(rpm >= 10 && rpm <= 15)
        {
            ShowSleepGuide();
        }
        else
        {
            Debug.Log($"현재 RPM: {rpm} (안정화 대기 중...)");
            // 초기화 후 재측정
            measureTimer = 0f;
            breathCount = 0;
        }
    }

    private void ShowSleepGuide()
    {
        //isStable = true;
        isGuideShown = true;

        if(guideText != null)
        {
            guideText.gameObject.SetActive(true);
            guideText.text = "몸이 충분히 이완되었습니다. \n이제 기기를 벗고 편안하게 주무세요.";
        }
        Debug.Log("<color=yellow>이완 임계점 도달! 탈착 권고 가이드 실행</color>");
    }
}