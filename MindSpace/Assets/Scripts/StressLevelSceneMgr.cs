using UnityEngine;
using UnityEngine.SceneManagement; 

public class StressLevelSceneMgr : MonoBehaviour
{
    // 씬 이름은 Build Settings에 등록한 이름과 동일하게
    [Header("씬 이름 설정")]
    public string meditationScene = "MeditationScene";   // Level 1~2
    public string natureScene = "NatureScene";  // Level 3~4
    public string spaceScene = "SpaceScene";    // Level 5

    public static StressLevelSceneMgr Instance;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
            DontDestroyOnLoad(gameObject);  // 씬 이동해도 유지
        }
        else Destroy(gameObject);
    }

    public void MoveToSceneByStressLevel(int stressLevel)
    {
        string targetScene = GetSceneByLevel(stressLevel);

        Debug.Log($"스트레스 레벨 {stressLevel} -> {targetScene} 이동");
        SceneManager.LoadScene(targetScene);
    }

    private string GetSceneByLevel(int level)
    {
        switch(level)
        {
            case 1:
            case 2: return meditationScene;
            case 3: 
            case 4: return natureScene;
            case 5: return spaceScene;
            default: return meditationScene;
        }
    }

}