#!/usr/bin/env python3
import json
import numpy as np
from sklearn.cluster import KMeans
import os
import shutil
import sys

# --- CONFIGURATION ---
JSON_FILE = "duration_fix.json"
NUM_CLUSTERS = 3  # We want 3 clusters: Short, Mid, Long
BACKUP_SUFFIX = ".bak"
# ---------------------

def _duration_to_seconds(duration_str):
    """Converts a 'M:SS', 'MM:SS', or 'H:MM:SS' string to seconds.
    Returns 0 for invalid or missing values.
    """
    if not isinstance(duration_str, str):
        return 0
    parts = duration_str.strip().split(':')
    try:
        parts = [int(p) for p in parts]
    except Exception:
        return 0
    if len(parts) == 3:  # H:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    elif len(parts) == 2:  # M:SS
        return parts[0] * 60 + parts[1]
    elif len(parts) == 1 and parts[0] >= 0:
        # If a single number provided, interpret as seconds
        return parts[0]
    return 0

def format_seconds(seconds):
    """Converts seconds back into a human-readable M:SS format."""
    try:
        seconds = int(round(float(seconds)))
    except Exception:
        return "N/A"
    minutes = seconds // 60
    sec = seconds % 60
    return f"{minutes}:{sec:02d}"

def load_json_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_file(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)

def make_backup(path):
    bak = path + BACKUP_SUFFIX
    try:
        shutil.copy2(path, bak)
        print(f"🔁 Backup created at: {bak}")
    except Exception as e:
        print(f"⚠️ Could not create backup: {e}")

def normalize_songs_container(data):
    """Return (songs_list, original_was_list_flag)."""
    if isinstance(data, list):
        return data, True
    if isinstance(data, dict) and "songs" in data and isinstance(data["songs"], list):
        return data["songs"], False
    # If it's an unexpected object, try to detect a top-level array-like value
    # fallback: treat whole object as single song if it resembles a song (has title/video_id)
    if isinstance(data, dict) and ("title" in data or "video_id" in data):
        return [data], True
    return [], True

if __name__ == "__main__":
    print("🚀 Starting K-Means Clustering Script...")

    # 1. Read the Data
    if not os.path.exists(JSON_FILE):
        print(f"❌ FATAL ERROR: JSON file '{JSON_FILE}' not found. Please place '{JSON_FILE}' in this folder.")
        sys.exit(1)

    try:
        data = load_json_file(JSON_FILE)
    except Exception as e:
        print(f"❌ Failed to read '{JSON_FILE}': {e}")
        sys.exit(1)

    songs, was_list = normalize_songs_container(data)
    print(f"✅ Loaded {len(songs)} song entries from '{JSON_FILE}' (was_list={was_list}).")

    # 2. Prepare the Data for Machine Learning
    # Keep mapping of original indices -> songs_with_duration indices
    durations = []
    durations_indices = []  # indices in original songs list that have valid durations
    for idx, s in enumerate(songs):
        sec = _duration_to_seconds(s.get('duration') or s.get('listen') or s.get('length') or "")
        if sec > 0:
            durations.append([sec])
            durations_indices.append(idx)

    if len(durations) == 0:
        print("❌ No valid durations found in JSON. Exiting.")
        sys.exit(1)

    durations_arr = np.array(durations).reshape(-1, 1)

    if len(durations_arr) < NUM_CLUSTERS:
        print("❌ Not enough songs with valid durations to perform clustering.")
        print(f"   Found {len(durations_arr)} valid durations, need at least {NUM_CLUSTERS}.")
        sys.exit(1)

    print(f"🧠 Clustering {len(durations_arr)} durations into {NUM_CLUSTERS} clusters...")

    # 3. Apply the K-Means Algorithm
    try:
        kmeans = KMeans(n_clusters=NUM_CLUSTERS, random_state=42, n_init=10)
        kmeans.fit(durations_arr)
    except Exception as e:
        print(f"❌ KMeans failed: {e}")
        sys.exit(1)

    cluster_centers = kmeans.cluster_centers_.flatten()
    print("✅ K-Means algorithm complete.")

    # 4. Label the Clusters (Short, Mid, Long) by sorting centers
    sorted_idx = list(np.argsort(cluster_centers))
    if len(sorted_idx) < NUM_CLUSTERS:
        print("❌ Unexpected error sorting cluster centers")
        sys.exit(1)

    label_map = {}
    labels_order = ["Short", "Mid", "Long"]
    for i, idx_center in enumerate(sorted_idx):
        # If NUM_CLUSTERS != 3, fallback to generic labels (Cluster 0,1,2)
        if NUM_CLUSTERS == 3:
            label_map[idx_center] = labels_order[i]
        else:
            label_map[idx_center] = f"Cluster-{i}"

    print("\n--- Discovered Clusters ---")
    for i in range(len(sorted_idx)):
        cent_idx = sorted_idx[i]
        pretty = format_seconds(cluster_centers[cent_idx])
        print(f"-> {label_map[cent_idx]}: Avg. duration ~{pretty} ({cluster_centers[cent_idx]:.1f}s)")
    print("---------------------------\n")

    # 5. Update the JSON Data
    # Assign the correct label from kmeans.labels_ to the corresponding songs
    # kmeans.labels_ is aligned with durations_arr order, which matches durations_indices
    for label_idx, original_song_idx in enumerate(durations_indices):
        cluster_label = int(kmeans.labels_[label_idx])
        songs[original_song_idx]['listen'] = label_map.get(cluster_label, f"Cluster-{cluster_label}")

    # For songs with no duration, set listen to "Unknown" if not present
    for i in range(len(songs)):
        if not songs[i].get('listen'):
            songs[i]['listen'] = "Unknown"

    # write back preserving original structure
    # create backup first
    try:
        make_backup(JSON_FILE)
    except Exception as e:
        print(f"⚠️ Backup step warning: {e}")

    output_obj = songs if was_list else {"songs": songs}
    try:
        save_json_file(JSON_FILE, output_obj)
    except Exception as e:
        print(f"❌ Failed to write updated JSON: {e}")
        sys.exit(1)

    print(f"🎉 --- Clustering Complete! --- 🎉")
    print(f"✅ Successfully updated '{JSON_FILE}' with 'listen' categories for each song.")
