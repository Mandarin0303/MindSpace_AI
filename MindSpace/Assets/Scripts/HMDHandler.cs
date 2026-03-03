using UnityEngine;
using System.Collections;   // 코루틴을 위해 필요
using Firebase;
using Firebase.Database;
using Firebase.Extensions;

public class HMDHandler : MonoBehaviour
{
    public AudioSource guideAudio;  // 유니티 에디터에서 음성 파일 연결용
    public SceneAmbience ambienceManager;

    private DatabaseReference dbReference;  // Firebase 변수 추가
    private float unmountTimer = 0f;
    private bool isTransitioned = false;    // 이미 수면 단계로 넘어갔는지 체크

    private void Start()
    {
        // 초기화 시작 로그
        Debug.Log("Firebase 초기화 시도중...");

        FirebaseApp.CheckAndFixDependenciesAsync().ContinueWithOnMainThread(task =>
        {
            DependencyStatus dependencyStatus = task.Result;
            if (dependencyStatus == DependencyStatus.Available)
            {
                // URL 명시적 설정
                string myDatabaseUrl = "https://mindspace-vr-default-rtdb.firebaseio.com/";

                //AppOptions를 사용해 주소를 직접 명시한다.
                 AppOptions options = new AppOptions
                    {
                         DatabaseUrl = new System.Uri(myDatabaseUrl)
                     };

                //앱 인스턴스 생성( 중복방지)
                FirebaseApp app;
                try
                {
                    app = FirebaseApp.Create(options, "mindspace-app");
                }
                catch(System.Exception)
                {
                    // 이미 같은 이름의 앱이 존재하면 가져다 씀.
                    app = FirebaseApp.GetInstance("mindspace-app");
                    Debug.Log("기존 Firebase앱 인스턴스 재사용");
                }

                // 가장 중요한 Reference 설정
                dbReference = FirebaseDatabase.GetInstance(app).RootReference;
                dbReference.Child("status").Child("isWearing").SetValueAsync(true);

                if(dbReference != null)
                {
                    Debug.Log("<color=blue> Firebase 연결 최초 성공!</color>");
                }
                else
                {
                    Debug.LogError("dbReference 설정 실패!");
                }

            }
            else
            {
                Debug.LogError($"Firebase 초기화 실패 : {dependencyStatus}");
            }
        });
    }
    private void Update()
    {
        // OVRManager가 살아있는지 + 유저가 없는지 동시에 체크
        // 에디터 테스트 시에는 센서가 민감하므로 조건을 더 추가한다.
        // OVRPlugin.userPresent: HMD를 쓰고 있으면 true, 벗으면 false
        bool isUserAbsent = !OVRPlugin.userPresent;

        // 1. 기기를 벗엇는지 감지
        if (isUserAbsent)
        {
            unmountTimer += Time.deltaTime;

            // 테스트 중에는 3초가 짧을 수 있으니 5초로 늘려보기.
            if(unmountTimer >= 5f && !isTransitioned)
            {
                ExecuteSleepStep();
            }
        }
        else
        {
            //--- [ 수정 및 추가된 부분 시작 ] ---

            // 기기를 다시 썼을 때
            unmountTimer = 0f;

            // 이미 수면 상태(false)로 넘어갔던 상태라면 다시 착용 상태(true)로 복구
            if(isTransitioned)
            {
                isTransitioned = false; // 상태 플래그 초기화

                if(dbReference != null)
                {
                    //Firebase의 status/isWearing을 다시 true로 변경
                    dbReference.Child("status").Child("isWearing").SetValueAsync(true).ContinueWithOnMainThread(task =>
                    {
                        if (task.IsCompleted)
                        {
                            Debug.Log("<color=green>기기 착용 감지: Firebase를 true로 복구했습니다.</color>");
                        }
                    });
                }

                // 선택사항 다시 썼을 때 배경음을 다시 키우고 싶다면 여기에 추가.
                if(ambienceManager != null)
                {
                    //ambienceManager.StartFadeInBGM(1.0f);   // 페이드인 함수가 있다면 호출
                }
            }

            // ---[수정 및 추가된 부분 끝]---
        }
    }

    private void ExecuteSleepStep()
    {
        Debug.Log("ExecuteSleepStep 진입");

        if(dbReference == null)
        {
            Debug.Log("<color=red>비상! dbReference가 null입니다. Firebase가 연결되지 않았습니다.</color>");
            return;
            // 여기서 return;을 해서 더 이상 진행 안 되게 막아야 한다.
        }
        else
        {
            Debug.Log("dbReference 정상확인. 전송 시도 시작...");
        }

        isTransitioned = true;
        Debug.Log("========5초 유지 성공! 수면 모드 진입");

        // 1. 배경음 페이드 아웃 (Ambience 매니저에게 명령)
        if(ambienceManager != null)
        {
            ambienceManager.StartFadeOutBGM(3.0f);  // 3초 동안 소리 줄임
        }

        // 2. 안내 음성 재생
        if(guideAudio != null)
        {
            guideAudio.Play();
            // 오디오가 재생 중인지 콘솔로 한 번 더 확인
            Debug.Log("음성 파일 재생 여부: " + guideAudio.isPlaying);
        }

        // TODO: 다음 단계인 Firebase 데이터 전송 함수 호출 자리.
        // 3. Firebase 데이터 전송 (추가된 부분)
        if(dbReference != null)
        {
            Debug.Log("서버로 데이터 쏘기 직전...");

            // .Child("isAsleep").SetValueAsync(true)가 정상 작동하려면
            // Firebase 콘솔의 Rules(규칙)이 true로 되어 있어야 한다.
            dbReference.Child("status").Child("isWearing").SetValueAsync(false).ContinueWithOnMainThread(task =>
            {
                if (task.IsCompleted)
                {
                    Debug.Log("<color=blue>데이터 전송 성공!</color>");
                }
                else
                {
                    Debug.LogError("Firebase 전송 실패: " + task.Exception);
                }
            });

            Debug.Log("SetValueAsync 함수 자체는 실행 완료됨.");

            // 추가로 스트레스 수치도 서버에 기록해보자 (예시, 1단계 성공 기념)
            dbReference.Child("status").Child("stressLevel").SetValueAsync(1);
        }
    }
}