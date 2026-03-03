using UnityEngine;
using TMPro;
using Unity.VisualScripting;

public class BreathingUI : MonoBehaviour
{
    [Header("TMP 텍스트 연결")]
    public TextMeshProUGUI rpmText;
    public TextMeshProUGUI stressLevelText;
    public TextMeshProUGUI statusText;

    [Header("결과 패널")]
    public GameObject resultPanel;

    private void Start()
    {
        // 처음에는 숨김
        resultPanel.SetActive(false);
    }
    public void ShowResult(float rpm, int stressLevel, string description)
    {
        resultPanel.SetActive(true);

        rpmText.text = $"호홉수: {rpm} 회/분";
        stressLevelText.text = $"스트레스 레벨: {stressLevel / 5}";
        statusText.text = description;
    }
}