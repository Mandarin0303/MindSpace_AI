using System.Collections;
using UnityEngine;
using UnityEngine.Rendering;

public class SceneAmbience : MonoBehaviour
{
    [Header("BGM")]
    public AudioSource bgmSource;
    public AudioClip bgmClip;    

    [Header("Directional Light")]
    public Light directionalLight;
    public Color lightColor;
    public float lightIntensity = 1f;

    [Header("skybox material")]
    public Material skyboxMaterial; 

    private void Start()
    {
        // BGM 재생
        if(bgmSource != null && bgmClip != null)
        {
            bgmSource.clip = bgmClip;
            bgmSource.loop = true;
            bgmSource.Play();
        }

        // 라이트 색상
        if( directionalLight != null)
        {
            directionalLight.color = lightColor;
            directionalLight.intensity = lightIntensity;

        }
        
        // 스카이박스
        if(skyboxMaterial != null)
        {
            RenderSettings.skybox = skyboxMaterial;
            DynamicGI.UpdateEnvironment();
        }
    }

    // 외부(HMDHandler)에서 호출할 페이드 아웃 함수
    public void StartFadeOutBGM(float duration)
    {
        if(bgmSource != null)
        {
            StartCoroutine(FadeOutCoroutine(duration));
        }
    }

    private IEnumerator FadeOutCoroutine(float duration)
    {
        float startVolume = bgmSource.volume;
        for(float t=0; t<duration; t += Time.deltaTime)
        {
            bgmSource.volume = Mathf.Lerp(startVolume, 0, t / duration);
            yield return null;
        }
        bgmSource.volume = 0;
        bgmSource.Stop();
    }
  
}
