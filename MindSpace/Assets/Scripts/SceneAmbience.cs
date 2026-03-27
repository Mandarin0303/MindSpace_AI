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
    //public Material skyboxMaterial;

    private float _originalVolume = 1f;     // BGM 원본 볼륨(페이드 복원용)

    private void Start()
    {
        // BGM 재생
        if(bgmSource != null && bgmClip != null)
        {
            bgmSource.clip = bgmClip;
            bgmSource.loop = true;
            bgmSource.Play();
            _originalVolume = bgmSource.volume;
        }

        // 라이트 색상
        if( directionalLight != null)
        {
            directionalLight.color = lightColor;
            directionalLight.intensity = lightIntensity;

        }
        
        // 스카이박스
        //if(skyboxMaterial != null)
        //{
        //    RenderSettings.skybox = skyboxMaterial;
        //    DynamicGI.UpdateEnvironment();
        //}
    }

    // HMDHandler에서 호출: BGM 페이드 아웃
    public void StartFadeOutBGM(float duration)
    {
        if (bgmSource == null) return;
        StopAllCoroutines();
        StartCoroutine(FadeOutCoroutine(duration));
    }
    // HMDHandler에서 호출: BGM 페이드 인 (재착용 시 복구)
    public void StartFadeInBGM(float duration)
    {
        if (bgmSource == null) return;
        StopAllCoroutines();
        if (!bgmSource.isPlaying) bgmSource.Play();
        StartCoroutine(FadeInCoroutine(duration));
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
        bgmSource.Pause();  // Stop 대신 Pause -> 재게 시 자연스럽게 이어짐
    }
    private IEnumerator FadeInCoroutine(float duration)
    {
        bgmSource.volume = 0f;
        for(float t=0; t<duration; t += Time.deltaTime)
        {
            bgmSource.volume = Mathf.Lerp(0f, _originalVolume, t / duration);
            yield return null;
        }
        bgmSource.volume = _originalVolume;
    }
    
  
}
