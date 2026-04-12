import google.generativeai as genai
import yaml
import os
from dotenv import load_dotenv

load_dotenv()

class AIHandler:
    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = genai.GenerativeModel('gemini-flash-latest')
        self.persona = self._load_persona()

    def _load_persona(self):
        print(f"📖 [SYSTEM]: Loading persona from persona.yaml...")
        with open("persona.yaml", "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _build_system_prompt(self):
        print(f"🧠 [SYSTEM]: Assembling behavior rules for Ani...")
        traits = ", ".join(self.persona['character_traits'])
        emotions = ", ".join(self.persona['emotion_style'])
        
        prompt = self.persona['base_instructions']
        prompt = prompt.replace("{{name}}", self.persona['name'])
        prompt = prompt.replace("{{traits}}", traits)
        prompt = prompt.replace("{{emotion}}", emotions)
        
        return prompt

    async def generate_response(self, history, new_message):
        system_prompt = self._build_system_prompt()
        
        # Construct message list for Gemini
        messages = [
            {"role": "user", "parts": [system_prompt + "\nInitial context established. I am the owner of this account. Respond naturally to the following users."]}
        ]
        
        # Add history
        for sender, text in history:
            role = "model" if sender == "Me" else "user"
            messages.append({"role": role, "parts": [f"{sender}: {text}"]})
        
        # Add the latest message
        messages.append({"role": "user", "parts": [new_message]})
        
        try:
            response = await self.model.generate_content_async(messages)
            return response.text
        except Exception as e:
            print(f"Error generating AI response: {e}")
            return "I'm having a bit of trouble thinking straight right now. Give me a moment."

ai_handler = AIHandler()
