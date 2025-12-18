// ============================================
// 1. GLOBAL VARIABLES & CONFIGURATION
// ============================================
let allSongs = [];
let currentFilteredSongs = [];
let currentLimit = 50;
const LOAD_CHUNK = 50;

// SERVER CONFIGURATION (Your Render URL)
const SERVER_URL = "https://music-backend-service.onrender.com";

// DOM ELEMENTS
const songsContainer = document.getElementById('songs-container');
const songCountLabel = document.getElementById('song-count');
const audioPlayer = document.getElementById('audio-element');

// Player UI Elements
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');
const likeBtn = document.getElementById('like-btn');

// Filters & Search
const searchInput = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-search');
const lengthFilter = document.getElementById('length-filter');
const genreFilter = document.getElementById('genre-filter');
const artistFilter = document.getElementById('artist-filter');
const resetBtn = document.getElementById('reset-btn');
const likedViewBtn = document.getElementById('liked-view-btn');
const toastBox = document.getElementById('toast-box');

// STATE: Liked Songs & Current Song
let likedSongIds = JSON.parse(localStorage.getItem('likedSongs')) || [];
let currentSongId = null;

// ============================================
// 2. LIKE SYSTEM FUNCTIONS
// ============================================
function toggleLike() {
  if (!currentSongId) {
    showToast("Play a song first!");
    return;
  }

  const index = likedSongIds.indexOf(currentSongId);

  if (index === -1) {
    // Add to likes
    likedSongIds.push(currentSongId);
    likeBtn.classList.add('liked');
    showToast("Added to Liked Songs ❤️");
  } else {
    // Remove from likes
    likedSongIds.splice(index, 1);
    likeBtn.classList.remove('liked');
    showToast("Removed from Liked Songs 💔");
  }

  // Save to browser memory
  localStorage.setItem('likedSongs', JSON.stringify(likedSongIds));

  // Refresh view if looking at liked songs
  if (likedViewBtn.classList.contains('active')) {
    filterLikedSongs();
  }
}

function showToast(message) {
  toastBox.textContent = message;
  toastBox.className = "show";
  setTimeout(() => {
    toastBox.className = toastBox.className.replace("show", "");
  }, 3000);
}

function filterLikedSongs() {
  // UI Toggle
  likedViewBtn.classList.add('active');

  // Filter Logic
  const likedSongsObj = allSongs.filter(song => likedSongIds.includes(song.video_id));

  if (likedSongsObj.length === 0) {
    songsContainer.innerHTML = `
            <div style="text-align:center; padding:50px; color:#aaa; width:100%;">
                <h3 style="margin-bottom:10px;">No liked songs yet</h3>
                <p>Tap the heart icon ❤️ while playing a song to save it here.</p>
            </div>`;
    if (songCountLabel) songCountLabel.textContent = "0 songs";
  } else {
    renderSongs(likedSongsObj, false);
  }
}

// ============================================
// 3. HELPER FUNCTIONS
// ============================================
function parseDurationToSeconds(d) {
  if (!d) return 0;
  const parts = d.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function durationCluster(seconds) {
  if (seconds === 0) return 'all';
  if (seconds < 180) return 'Short';
  if (seconds <= 300) return 'Mid';
  return 'Long';
}

// ============================================
// 4. DATA LOADING
// ============================================
async function loadData() {
  try {
    if (songsContainer) songsContainer.innerHTML = '<div style="color:white; padding:20px; text-align:center;">Loading Library...</div>';

    const res = await fetch('duration_fix.json', { cache: "no-store" });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    let rawData = Array.isArray(data) ? data : (data.songs || []);

    if (!rawData.length) throw new Error('No songs found in JSON');

    allSongs = rawData.map(s => {
      const rawDuration = s.listen || s.duration || '';
      const seconds = parseDurationToSeconds(rawDuration);

      return {
        video_id: s.video_id || s.videoId || s.id || '',
        title: s.title || s.name || 'Untitled',
        artist_name: s.artist_name || s.artist || 'Unknown',
        duration: rawDuration,
        genre: Array.isArray(s.genre) ? s.genre : (s.genre ? [s.genre] : []),
        _seconds: seconds,
        _lenCluster: durationCluster(seconds)
      };
    });

    // Initial Render
    currentFilteredSongs = allSongs;
    currentLimit = LOAD_CHUNK;
    renderSongs(currentFilteredSongs, false);

    // Populate dropdowns slightly later to keep UI snappy
    setTimeout(populateDropdowns, 500);

  } catch (err) {
    console.error(err);
    if (songsContainer) songsContainer.innerHTML = `<div style="color:red; padding:20px;">Error: ${err.message}</div>`;
  }
}

// ============================================
// 5. RENDERING & UI
// ============================================
function renderSongs(songsList, append = false) {
  if (!songsContainer) return;

  if (songCountLabel) songCountLabel.textContent = `${songsList.length} songs found`;

  if (!append) {
    songsContainer.innerHTML = '';
    window.scrollTo(0, 0);
  }

  // Pagination Logic
  let startIndex = 0;
  if (append) {
    startIndex = currentLimit - LOAD_CHUNK;
    if (startIndex < 0) startIndex = 0;
  }

  const chunk = songsList.slice(startIndex, currentLimit);

  chunk.forEach(song => {
    const card = document.createElement('div');
    card.className = 'card';
    const coverPath = `covers_small/${song.video_id}.jpg`;

    // Handle Genres
    let genreText = 'Pop';
    if (song.genre && song.genre.length > 0) {
      // Take first 2 genres max to prevent card overflow
      genreText = song.genre.slice(0, 2).join(', ');
    }

    card.innerHTML = `
      <img loading="lazy" src="${coverPath}" alt="${song.title}" onerror="this.src='https://via.placeholder.com/400x400?text=Music'">
      <h3>${song.title}</h3>
      <p>${song.artist_name}</p>
      <div class="tags">
        <div class="tag len">${song.duration || 'N/A'}</div>
        <div class="tag">${genreText}</div>
      </div>
    `;

    // Click Event (Visuals + Audio)
    card.addEventListener('click', () => {
      // 1. Visual Ripple Effect
      const previousActive = document.querySelector('.playing-card');
      if (previousActive) previousActive.classList.remove('playing-card');
      card.classList.add('playing-card');

      // 2. Play Audio
      playSong(song);
    });

    songsContainer.appendChild(card);
  });
}

function populateDropdowns() {
  if (!genreFilter || !artistFilter) return;

  // Use Sets to get unique values
  const gSet = new Set();
  const aSet = new Set();

  allSongs.forEach(s => {
    s.genre.forEach(g => { if (g) gSet.add(g); });
    if (s.artist_name && s.artist_name !== 'Unknown') {
      aSet.add(s.artist_name.trim());
    }
  });

  // Sort and Append
  const sortedGenres = Array.from(gSet).sort();
  const sortedArtists = Array.from(aSet).sort();

  sortedGenres.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    genreFilter.appendChild(opt);
  });

  sortedArtists.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    artistFilter.appendChild(opt);
  });
}

// ============================================
// 6. FILTERING LOGIC
// ============================================
function filterSongs() {
  const term = (searchInput.value || '').toLowerCase();

  // Toggle Clear Button
  if (clearBtn) clearBtn.style.display = term ? 'block' : 'none';

  const selLen = lengthFilter.value;
  const selGenre = genreFilter.value;
  const selArtist = artistFilter.value;

  currentFilteredSongs = allSongs.filter(s => {
    // 1. Text Search
    const title = (s.title || '').toLowerCase();
    const artist = (s.artist_name || '').toLowerCase();
    const matchesSearch = (!term) || title.includes(term) || artist.includes(term);

    // 2. Length (Check both calculated and raw text)
    let matchesLen = true;
    if (selLen !== 'all') {
      const calculated = s._lenCluster;
      const raw = (s.duration || '').toString();
      matchesLen = (calculated === selLen) || (raw === selLen);
    }

    // 3. Genre
    let matchesGenre = true;
    if (selGenre !== 'all') {
      matchesGenre = s.genre.includes(selGenre);
    }

    // 4. Artist
    const matchesArtist = selArtist === 'all' || s.artist_name.includes(selArtist);

    return matchesSearch && matchesLen && matchesGenre && matchesArtist;
  });

  currentLimit = LOAD_CHUNK;
  renderSongs(currentFilteredSongs, false);
}

// ============================================
// 7. AUDIO PLAYER LOGIC
// ============================================
function playSong(song) {
  // Update Global ID
  currentSongId = song.video_id;

  // --- HEART UI UPDATE ---
  // Check if this song is in our liked list
  if (likedSongIds.includes(song.video_id)) {
    likeBtn.classList.add('liked');
  } else {
    likeBtn.classList.remove('liked');
  }

  // Update Player Metadata
  if (playerTitle) playerTitle.textContent = song.title;
  if (playerArtist) playerArtist.textContent = song.artist_name;
  if (playerCover) {
    playerCover.src = `real_covers/${song.video_id}.jpg`;
    playerCover.onerror = () => playerCover.src = 'https://via.placeholder.com/64?text=Music';
  }

  // Play Stream
  // The backend handles redirection, so we can point directly to it
  const streamUrl = `${SERVER_URL}/play/${song.video_id}`;

  if (audioPlayer) {
    audioPlayer.src = streamUrl;
    audioPlayer.play().catch(e => console.error("Playback failed", e));
  }
}

// ============================================
// 8. EVENT LISTENERS
// ============================================

// Filters
searchInput.addEventListener('input', filterSongs);
lengthFilter.addEventListener('change', filterSongs);
genreFilter.addEventListener('change', filterSongs);
artistFilter.addEventListener('change', filterSongs);

// Reset Button
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    lengthFilter.value = 'all';
    genreFilter.value = 'all';
    artistFilter.value = 'all';

    // Reset View Mode
    if (likedViewBtn.classList.contains('active')) {
      likedViewBtn.classList.remove('active');
    }

    filterSongs();
  });
}

// Clear Search X
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    filterSongs();
  });
}

// Like Buttons
if (likeBtn) likeBtn.addEventListener('click', toggleLike);
if (likedViewBtn) {
  likedViewBtn.addEventListener('click', () => {
    if (likedViewBtn.classList.contains('active')) {
      // Go back to Home
      likedViewBtn.classList.remove('active');
      genreFilter.value = 'all';
      filterSongs(); // Re-apply standard filters to full list
    } else {
      // Show Liked
      filterLikedSongs();
    }
  });
}

// Infinite Scroll
window.addEventListener('scroll', () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
    if (currentLimit < currentFilteredSongs.length) {
      currentLimit += LOAD_CHUNK;
      renderSongs(currentFilteredSongs, true);
    }
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', loadData);