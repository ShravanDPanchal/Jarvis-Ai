import os
import datetime
import webbrowser
import pyautogui
import speech_recognition as sr
import pyttsx3

from openai import OpenAI
from deep_translator import GoogleTranslator


import brain
import config
import voice

# =========================
# VOICE ENGINE & LISTEN
# =========================


def speak(text):
    return voice.speak(text)


def listen():
    return voice.listen()



# =========================
# AI BRAIN
# =========================


def ask_ai(prompt):
    try:
        return brain.ask(prompt)
    except Exception as e:
        error_str = str(e)
        if "402" in error_str or "Insufficient Balance" in error_str:
            return "My AI brain is offline because the DeepSeek account has insufficient balance. Please top up at platform.deepseek.com or set AI_PROVIDER to 'groq' in config.py."
        return f"I encountered an error connecting to my AI brain: {error_str}"



# =========================
# PC CONTROL
# =========================


def control_pc(command):


    if "open chrome" in command:

        os.startfile(
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        )

        return "Opening Chrome"


    elif "youtube" in command:

        webbrowser.open(
            "https://youtube.com"
        )

        return "Opening Youtube"


    elif "time" in command:

        return datetime.datetime.now().strftime(
            "%I:%M %p"
        )


    elif "screenshot" in command:

        image = pyautogui.screenshot()

        image.save(
            "screenshot.png"
        )

        return "Screenshot saved"


    return None



# =========================
# TRANSLATION
# =========================


def translate(text,language):

    return GoogleTranslator(
        source="auto",
        target=language
    ).translate(text)



# =========================
# MAIN LOOP
# =========================

if __name__ == "__main__":
    speak(
        "Hello, I am Jarvis. How can I help you?"
    )

    while True:

        command = listen()

        if command=="":

            continue

        if "exit" in command or "shutdown jarvis" in command:
            speak("Goodbye")
            break

        # Standalone STOP command handling
        if command in ["stop", "ruko", "roko", "bas", "chup", "quiet", "cancel", "pause", "shh", "wait"]:
            speak("Standing by.")
            continue

        pc_response = control_pc(command)

        if pc_response:
            stopped = speak(pc_response)
        else:
            answer = ask_ai(command)
            stopped = speak(answer)

        if stopped:
            speak("Stopped. What would you like to chat about next?")