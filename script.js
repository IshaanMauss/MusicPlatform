// ============================================
// 1. GLOBAL VARIABLES & CONFIGURATION
// ============================================
let allSongs = [];
let currentFilteredSongs = [];
let currentLimit = 50;
const LOAD_CHUNK = 50;
const SERVER_URL = "https://music-backend-service.onrender.com";

// DOM ELEMENTS
const homeView = document.getElementById('home-view');
const secondaryView = document.getElementById('secondary-view');
const songsContainer = document.getElementById('songs-container'); 
const listContainer = document.getElementById('list-container');   
const playlistsRow = document.getElementById('playlists-row');
const viewTitle = document.getElementById('view-title');
const likedActions = document.getElementById('liked-actions');
const songCountLabel = document.getElementById('song-count');

// Buttons & Inputs
const backBtn = document.getElementById('back-home-btn');
const likedViewBtn = document.getElementById('liked-view-btn');
const resetBtn = document.getElementById('reset-btn');
const deleteSelBtn = document.getElementById('delete-selected-btn');
const deleteAllBtn = document.getElementById('delete-all-btn');
const searchInput = document.getElementById('search-input');
const lengthFilter = document.getElementById('length-filter');
const genreFilter = document.getElementById('genre-filter');
const artistFilter = document.getElementById('artist-filter');

// Player Elements
const audioPlayer = document.getElementById('audio-element');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const playerCover = document.getElementById('player-cover');
const likeBtn = document.getElementById('like-btn');
const toastBox = document.getElementById('toast-box');

// STATE
let likedSongIds = JSON.parse(localStorage.getItem('likedSongs')) || [];
let currentSongId = null;
let selectedForDelete = new Set(); 

// ============================================
// 2. PLAYLIST DATA & DAILY MIX LOGIC
// ============================================

function getDailyMix() {
    const today = new Date();
    const day = today.getDay(); 
    const date = today.getDate();
    const month = today.getMonth();

    if (date === 15 && month === 7) return { 
        id: 'special-ind', name: 'Independence Day 🇮🇳', subtitle: 'Patriotic Vibes', 
        isDaily: true, filter: (s) => (s.title && s.title.toLowerCase().includes('india')) || (s.genre && s.genre.includes('Patriotic'))
    };
    if (date === 26 && month === 0) return { 
        id: 'special-rep', name: 'Republic Day 🇮🇳', subtitle: 'Jai Hind', 
        isDaily: true, filter: (s) => (s.genre && (s.genre.includes('Patriotic') || s.genre.includes('Desh')))
    };

    let config = {};
    switch(day) {
        case 0: config = { name: "Sunday Lo-Fi", subtitle: "Relax & Unwind", tags: ['Sad', 'Lo-fi', 'Acoustic', 'Sufi', 'Slow'] }; break;
        case 1: config = { name: "Monday Motivation", subtitle: "Start Strong", tags: ['Pop', 'Rock', 'Energetic', 'Workout', 'Gym'] }; break;
        case 2: config = { name: "Tuesday Tunes", subtitle: "Feel Good", tags: ['Happy', 'Pop', 'Fun', 'Dance'] }; break;
        case 3: config = { name: "Wednesday Romance", subtitle: "Love is in the Air", tags: ['Romantic', 'Love', 'Soul', 'Soft'] }; break;
        case 4: config = { name: "Throwback Thursday", subtitle: "Old is Gold", tags: ['90s', '80s', 'Retro', 'Old School', 'Classic'] }; break;
        case 5: config = { name: "Friday Party", subtitle: "Weekend Vibes", tags: ['Party', 'Dance', 'Remix', 'Club', 'Pop'] }; break;
        case 6: config = { name: "Saturday Night", subtitle: "Dance Floor Hits", tags: ['Dance', 'Electronic', 'Hip Hop', 'Bass'] }; break;
    }

    return {
        id: 'daily-mix', name: config.name, subtitle: config.subtitle, isDaily: true,
        filter: (s) => {
            const songGenres = Array.isArray(s.genre) ? s.genre : (s.genre ? [s.genre] : []);
            const matchesMood = songGenres.some(g => config.tags.some(tag => g && g.toLowerCase().includes(tag.toLowerCase())));
            if (day === 4 && !matchesMood) return (s.title && s.title.includes('19')) || (s.artist_name && (s.artist_name.includes('Kishore') || s.artist_name.includes('Lata')));
            return matchesMood;
        }
    };
}

const fixedPlaylists = [
    { id: 'kishore', name: 'Best of Kishore Kumar', subtitle: 'The Legend', filter: (s) => s.artist_name && s.artist_name.toLowerCase().includes('kishore') },
    { id: 'bengali', name: 'Bengali Classics', subtitle: 'Golden Era', filter: (s) => (s.genre && s.genre.includes('Bengali')) || s.language === 'Bengali' },
    { id: '90s', name: '90s Hits', subtitle: 'Nostalgia Trip', filter: (s) => (s.title && s.title.includes('90')) || Math.random() > 0.8 }, 
    { id: 'romantic', name: 'Romantic Mood', subtitle: 'Love Songs', filter: (s) => (s.genre && s.genre.includes('Romantic')) || (s.title && s.title.toLowerCase().includes('dil')) },
];

// ============================================
// 3. CORE FUNCTIONS (Load & Render)
// ============================================
async function loadData() {
    try {
        songsContainer.innerHTML = '<div style="color:white; text-align:center; padding-top: 50px;">Loading Universe...</div>';
        const res = await fetch('duration_fix.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        
        let rawData = Array.isArray(data) ? data : (data.songs || []);
        
        allSongs = rawData.map(s => {
            const seconds = parseDurationToSeconds(s.duration);
            return {
                video_id: s.video_id || s.videoId || s.id,
                title: s.title || s.name || 'Untitled',
                artist_name: s.artist_name || s.artist || 'Unknown',
                duration: s.duration || '0:00',
                genre: Array.isArray(s.genre) ? s.genre : (s.genre ? [s.genre] : []),
                language: s.language || 'Hindi',
                _seconds: seconds,
                _lenCluster: s.listen || durationCluster(seconds) 
            };
        });

        currentFilteredSongs = allSongs;
        renderHomeGrid(currentFilteredSongs);
        renderPlaylistsRow();
        populateDropdowns();
        songCountLabel.textContent = `${allSongs.length} songs found`;

    } catch (err) {
        console.error(err);
        songsContainer.innerHTML = `<div style="color:#ff7676; text-align:center; padding-top:50px;"><h3>Failed to load songs.</h3></div>`;
    }
}

function renderPlaylistsRow() {
    playlistsRow.innerHTML = '';
    const dailyConfig = getDailyMix();
    const allPlaylists = [dailyConfig, ...fixedPlaylists];

    allPlaylists.forEach(pl => {
        let plSongs = allSongs.filter(pl.filter);
        if (pl.isDaily) plSongs = plSongs.slice(0, 25); 
        else plSongs = plSongs.slice(0, 50);

        if (plSongs.length === 0) return;

        const randomIdx = Math.floor(Math.random() * plSongs.length);
        const coverSong = plSongs[randomIdx];
        const coverUrl = `covers_small/${coverSong.video_id}.jpg`;

        const card = document.createElement('div');
        card.className = 'playlist-card';
        card.innerHTML = `
            <img class="playlist-cover" src="${coverUrl}" onerror="this.src='https://placehold.co/220?text=Playlist'">
            <div class="playlist-info">
                <h3>${pl.name}</h3>
                <span>${pl.subtitle || 'Tap to listen'}</span>
            </div>
        `;
        card.onclick = () => openPlaylistView(pl, plSongs);
        playlistsRow.appendChild(card);
    });
}

function renderHomeGrid(songs, append = false) {
    if (!append) songsContainer.innerHTML = '';
    
    if (songs.length === 0) {
        if (!append) songsContainer.innerHTML = '<div style="color:#aaa; text-align:center; width:100%;">No songs found matching criteria.</div>';
        return;
    }

    const chunk = append ? songs : songs.slice(0, currentLimit);
    
    chunk.forEach(song => {
        const card = document.createElement('div');
        card.className = 'card';
        // IMPORTANT: Add ID so we can find it for the ripple effect
        card.dataset.id = song.video_id; 
        
        card.innerHTML = `
            <img loading="lazy" src="covers_small/${song.video_id}.jpg" onerror="this.src='https://placehold.co/400?text=Music'">
            <h3>${song.title}</h3>
            <p>${song.artist_name}</p>
            <div class="tags" style="margin-top: 8px;">
                <span class="tag">${song._lenCluster}</span>
            </div>
        `;
        card.onclick = () => playSong(song);
        songsContainer.appendChild(card);
    });
}

// ============================================
// 4. FILTER LOGIC
// ============================================
function filterSongs() {
    const searchTerm = searchInput.value.toLowerCase();
    const genreVal = genreFilter.value;
    const lengthVal = lengthFilter.value;
    const artistVal = artistFilter.value;

    currentFilteredSongs = allSongs.filter(song => {
        const matchesSearch = (song.title && song.title.toLowerCase().includes(searchTerm)) || 
                              (song.artist_name && song.artist_name.toLowerCase().includes(searchTerm));
        if (!matchesSearch) return false;

        if (genreVal !== 'all') {
            const g = song.genre;
            const matchesGenre = Array.isArray(g) ? g.includes(genreVal) : g === genreVal;
            if (!matchesGenre) return false;
        }

        if (artistVal !== 'all' && song.artist_name !== artistVal) return false;
        if (lengthVal !== 'all' && song._lenCluster !== lengthVal) return false;

        return true;
    });

    currentLimit = 50; 
    songCountLabel.textContent = `${currentFilteredSongs.length} songs found`;
    renderHomeGrid(currentFilteredSongs);
}

searchInput.addEventListener('input', filterSongs);
genreFilter.addEventListener('change', filterSongs);
artistFilter.addEventListener('change', filterSongs);
lengthFilter.addEventListener('change', filterSongs);

resetBtn.addEventListener('click', () => {
    searchInput.value = '';
    genreFilter.value = 'all';
    artistFilter.value = 'all';
    lengthFilter.value = 'all';
    filterSongs();
});

// ============================================
// 5. VIEW SWITCHING, PLAYER & RIPPLE LOGIC
// ============================================
function showHome() {
    homeView.classList.remove('hidden');
    secondaryView.classList.add('hidden');
    likedViewBtn.classList.remove('active');
    window.scrollTo(0, 0);
}

function showSecondaryView(title, isLikedView = false) {
    homeView.classList.add('hidden');
    secondaryView.classList.remove('hidden');
    viewTitle.textContent = title;
    
    if (isLikedView) {
        likedActions.classList.remove('hidden');
        likedViewBtn.classList.add('active');
    } else {
        likedActions.classList.add('hidden');
        likedViewBtn.classList.remove('active');
    }
    window.scrollTo(0, 0);
}

function openPlaylistView(playlistConfig, preFilteredSongs) {
    showSecondaryView(playlistConfig.name, false);
    renderListView(preFilteredSongs, false);
}

function openLikedView() {
    const likedSongs = allSongs.filter(s => likedSongIds.includes(s.video_id));
    showSecondaryView("Liked Songs", true);
    if (likedSongs.length === 0) listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:#aaa;">No liked songs yet. ❤️</div>`;
    else renderListView(likedSongs, true); 
}

function renderListView(songs, showCheckboxes) {
    listContainer.innerHTML = '';
    selectedForDelete.clear();
    songs.forEach(song => {
        const row = document.createElement('div');
        row.className = 'song-row';
        let checkboxHTML = showCheckboxes ? `<input type="checkbox" class="select-box" data-id="${song.video_id}">` : '';
        row.innerHTML = `
            ${checkboxHTML}
            <img src="covers_small/${song.video_id}.jpg" onerror="this.src='https://placehold.co/64?text=Music'">
            <div class="song-row-info"><span class="song-row-title">${song.title}</span><span class="song-row-artist">${song.artist_name}</span></div>
            <span class="song-row-dur">${song.duration}</span>
        `;
        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('select-box')) {
                const id = e.target.getAttribute('data-id');
                e.target.checked ? selectedForDelete.add(id) : selectedForDelete.delete(id);
            } else playSong(song);
        });
        listContainer.appendChild(row);
    });
}

// DELETE & LIKE LOGIC
if (deleteAllBtn) deleteAllBtn.onclick = () => { if (confirm("Delete ALL liked songs?")) { likedSongIds = []; saveLikes(); openLikedView(); } };
if (deleteSelBtn) deleteSelBtn.onclick = () => { if (selectedForDelete.size === 0) return alert("Select songs first!"); likedSongIds = likedSongIds.filter(id => !selectedForDelete.has(id)); saveLikes(); openLikedView(); };

function saveLikes() { localStorage.setItem('likedSongs', JSON.stringify(likedSongIds)); updateHeartIcon(); }

likeBtn.addEventListener('click', () => {
    if (!currentSongId) return;
    const idx = likedSongIds.indexOf(currentSongId);
    idx === -1 ? likedSongIds.push(currentSongId) : likedSongIds.splice(idx, 1);
    showToast(idx === -1 ? "Added to Likes" : "Removed from Likes");
    saveLikes();
    if (!secondaryView.classList.contains('hidden') && viewTitle.textContent === "Liked Songs") openLikedView();
});

function updateHeartIcon() { likedSongIds.includes(currentSongId) ? likeBtn.classList.add('liked') : likeBtn.classList.remove('liked'); }

// INFINITE SCROLL
window.addEventListener('scroll', () => {
    if (!homeView.classList.contains('hidden')) {
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollTop + clientHeight >= scrollHeight - 300) loadMoreSongs();
    }
});

function loadMoreSongs() {
    const start = currentLimit;
    const end = currentLimit + LOAD_CHUNK;
    if (start >= currentFilteredSongs.length) return;
    const nextChunk = currentFilteredSongs.slice(start, end);
    currentLimit += LOAD_CHUNK;
    renderHomeGrid(nextChunk, true);
}

// HELPERS
backBtn.addEventListener('click', showHome);
likedViewBtn.addEventListener('click', () => { likedViewBtn.classList.contains('active') ? showHome() : openLikedView(); });

// ============================================
// PLAYER & RIPPLE TRIGGER
// ============================================
function playSong(song) {
    // 1. Remove ripple from old card
    if (currentSongId) {
        const oldCard = document.querySelector(`.card[data-id="${currentSongId}"]`);
        if (oldCard) oldCard.classList.remove('playing');
    }

    // 2. Set New ID
    currentSongId = song.video_id;

    // 3. Add ripple to new card
    const newCard = document.querySelector(`.card[data-id="${currentSongId}"]`);
    if (newCard) newCard.classList.add('playing');

    // 4. Update Player UI
    playerTitle.textContent = song.title;
    playerArtist.textContent = song.artist_name;
    playerCover.src = `covers_small/${song.video_id}.jpg`;
    audioPlayer.src = `${SERVER_URL}/play/${song.video_id}`;
    audioPlayer.play();
    updateHeartIcon();
}

// Stop Ripple when song ends
audioPlayer.addEventListener('ended', () => {
    if (currentSongId) {
        const card = document.querySelector(`.card[data-id="${currentSongId}"]`);
        if (card) card.classList.remove('playing');
    }
});

function showToast(msg) { toastBox.textContent = msg; toastBox.className = "show"; setTimeout(() => toastBox.className = "", 3000); }
function parseDurationToSeconds(d) { if (!d) return 0; const p = d.split(':'); return p.length === 2 ? (+p[0])*60 + (+p[1]) : 0; }
function durationCluster(s) { if (s < 180) return 'Short'; if (s <= 300) return 'Mid'; return 'Long'; }

function populateDropdowns() {
    const gSet = new Set(), aSet = new Set();
    allSongs.forEach(s => {
        if(s.genre) { Array.isArray(s.genre) ? s.genre.forEach(g => gSet.add(g)) : gSet.add(s.genre); }
        if(s.artist_name) aSet.add(s.artist_name);
    });
    while (genreFilter.options.length > 1) genreFilter.remove(1);
    while (artistFilter.options.length > 1) artistFilter.remove(1);
    Array.from(gSet).sort().forEach(g => { const opt = document.createElement('option'); opt.value = g; opt.textContent = g; genreFilter.appendChild(opt); });
    Array.from(aSet).sort().forEach(a => { const opt = document.createElement('option'); opt.value = a; opt.textContent = a; artistFilter.appendChild(opt); });
}

document.addEventListener('DOMContentLoaded', loadData);