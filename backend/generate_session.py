import os
import asyncio
from pyrogram import Client
from dotenv import load_dotenv

load_dotenv()

API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

if not API_ID or not API_HASH:
    print("❌ ERROR: API_ID or API_HASH not found in .env file.")
    exit(1)

async def main():
    print("\n" + "="*60)
    print("🔑 TELEGRAM STRING SESSION GENERATOR")
    print("="*60 + "\n")
    print("Follow the prompts below to log into your account.")
    print("You will receive a code in your Telegram app (or via SMS).\n")
    
    # We use in_memory=True so it doesn't try to read/write a physical .session file
    app = Client("my_account", api_id=int(API_ID), api_hash=API_HASH, in_memory=True)
    
    await app.start()
    session_string = await app.export_session_string()
    
    print("\n\n" + "="*60)
    print("✅ SUCCESS! Copy the string below:")
    print("="*60 + "\n")
    print(session_string)
    print("\n" + "="*60)
    print("Keep this SECRET! Treat it like a password.")
    print("Add it to your Railway (or Render/VPS) Environment Variables as:")
    print("TELEGRAM_STRING_SESSION=your_huge_string_here\n")
    
    await app.stop()

if __name__ == "__main__":
    asyncio.run(main())
