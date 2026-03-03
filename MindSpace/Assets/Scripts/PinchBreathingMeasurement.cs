using System.Collections;
using UnityEditor;
using UnityEngine;
using UnityEngine.InputSystem;

public class PinchBreathingMeasurement : MonoBehaviour
{
    [Header("Input Actions")]
    public InputActionReference leftSelectAction;   // Left Hand Select Input
    public InputActionReference rightSelectAction;  // Right Hand Select Input

    [Header("설정")]
    public float measureDuration = 60f;

    [Header("연출 연결")]
    public BreathingUI breathingUI;
    public SceneAmbience environmentController;

    private bool isPinching = false;
    private bool isMeasuring = false;
    private int breathCount = 0;
    private float measureTimer = 0f;
    private bool isInhale = false;

    private void OnEnable()
    {
        leftSelectAction.action.Enable();
    }

    private void OnDisable()
    {
        leftSelectAction.action.Disable();
    }

    private void Update()
    {
        bool currentPinch = leftSelectAction.action.IsPressed();

        // Pinch 시작 순간만 감지.
        if (currentPinch && !isPinching)
        {
            OnPinchStart();
        }

        isPinching = currentPinch;

        if (isMeasuring)
        {
            measureTimer += Time.deltaTime;
            if(measureTimer >= measureDuration)
            {
                FinishMeasurement();
            }
        }
    }

    private void OnPinchStart()
    {
        if(!isInhale)
        {
            // 들숨
            isInhale = true;
            breathCount++;
            Debug.Log($"[들숨] {breathCount}회");

            if(!isMeasuring)
            {
                isMeasuring = true;
                measureTimer = 0f;
                Debug.Log("측정 시작");
            }
        }
        else
        {
            // 날숨
            isInhale = false;
            Debug.Log("[날숨]");
        }
    }

    private void FinishMeasurement()
    {
        isMeasuring = false;
        float rpm = breathCount;
        int stressLevel = CalculateStressLevel(rpm);
        string desc = GetStressDescription(stressLevel);

        Debug.Log("===== 측정 결과 =====");
        Debug.Log($"RPM: {rpm} 회/분");
        Debug.Log($"스트레스 레벨: {stressLevel} / 5");
        Debug.Log($"상태: {GetStressDescription(stressLevel)}");
        Debug.Log("================");

        // UI 표시
        breathingUI.ShowResult(rpm, stressLevel, desc);

        // 씬 이동!, null 체크 추가. ===> 바로 씬이동.
        //if (StressLevelSceneMgr.Instance != null)
        //{
        //    StressLevelSceneMgr.Instance.MoveToSceneByStressLevel(stressLevel);
        //}
        //else
        //{
        //    Debug.LogError("StressSceneManager가 씬이 없어요! GameObject에 추가해주세요.");
        //}

        // 3초 후 씬 이동
        //StartCoroutine(MoveSceneAfterDelay(stressLevel, 5f));

        breathCount = 0;
        isInhale = false;
    }

    private int CalculateStressLevel(float rpm)
    {
        if (rpm <= 10) return 1;
        else if (rpm <= 14) return 2;
        else if (rpm <= 18) return 3;
        else if (rpm <= 22) return 4;
        else return 5;
    }

    private string GetStressDescription(int level)
    {
        switch(level)
        {
            case 1: return "매우 안정된 상태";
            case 2: return "안정된 상태";
            case 3: return "보통 상태";
            case 4: return "스트레스 높음";
            case 5: return "매우 높은 스트레스";
            default: return "알 수 없음";
        }
    }

    //private IEnumerator MoveSceneAfterDelay(int stressLevel, float delay)
    //{
    //    yield return new WaitForSeconds(delay);
    //    StressLevelSceneMgr.Instance.MoveToSceneByStressLevel(stressLevel);
    //}

}