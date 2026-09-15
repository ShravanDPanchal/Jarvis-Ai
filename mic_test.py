"""
mic_test.py — Microphone Diagnostic Tool
Run this first to find your microphone index.
"""
import sys

# Fix Windows console encoding
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

print("\n" + "="*55)
print("  JARVIS MIC DIAGNOSTIC")
print("="*55)

# Step 1: Check PyAudio
print("\n[1] Checking PyAudio...")
try:
    import pyaudio
    pa = pyaudio.PyAudio()
    print("    OK - PyAudio is installed.")
except ImportError:
    print("    ERROR - PyAudio is NOT installed.")
    print("       Run:  pip install pyaudio")
    print("       Or double-click setup.bat")
    sys.exit(1)
except Exception as e:
    print(f"    ERROR - PyAudio: {e}")
    sys.exit(1)

# Step 2: List all audio input devices
print("\n[2] Audio input devices found on your PC:")
found_inputs = []
for i in range(pa.get_device_count()):
    info = pa.get_device_info_by_index(i)
    if info["maxInputChannels"] > 0:
        found_inputs.append((i, info["name"]))
        print(f"    Index {i}: {info['name']}")

if not found_inputs:
    print("    NO microphone detected!")
    print("       - Plug in a mic or headset and try again.")
    print("       - Or use:  python jarvis.py --text  (keyboard mode)")
    pa.terminate()
    sys.exit(1)

# Step 3: Check SpeechRecognition
print("\n[3] Checking SpeechRecognition...")
try:
    import speech_recognition as sr
    print("    OK - SpeechRecognition is installed.")
except ImportError:
    print("    ERROR - SpeechRecognition not installed.")
    print("       Run:  pip install SpeechRecognition")
    sys.exit(1)

# Step 4: Test each mic
print("\n[4] Testing microphones (speak when prompted)...")

r = sr.Recognizer()
working_index = None

for idx, name in found_inputs:
    print(f"\n    Testing Index {idx}: {name}")
    try:
        with sr.Microphone(device_index=idx) as source:
            r.adjust_for_ambient_noise(source, duration=0.5)
            print(f"      Energy threshold: {r.energy_threshold:.0f}")
            print(f"      >>> SPEAK NOW (5 seconds)...")
            audio = r.listen(source, timeout=5, phrase_time_limit=5)
        text = r.recognize_google(audio)
        print(f"      HEARD: '{text}'")
        working_index = idx
        break
    except sr.WaitTimeoutError:
        print(f"      WARNING - No speech detected (too quiet or wrong device)")
    except sr.UnknownValueError:
        print(f"      WARNING - Audio captured but couldn't understand speech")
        working_index = idx
        break
    except Exception as e:
        print(f"      ERROR: {e}")

print("\n" + "="*55)
if working_index is not None:
    print(f"  WORKING microphone index: {working_index}")
    print(f"\n  ACTION: Open config.py and set:")
    print(f"    MIC_DEVICE_INDEX = {working_index}")
else:
    print("  No working microphone found.")
    print("  Use: python jarvis.py --text  (keyboard-only mode)")
print("="*55 + "\n")

pa.terminate()
