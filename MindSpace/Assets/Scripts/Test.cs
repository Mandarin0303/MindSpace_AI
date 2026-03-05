using UnityEngine;

public class Test : MonoBehaviour
{
    void Start()
    {
        Debug.Log($"감지된 마이크 수: {Microphone.devices.Length}");
        foreach (string device in Microphone.devices)
            Debug.Log("마이크: " + device);
    }
}