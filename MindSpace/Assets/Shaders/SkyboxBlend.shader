Shader "Custom/SkyboxDiagonalBlend"     // 셰이더 이름, 경로
{
    // 꼭짓점 위치 > (vert) > 방향벡터 + 화면좌표 > (frag) > 사선 경계 계산 > A/B 큐브맵 혼합 > 픽셀 색상

    // properties: 유니티 인스펙터에 노출되는 설정값
    Properties
    {
        _TexA ("Sky A", Cube ) = "grey" {}      // 전환 시작 큐브맵 텍스처(From)
        _TexB("Sky B", Cube) ="grey" {}         // 전환 끝 큐브맵 텍스처(To)
        _Blend("Blend", Range(0,1)) = 0         // 전환 진행도 (0=A만 보임, 1=B만 보임)
        _Exposure("Exposure", Range(0,2)) = 1   // 하늘 전체 밝기
        _Rotation("Rotation", Range(0, 360)) = 0 // 하늘 Y축 회전 (큐브맵 방향 조정)
        _WipeAngle("Wipe Angle (deg)", Range(0,360)) = 225   // 사선 각도 (45 = 대각선, 90=수평, 0=수직)
        _WipeSoftness("Wipe Softness", Range(0.001, 0.5)) = 0.02     // 경계선 부드러움 (클수록 흐릿)
    }

    SubShader
    {
        // Queue=Background : 다른 오브젝트보다 가장 먼저 그려짐 (하늘이니까)
        // PreviewType=Skybox: 머티리얼 미리보기를 구체 대신 스카이박스로 표시
        Tags {"Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox"}
        Cull Off    // 큐브 안쪽에서 보이도록 뒷면 컬링 끄기
        ZWrite Off  // 하늘은 깊이버퍼에 안 씀(다른 오브젝트가 하늘 앞에 오도록)

        Pass
        {
            CGPROGRAM
            #pragma vertex vert     // vert 함수를 버텍스 셰이더로 사용
            #pragma fragment frag   // frag 함수를 프래그먼트 셰이더로 사용
            #include "UnityCG.cginc" // 유니티 기본 셰이더 유틸리티 함수 포함

            // Properties에서 선언한 값들을 셰이더 코드에서 쓰기 위한 변수 선언
            samplerCUBE _TexA;
            samplerCUBE _TexB;
            float _Blend;
            float _Exposure;
            float _Rotation;
            float _WipeAngle;
            float _WipeSoftness;

            // 버텍스 셰이더 입력 구조체(메시의 각 꼭짓점 정보)
            struct appdata
            {
                float4 vertex : POSITION;  // 꼭짓점의 로컬 좌표
            };

            // 버텍스 -> 프래그먼트로 넘겨주는 데이터
            struct v2f
            {
                float4 pos: SV_POSITION;    // 클립 공간 좌표 (CPU가 화면에 그릴 위치)
                float3 dir : TEXCOORD0;     // 큐브맵 샘플링에 쓸 방향 벡터
                float2 screen : TEXCOORD1;  // 화면 공간 좌표 (-1~1), 사선 계산에 사용
             };

            // 큐브맵 Y축 기준으로 회전시키는 함수
            // 회전행렬 공식 : x' = cos*x + sin*z, z' = -sin*x +cos*z
            float3 RotateY(float3 v, float deg)
            {
                float rad = deg * UNITY_PI / 180.0;     // 도(degree) -> 라디안 변환
                float s = sin(rad), c = cos(rad);
                return float3(c*v.x + s*v.z, v.y, -s*v.x +c*v.z);
                
            }

            // 버텍스 셰이더 : 꼭짓점마다 실행됨
            // 역할 - 3D 위치를 화면 좌표로 변환하고, 필요한 값 프래그먼터로 전달
            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);     // 로컬 좌표 -> 클립 좌표 변환
                o.dir = v.vertex.xyz;                       // 스카이박스 메시는 원점 중심이라 꼭짓점 위치 자체가 방향벡터가 됨

                // 클립좌표를 w로 나누면 -1~1 범위의 화면 좌표(NDC)가 됨
                o.screen = o.pos.xy / o.pos.w;
                return o;
             }

             // 프래그먼트 셰이더 : 픽셀마다 실행됨
             // 역할 - 실제 픽셀 색상을 결정
             fixed4 frag(v2f i) : SV_Target
             {
                 // 방향 벡터를 정규화(길이=1)하고 Y축 회전 적용
                 float3 dir = RotateY(normalize(i.dir), _Rotation);

                 // 각 큐브맵에서 이 방향의 색상을 가져오고 밝기 적용
                 fixed4 colA = texCUBE(_TexA, dir) * _Exposure;
                 fixed4 colB = texCUBE(_TexB, dir) * _Exposure;

                 // 사선 와이프 경계 계산
                 //_WipeAngle 방향의 법선벡터로 화면 투영
                 float rad = _WipeAngle * UNITY_PI / 180.0;
                 float2 wipeDir = float2(cos(rad), sin(rad));    // 와이프 진행 방향 벡터

                 // 현재 픽셀의 화면 좌표를 와이프 방향에 투영
                 // -> 이 값이 크면 '와이프가 먼저 지나간 쪽', 작으면 '아직 안 지나간 쪽'
                 float proj = dot(i.screen, wipeDir);   // 범위: 약 -1.414 ~ +1.414, -v2 ~ +v2

                 // proj 범위를 [0,1]로 정규화 (대각선 최대 거리 v2 = 1.414)
                 float projN = (proj +1.414) / 2.828;

                 // smoothstep : _Blend 위치를 기준으로 softness 만큼 부드럽게 0->1 전환
                 // projN < _Blend - softness 이면 0 ( A텍스처 )
                 // projN > _Blend + softness 이면 1 ( B텍스처 )
                 float edge = smoothstep(
                     _Blend - _WipeSoftness,
                     _Blend + _WipeSoftness,
                     projN
                  );
                     
                  // edge 값으로 A와 B 색상을 섞어서 최종 픽셀 색상 반환
                  return lerp(colA, colB, edge);
              }
                  ENDCG
         }
     }
 }
                 


    