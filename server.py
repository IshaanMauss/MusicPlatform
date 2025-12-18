from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import requests
import json
import os
import urllib.parse

app = Flask(__name__)
CORS(app)

# ================= CONFIGURATION =================
# PASTE YOUR BOT TOKEN HERE
BOT_TOKEN = "8504410718:AAG0HPEFFuExIx3LErJlRK-_3wMVelarn9M"
DATABASE_FILE = "songs_db.json"
# =================================================

# Load DB
if os.path.exists(DATABASE_FILE):
    with open(DATABASE_FILE, 'r') as f:
        SONG_DB = json.load(f)
    print(f"Database loaded with {len(SONG_DB)} songs.")
else:
    print("WARNING: songs_db.json not found!")
    SONG_DB = {}

def get_telegram_link(file_id):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}"
    try:
        resp = requests.get(url).json()
        if resp['ok']:
            file_path = resp['result']['file_path']
            return f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
    except:
        return None
    return None

def find_best_match(requested_filename):
    """
    If exact match fails, try to find the song by looking for the Video ID.
    Example: Request 'Chand Sifarish-ZaURV4XxdPI.m4a' matches 'Chand_Sifarish-ZaURV4XxdPI.mp3'
    """
    # 1. Try exact match first
    if requested_filename in SONG_DB:
        return SONG_DB[requested_filename]

    # 2. Try to extract the Video ID (The part after the last dash)
    # Most file formats are: "Title-VIDEOID.ext" or "VIDEOID.ext"
    try:
        # Remove extension (.mp3)
        name_no_ext = os.path.splitext(requested_filename)[0]
        
        # Split by dash and take the last part (The ID)
        if '-' in name_no_ext:
            potential_id = name_no_ext.split('-')[-1]
        else:
            potential_id = name_no_ext

        # Search the database for this ID
        for db_filename, file_id in SONG_DB.items():
            if potential_id in db_filename:
                print(f"Smart Match: Requested '{requested_filename}' -> Found '{db_filename}'")
                return file_id
    except:
        pass

    return None

@app.route('/play/<path:filename>')
def play_music(filename):
    # Decode URL (Convert %20 back to space)
    filename = urllib.parse.unquote(filename)
    
    # Use the Smart Matcher
    file_id = find_best_match(filename)
    
    if not file_id:
        print(f"[404] Could not find: {filename}")
        return jsonify({"error": "Song not found"}), 404

    # Get the fresh link
    direct_url = get_telegram_link(file_id)
    if not direct_url:
        return jsonify({"error": "Failed to get Telegram link"}), 500

    # Stream it
    def generate():
        try:
            with requests.get(direct_url, stream=True) as r:
                for chunk in r.iter_content(chunk_size=4096):
                    yield chunk
        except Exception as e:
            print(f"Stream Error: {e}")

    return Response(generate(), mimetype="audio/mpeg")

if __name__ == '__main__':
    # Use the PORT environment variable provided by Render, or default to 5000
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)