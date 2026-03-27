using UnityEngine;
using UnityEngine.Rendering;
using System;

// 현재 시간에 따라 태양 위치, 하늘색, 조명 자동으로 변경.
// 새벽/낮/일몰/밤 - 4단계 하늘 전환
public class DynamicskyController : MonoBehaviour

{
    [Header("----- 스카이박스 텍스처(4개) -----")]
    public Cubemap nightSky;        // 밤 
    public Cubemap dawnSky;         // 새벽
    public Cubemap daySky;          // 낮 
    public Cubemap sunsetSky;       // 일몰

    [Header("--- 태양 / 조명 ---")]
    public Light sunLight;      // Directional Light 여기에
    public GameObject sunDisc;  // 선택] 태양 구체

    [Header("--- 스카이박스 머티리얼 ---")]
    public Material skyboxMaterial;     // SkyboxMat 여기에
    //public AnimationCurve dayNightBlend;    // 낮,밤 전환 곡선

    [Header("--- 시간 설정 ---")]
    [Range(0f, 24f)]
    public float timeOfDay = 12f;
    public bool useRealTime = true;     // true면 현재 시간 사용
    public float timeScale = 1f;        // 시간 흐르는 속도 (테스트용,1=실시간, 60=1분이 1초)

    [Header("--- 밤하늘 밝기 ---")]
    [Range(0.05f, 1f), Tooltip("밤 Exposure(별이 잘 보일려면 0.3-0.5)")]
    public float nightExposure = 0.4f;
    [Range(0f, 1f), Tooltip("밤 환경광 강도(별빛 반사)")]
    public float nightAmbientIntensity = 0.25f;

    [Header("--- 별 ---")]
    public ParticleSystem stars;        // 별 파티클 시스템(선택사항)

    // ----- 시간 구간 정의
    //밤: 00:00 -05:30 / 20:30 - 24:00
    //새벽: 05:30 - 07:30
    //낮: 07:30 - 17:30
    //일몰: 17:30 - 20:30

    private const float DAWN_START = 5.5f;
    private const float DAY_START = 7.5f;
    private const float SUNSET_START = 17.5f;
    private const float NIGHT_START = 20.5f;

    private void Start()
    {
        ValidateShader();

        if(useRealTime)
        {
            SyncRealTime();
        }
        ApplySky();
    }

    private void Update()
    {
        if(useRealTime)
        {
            SyncRealTime();
        }
        else
        {
            // 수동 시간 흐름
            timeOfDay += Time.deltaTime * timeScale / 3600f * 24f;
            if(timeOfDay >= 24f)
            {
                timeOfDay -= 24f;
            }
        }

        ApplySky();
    }

    private void SyncRealTime()
    {
        // 실제 현재 시각으로 초기화
        DateTime now = DateTime.Now;
        timeOfDay = now.Hour + now.Minute / 60f + now.Second / 3600f;
    }

    // ----- 셰이더 검증 (시작 시 한 번) -----
    private void ValidateShader()
    {
        if (skyboxMaterial == null) return;
        if (!skyboxMaterial.HasProperty("_BlendCubemap"))
        {
            Debug.LogWarning("[DynamicSky] skyboxMaterial의 Shader가 'Skybox/Cubemap Blend'가 아닙니다.\n" + "머터리얼 선택 -> Shader -> Skybox -> Cubemap Blend로 변경해주세요.");
        }
    }

    private void ApplySky()
    {
        UpdateSkyBlend();
        UpdateSunLight();
        UpdateSunDisc();
        UpdateAmbientLight();
        UpdateStars();
        DynamicGI.UpdateEnvironment();
    }
    // -----  하늘 블렌딩 -----
    void UpdateSkyBlend()
    {
        if (skyboxMaterial == null) return;

        float t = timeOfDay;
        Cubemap fromTex, toTex;
        float blend, exposure;

        // 밤(00:00-05:30 / 20:30-24:00)
        if (t < DAWN_START || t >= NIGHT_START)
        {
            fromTex = nightSky;
            toTex = nightSky;
            blend = 0;
            exposure = nightExposure;
        }

        // 새벽 전환(05:00-06:15 / 06:15-07:30)
        else if (t < DAWN_START)
        {
            float mid = (DAWN_START + DAY_START) * 0.5f; // 06:15

            if (t < mid)
            {
                fromTex = nightSky;
                toTex = dawnSky != null ? dawnSky : daySky;
                blend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(DAWN_START, mid, t));
                exposure = Mathf.Lerp(nightExposure, 0.65f, blend);
            }
            else
            {
                fromTex = dawnSky != null ? dawnSky : nightSky;
                toTex = daySky;
                blend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(mid, DAY_START, t));
                exposure = Mathf.Lerp(0.65f, 1.0f, blend);
            }
        }

        // 낮(07:30-17:30)
        else if(t<SUNSET_START)
        {
            fromTex = daySky;
            toTex=daySky;
            blend = 0f;
            exposure = 1.0f;
        }

        // 일몰 전환(17:30-19:00 / 19:00-20:30)
        else
        {
            float mid = (SUNSET_START + NIGHT_START) * 0.5f;    // 19:00

            if( t<mid)
            {
                fromTex = daySky;
                toTex = sunsetSky != null ? sunsetSky : nightSky;
                blend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(SUNSET_START, mid, t));
                exposure = Mathf.Lerp(1.0f, 0.6f, blend);
            }
            else
            {
                fromTex = sunsetSky != null ? sunsetSky : daySky;
                toTex = nightSky;
                blend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(SUNSET_START, mid, t));
                exposure = Mathf.Lerp(0.6f, nightExposure, blend);
            }
        }

        // 머터리얼에 적용
        if(fromTex != null)
        {
            skyboxMaterial.SetTexture("_Tex", fromTex);
        }
        if(toTex != null)
        {
            skyboxMaterial.SetTexture("_BlendCubemap", toTex);
        }

        skyboxMaterial.SetFloat("_Blend", blend);
        skyboxMaterial.SetFloat("_Exposure", exposure);
    }

    // ----- 태양 위치 & 색상 -----
    private void UpdateSunLight()
    {
        if (sunLight == null) return;

        float t = timeOfDay;
        bool isNight = t < DAWN_START || t >= NIGHT_START;

        // 밤엔 끄기
        sunLight.enabled = !isNight;
        if (isNight) return;

        // 태양 각도 계산
        // DAWN_START(5시)에 지평선(-10도), 12시에 머리 위(80도),
        // NIGHT_START(02:30)에 다시 지평선
        float normalized = Mathf.InverseLerp(DAWN_START, NIGHT_START, t);
        float pitchAngle = Mathf.Sin(normalized * Mathf.PI) * 80f - 5f;
        sunLight.transform.rotation = Quaternion.Euler(pitchAngle, -30f, 0f);

        // 시간대별 색상 & 강도
        if(t<DAY_START)
        {
            // 새벽 - 아침 : 주항 -> 흰빛
            float b = Mathf.InverseLerp(DAWN_START, DAY_START, t);
            sunLight.color = Color.Lerp(new Color(1f, 0.45f, 0.1f), new Color(1f, 0.92f, 0.75f), b);
            sunLight.intensity = Mathf.Lerp(0.1f, 1.1f, b);
        }
        else if(t<SUNSET_START)
        {
            // 낮: 밝고 따뜻한 흰빛
            sunLight.color = new Color(1f, 0.95f, 0.82f);
            sunLight.intensity = 1.2f;
        }
        else
        {
            // 일몰: 붉은 주황빛 -> 꺼짐
            float b = Mathf.InverseLerp(SUNSET_START, NIGHT_START, t);
            sunLight.color = Color.Lerp(new Color(1f, 0.5f, 0.08f), new Color(0.5f, 0.1f, 0.05f), b);
            sunLight.intensity = Mathf.Lerp(1.0f, 0f, b);
        }

    }

    // 선택 ] 태양처럼 보이는 빛나는 구체
    private void UpdateSunDisc()
    {
        if (sunDisc == null || sunLight == null) return;

        bool isNight = timeOfDay < DAWN_START || timeOfDay >= NIGHT_START;
        sunDisc.SetActive(!isNight);

        if(!isNight)
        {
            // 태양과 같은 방향으로 멀리 배치 ( 500m )
            sunDisc.transform.position = -sunLight.transform.forward * 500f;

            sunDisc.transform.LookAt(Vector3.zero);
        }
    }

    // ----- 별 파티클 -----
    private void UpdateStars()
    {
        if (stars == null) return;

        float t = timeOfDay;
        bool isNight = t < DAWN_START || t >= NIGHT_START;

        if(isNight)
        {
            if (!stars.isPlaying) stars.Play();

            // 새벽 직전 0.5시간 페이드 아웃
            float alpha = 1f;
            if( t>= DAWN_START - 0.5f && t < DAWN_START)
            {
                alpha = Mathf.InverseLerp(DAWN_START, DAWN_START - 0.5f, t);
            }

            var main = stars.main;
            Color starColor = main.startColor.color;
            starColor.a = alpha;
            main.startColor = starColor;
        }
        else
        {
            if (stars.isPlaying) 
            { 
                stars.Stop(); 
            }
        }
    }

    // ----- 환경광 -----
    private void UpdateAmbientLight()
    {
        float t = timeOfDay;

        // 낮 = 밝은 하늘색, 밤 = 어두운 남색
        Color nightAmbient = new Color(0.05f, 0.06f, 0.15f) * nightAmbientIntensity; ;
        Color dawnAmbient = new Color(0.2f, 0.22f, 0.45f);
        Color dayAmbient = new Color(0.52f, 0.62f, 0.82f);
        Color sunsetAmbient = new Color(0.42f, 0.2f, 0.1f);

        Color ambient;

        if(t<DAWN_START || t>=NIGHT_START)
        {
            ambient = nightAmbient;
        }
        else if(t <DAY_START)
        {
            ambient = Color.Lerp(nightAmbient, dayAmbient, Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(DAWN_START, DAY_START, t)));
        }
        else if(t<SUNSET_START)
        {
            ambient = dayAmbient;
        }
        else
        {
            ambient = Color.Lerp(sunsetAmbient, nightAmbient, Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(SUNSET_START, NIGHT_START, t)));
        }

        RenderSettings.ambientLight = ambient;
    }

    
    // 인스펙터에서 시간 슬라이드 움질일 때 에디터에서도 미리보기 가능
    private void OnValidate()
    {
        if (!Application.isPlaying) return;
        ApplySky();
    }
}
